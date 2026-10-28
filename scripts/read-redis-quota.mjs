// Owner-only, read-only inspection of the existing shared quota key.
// Importing this module never contacts Redis or Qloo.
import { fileURLToPath } from "node:url";
import {
  approvedOrigin,
  QUOTA_KEY,
  REDIS_RESERVATION_TIMEOUT_MS,
} from "../src/lib/live-quota-core.mjs";

const MAX_RESPONSE_BYTES = 2_048;

class ReadFailure extends Error {
  constructor(category, stage, httpStatus = null) {
    super(category);
    this.category = category;
    this.stage = stage;
    this.httpStatus = httpStatus;
  }
}

async function boundedResult(response, signal, stage) {
  const reader = response.body?.getReader();
  if (!reader)
    throw new ReadFailure("malformed-response", stage, response.status);
  const decoder = new TextDecoder();
  let bytes = 0;
  let body = "";
  while (true) {
    let chunk;
    try {
      chunk = await reader.read();
    } catch {
      throw new ReadFailure(
        signal.aborted ? "timeout" : "transport",
        stage,
        response.status,
      );
    }
    if (chunk.done) break;
    bytes += chunk.value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES)
      throw new ReadFailure("response-size", stage, response.status);
    body += decoder.decode(chunk.value, { stream: true });
  }
  let payload;
  try {
    payload = JSON.parse(body + decoder.decode());
  } catch {
    throw new ReadFailure("malformed-response", stage, response.status);
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload))
    throw new ReadFailure("malformed-response", stage, response.status);
  if ("error" in payload)
    throw new ReadFailure("provider-error", stage, response.status);
  if (!("result" in payload))
    throw new ReadFailure("malformed-response", stage, response.status);
  return payload.result;
}

/** @param {{ rawUrl: string | undefined, token: string | undefined, transport?: typeof fetch }} options */
export async function readQuotaState({ rawUrl, token, transport = fetch }) {
  const report = {
    status: "BLOCKED",
    stage: "preflight",
    category: "none",
    httpStatus: null,
    requests: 0,
    httpStatuses: [],
    counter: null,
    ttlSeconds: null,
    state: "unknown",
  };
  try {
    if (!rawUrl?.trim() || !token?.trim())
      throw new ReadFailure("configuration", "preflight");
    let origin;
    try {
      origin = approvedOrigin(rawUrl.trim());
    } catch {
      throw new ReadFailure("origin", "preflight");
    }
    async function command(name) {
      if (report.requests >= 2) throw new ReadFailure("request-cap", name);
      report.requests++;
      const signal = AbortSignal.timeout(REDIS_RESERVATION_TIMEOUT_MS);
      let response;
      try {
        response = await transport(origin, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token.trim()}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify([name, QUOTA_KEY]),
          signal,
          cache: "no-store",
          redirect: "manual",
        });
      } catch (error) {
        throw new ReadFailure(
          signal.aborted || error?.name === "TimeoutError"
            ? "timeout"
            : "transport",
          name,
        );
      }
      if (!response || !Number.isInteger(response.status))
        throw new ReadFailure("malformed-response", name);
      report.httpStatuses.push(response.status);
      if (response.status === 401 || response.status === 403)
        throw new ReadFailure("authentication", name, response.status);
      if (response.status !== 200)
        throw new ReadFailure("http-status", name, response.status);
      return boundedResult(response, signal, name);
    }

    const count = await command("GET");
    if (
      count !== null &&
      (typeof count !== "string" || !/^\d{1,9}$/.test(count))
    )
      throw new ReadFailure("malformed-response", "GET", 200);
    report.counter = count === null ? null : Number(count);
    const ttl = await command("TTL");
    if (!Number.isInteger(ttl) || ttl < -2 || ttl > 3_600)
      throw new ReadFailure("malformed-response", "TTL", 200);
    report.ttlSeconds = ttl;
    if (count === null && ttl === -2) {
      report.state = "absent";
    } else if (count !== null && Number(count) >= 1 && ttl >= 1) {
      report.state = "active";
    } else {
      throw new ReadFailure("state-ambiguous", "TTL", 200);
    }
    report.status = "PASS";
    report.stage = "complete";
  } catch (error) {
    const safe =
      error instanceof ReadFailure
        ? error
        : new ReadFailure("internal", "internal");
    report.category = safe.category;
    report.stage = safe.stage;
    report.httpStatus = safe.httpStatus;
  }
  return report;
}

async function main() {
  if (
    process.argv.length !== 3 ||
    process.argv[2] !== "--read-only-once" ||
    process.env.QLOO_LIVE_ENABLED !== "0"
  ) {
    process.stdout.write(
      "BLOCKED preflight=explicit_read_only_once_required requests=0\n",
    );
    process.exitCode = 1;
    return;
  }
  const report = await readQuotaState({
    rawUrl: process.env.UPSTASH_REDIS_REST_URL,
    token: process.env.UPSTASH_REDIS_REST_TOKEN,
  });
  process.stdout.write(`${JSON.stringify(report)}\n`);
  if (report.status !== "PASS") process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch(() => {
    process.stdout.write(
      "BLOCKED stage=internal category=internal requests=0\n",
    );
    process.exitCode = 1;
  });
}
