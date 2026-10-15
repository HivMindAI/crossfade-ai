import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const MAX_RESPONSE_BYTES = 2_048;
export const MAX_PROVIDER_REQUESTS = 5;

class CheckFailure extends Error {
  constructor(stage, operation = "none", category = stage, httpStatus = null) {
    super(category);
    this.stage = stage;
    this.operation = operation;
    this.category = category;
    this.httpStatus = httpStatus;
  }
}

// Load the production Lua verbatim. A copied test script could drift from the guard.
export function extractProductionLua(source) {
  const match = source.match(/const RESERVE_SCRIPT = `([\s\S]*?)`;/);
  if (
    !match ||
    match[1].includes("${") ||
    !match[1].includes('redis.call("GET", KEYS[1])') ||
    !match[1].includes('redis.call("INCR", KEYS[1])') ||
    !match[1].includes('redis.call("EXPIRE", KEYS[1], 3600)')
  )
    throw new CheckFailure("production_script");
  return match[1];
}

export function approvedOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (
      url.protocol === "https:" &&
      url.hostname.endsWith(".upstash.io") &&
      !url.port &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    )
      return url.origin;
  } catch {
    // Never send a token to an invalid origin.
  }
  throw new CheckFailure("origin");
}

async function boundedResult(response, stage, operation, signal) {
  if (!response.body)
    throw new CheckFailure(stage, operation, "response_shape", response.status);
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw new CheckFailure(
        stage,
        operation,
        signal.aborted ? "timeout" : "response_read",
        response.status,
      );
    }
    const { done, value } = chunk;
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      try {
        await reader.cancel();
      } catch {
        // The size violation remains the failure even if cancellation fails.
      }
      throw new CheckFailure(
        stage,
        operation,
        "response_size",
        response.status,
      );
    }
    body += decoder.decode(value, { stream: true });
  }
  let payload;
  try {
    payload = JSON.parse(body + decoder.decode());
  } catch {
    throw new CheckFailure(stage, operation, "response_shape", response.status);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new CheckFailure(stage, operation, "response_shape", response.status);
  if ("error" in payload)
    throw new CheckFailure(stage, operation, "provider_error", response.status);
  if (!("result" in payload))
    throw new CheckFailure(stage, operation, "response_shape", response.status);
  return payload.result;
}

function reservation(result, expected) {
  return (
    Array.isArray(result) &&
    result.length === 2 &&
    result[0] === expected[0] &&
    result[1] === expected[1]
  );
}

// The injected transport lets offline tests exercise the full request sequence.
export async function verifyQuota({
  rawUrl,
  token,
  lua,
  transport = fetch,
  uuid = randomUUID,
}) {
  const report = {
    pass: false,
    stage: "preflight",
    requests: 0,
    statuses: [],
    admitted: 0,
    rejected: 0,
    ttlValid: false,
    deleted: 0,
    failure: null,
    cleanupFailure: null,
  };
  let origin;
  let key;
  try {
    origin = approvedOrigin(rawUrl);
    if (typeof token !== "string" || !token.trim() || !lua)
      throw new CheckFailure("configuration");
    key = `crossfade:test:quota:${uuid().replaceAll("-", "")}`;
    if (!/^crossfade:test:quota:[0-9a-f]{32}$/.test(key))
      throw new CheckFailure("test_key");
  } catch (error) {
    report.stage = error instanceof CheckFailure ? error.stage : "preflight";
    return report;
  }

  let sentMutation = false;
  async function command(stage, parts) {
    const operation = parts[0];
    if (report.requests >= MAX_PROVIDER_REQUESTS)
      throw new CheckFailure(stage, operation, "request_cap");
    if (
      parts.at(-1) !== key &&
      !(parts[0] === "EVAL" && parts[3] === key && parts[4] === 2)
    )
      throw new CheckFailure(stage, operation, "test_key");
    if (!["EVAL", "TTL", "DEL"].includes(parts[0]))
      throw new CheckFailure(stage, operation, "command");
    report.requests++;
    if (parts[0] === "EVAL") sentMutation = true;
    let response;
    const signal = AbortSignal.timeout(2_500);
    try {
      response = await transport(origin, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(parts),
        signal,
        cache: "no-store",
        redirect: "manual",
      });
    } catch (error) {
      const category =
        signal.aborted ||
        error?.name === "TimeoutError" ||
        error?.name === "AbortError"
          ? "timeout"
          : "transport";
      throw new CheckFailure(stage, operation, category);
    }
    if (!response || !Number.isInteger(response.status))
      throw new CheckFailure(stage, operation, "response_shape");
    report.statuses.push(response.status);
    if (response.status !== 200)
      throw new CheckFailure(stage, operation, "http_status", response.status);
    return boundedResult(response, stage, operation, signal);
  }

  try {
    // allSettled waits for both in-flight admissions before cleanup on failure.
    const batch = await Promise.allSettled([
      command("admission", ["EVAL", lua, 1, key, 2]),
      command("admission", ["EVAL", lua, 1, key, 2]),
    ]);
    const failedAdmission = batch.find((entry) => entry.status === "rejected");
    if (failedAdmission)
      throw failedAdmission.reason instanceof CheckFailure
        ? failedAdmission.reason
        : new CheckFailure("admission", "EVAL", "verification");
    if (
      !batch.some(
        (entry) =>
          entry.status === "fulfilled" && reservation(entry.value, [1, 1]),
      ) ||
      !batch.some(
        (entry) =>
          entry.status === "fulfilled" && reservation(entry.value, [1, 2]),
      )
    )
      throw new CheckFailure("admission", "EVAL", "unexpected_result");
    report.admitted = 2;
    const third = await command("exhaustion", ["EVAL", lua, 1, key, 2]);
    if (!reservation(third, [0, 2]))
      throw new CheckFailure("exhaustion", "EVAL", "unexpected_result");
    report.rejected = 1;
    const ttl = await command("ttl", ["TTL", key]);
    if (!Number.isInteger(ttl) || ttl < 1 || ttl > 3_600)
      throw new CheckFailure("ttl", "TTL", "unexpected_result");
    report.ttlValid = true;
  } catch (error) {
    const failure =
      error instanceof CheckFailure
        ? error
        : new CheckFailure("verification", "none", "verification");
    report.stage = failure.stage;
    report.failure = {
      operation: failure.operation,
      category: failure.category,
      httpStatus: failure.httpStatus,
    };
  } finally {
    if (sentMutation) {
      try {
        const deleted = await command("cleanup", ["DEL", key]);
        if (deleted !== 1)
          throw new CheckFailure("cleanup", "DEL", "unexpected_result");
        report.deleted = 1;
      } catch (error) {
        const failure =
          error instanceof CheckFailure
            ? error
            : new CheckFailure("cleanup", "DEL", "verification");
        report.cleanupFailure = {
          operation: failure.operation,
          category: failure.category,
          httpStatus: failure.httpStatus,
        };
        if (!report.failure) {
          report.stage = "cleanup";
          report.failure = report.cleanupFailure;
        }
      }
    }
  }
  if (
    report.admitted === 2 &&
    report.rejected === 1 &&
    report.ttlValid &&
    report.deleted === 1 &&
    report.stage === "preflight" &&
    !report.failure &&
    !report.cleanupFailure
  ) {
    report.pass = true;
    report.stage = "complete";
  }
  return report;
}

export function formatReport(report) {
  const failure = report.failure;
  const cleanup = report.cleanupFailure;
  return `${report.pass ? "PASS" : "FAIL"} stage=${report.stage} operation=${failure?.operation ?? "none"} category=${failure?.category ?? "none"} http_status=${failure?.httpStatus ?? "none"} cleanup=${cleanup ? "failed" : report.deleted ? "passed" : "not_attempted"} cleanup_category=${cleanup?.category ?? "none"} cleanup_http_status=${cleanup?.httpStatus ?? "none"} statuses=${report.statuses.join(",") || "none"} admitted=${report.admitted} rejected=${report.rejected} ttl_valid=${report.ttlValid} deleted=${report.deleted} requests=${report.requests}\n`;
}

async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--live-once") {
    process.stdout.write(
      "BLOCKED preflight=explicit_live_once_required requests=0\n",
    );
    process.exitCode = 1;
    return;
  }
  if (process.env.QLOO_LIVE_ENABLED !== "0") {
    process.stdout.write(
      "BLOCKED preflight=qloo_live_must_be_zero requests=0\n",
    );
    process.exitCode = 1;
    return;
  }
  const source = await readFile(
    new URL("../src/lib/live-quota-core.mjs", import.meta.url),
    "utf8",
  );
  let lua;
  try {
    lua = extractProductionLua(source);
  } catch {
    process.stdout.write("BLOCKED preflight=production_script requests=0\n");
    process.exitCode = 1;
    return;
  }
  const report = await verifyQuota({
    rawUrl: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
    lua,
  });
  process.stdout.write(formatReport(report));
  if (!report.pass) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write("BLOCKED preflight=internal_error requests=0\n");
    process.exitCode = 1;
  });
}
