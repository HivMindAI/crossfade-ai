import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  extractProductionLua,
  formatReport,
  MAX_PROVIDER_REQUESTS,
  verifyQuota,
} from "./verify-redis-quota.mjs";

const rawUrl = "https://offline-fixture.upstash.io";
const token = "invented-offline-token";
const uuid = () => "11111111-2222-4333-8444-555555555555";
const productionSource = await readFile(
  new URL("../src/lib/live-quota-core.mjs", import.meta.url),
  "utf8",
);
const lua = extractProductionLua(productionSource);

test("loads the exact production Lua template rather than a copied script", () => {
  assert.equal(
    lua,
    productionSource.match(/const RESERVE_SCRIPT = `([\s\S]*?)`;/)[1],
  );
  assert.throws(() =>
    extractProductionLua("const RESERVE_SCRIPT = `return 1`;"),
  );
});

test("two concurrent admissions, one rejection, TTL and deletion use only one disposable key", async () => {
  const calls = [];
  let used = 0;
  let active = 0;
  let peak = 0;
  const transport = async (_origin, init) => {
    assert.equal(_origin, rawUrl);
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers.Authorization, `Bearer ${token}`);
    const command = JSON.parse(init.body);
    calls.push(command);
    assert.match(
      command[command[0] === "EVAL" ? 3 : 1],
      /^crossfade:test:quota:[0-9a-f]{32}$/,
    );
    if (command[0] === "EVAL") {
      assert.equal(command[1], lua);
      assert.equal(command[4], 2);
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;
      if (used >= 2) return Response.json({ result: [0, used] });
      used++;
      return Response.json({ result: [1, used] });
    }
    if (command[0] === "TTL") return Response.json({ result: 3599 });
    if (command[0] === "DEL") {
      used = 0;
      return Response.json({ result: 1 });
    }
    throw new Error("unexpected command");
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.deepEqual(
    [
      result.pass,
      result.admitted,
      result.rejected,
      result.ttlValid,
      result.deleted,
      result.requests,
    ],
    [true, 2, 1, true, 1, 5],
  );
  assert.equal(peak, 2);
  assert.deepEqual(
    calls.map((command) => command[0]),
    ["EVAL", "EVAL", "EVAL", "TTL", "DEL"],
  );
  assert.equal(
    new Set(calls.map((command) => command[command[0] === "EVAL" ? 3 : 1]))
      .size,
    1,
  );
  assert.ok(result.requests <= 8);
  assert.equal(MAX_PROVIDER_REQUESTS, 5);
  const output = formatReport(result);
  assert.match(
    output,
    /^PASS stage=complete operation=none category=none http_status=none cleanup=passed cleanup_category=none cleanup_http_status=none statuses=200,200,200,200,200 admitted=2 rejected=1 ttl_valid=true deleted=1 requests=5\n$/,
  );
  assert.doesNotMatch(
    output,
    /invented-offline-token|crossfade:test:quota:|offline-fixture/,
  );
});

test("unapproved origin and missing configuration cannot dispatch", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    return Response.json({ result: [1, 1] });
  };
  const unapproved = await verifyQuota({
    rawUrl: "https://offline-fixture.upstash.io.evil.test",
    token,
    lua,
    transport,
    uuid,
  });
  const missing = await verifyQuota({
    rawUrl,
    token: "",
    lua,
    transport,
    uuid,
  });
  assert.equal(unapproved.pass, false);
  assert.equal(missing.pass, false);
  assert.equal(calls, 0);
});

test("a failed concurrent admission waits for both calls and still cleans the disposable key", async () => {
  const commands = [];
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    commands.push(command[0]);
    if (command[0] === "EVAL") {
      if (commands.length === 1) return Response.json({ result: [1, 1] });
      return new Response(null, { status: 503 });
    }
    assert.equal(command[0], "DEL");
    return Response.json({ result: 1 });
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.pass, false);
  assert.deepEqual(commands, ["EVAL", "EVAL", "DEL"]);
  assert.equal(result.requests, 3);
  assert.equal(result.deleted, 1);
  assert.deepEqual(result.failure, {
    operation: "EVAL",
    category: "http_status",
    httpStatus: 503,
  });
  assert.ok(result.statuses.every((status) => Number.isInteger(status)));
});

test("malformed quota results fail closed and never trigger a retry", async () => {
  const commands = [];
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    commands.push(command[0]);
    return Response.json({ result: command[0] === "DEL" ? 1 : [1, 1] });
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.pass, false);
  assert.equal(result.stage, "admission");
  assert.equal(result.failure.category, "unexpected_result");
  assert.deepEqual(commands, ["EVAL", "EVAL", "DEL"]);
});

test("transport failure and cleanup failure preserve the original admission cause", async () => {
  const commands = [];
  const transport = async (_origin, init) => {
    commands.push(JSON.parse(init.body)[0]);
    throw new TypeError("private endpoint and secret must never be printed");
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.deepEqual(commands, ["EVAL", "EVAL", "DEL"]);
  assert.equal(result.stage, "admission");
  assert.deepEqual(result.failure, {
    operation: "EVAL",
    category: "transport",
    httpStatus: null,
  });
  assert.deepEqual(result.cleanupFailure, {
    operation: "DEL",
    category: "transport",
    httpStatus: null,
  });
  assert.equal(result.requests, 3);
  assert.deepEqual(result.statuses, []);
  assert.doesNotMatch(
    formatReport(result),
    /private endpoint|secret|invented-offline-token/,
  );
});

test("timeout is reported as a safe category without a retry", async () => {
  const transport = async () => {
    throw new DOMException("private text", "TimeoutError");
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "admission");
  assert.equal(result.failure.category, "timeout");
  assert.equal(result.cleanupFailure.category, "timeout");
  assert.equal(result.requests, 3);
  assert.doesNotMatch(formatReport(result), /private text/);
});

test("authentication HTTP status is retained and cleanup cannot conceal it", async () => {
  const transport = async () => new Response(null, { status: 401 });
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "admission");
  assert.deepEqual(result.failure, {
    operation: "EVAL",
    category: "http_status",
    httpStatus: 401,
  });
  assert.equal(result.cleanupFailure.httpStatus, 401);
  assert.equal(result.requests, 3);
  assert.deepEqual(result.statuses, [401, 401, 401]);
});

test("HTTP 400 with a provider error retains the status without exposing its body", async () => {
  const transport = async () =>
    Response.json({ error: "private provider detail" }, { status: 400 });
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "admission");
  assert.equal(result.failure.category, "http_status");
  assert.equal(result.failure.httpStatus, 400);
  assert.equal(result.cleanupFailure.httpStatus, 400);
  assert.equal(result.requests, 3);
  assert.doesNotMatch(formatReport(result), /private provider detail/);
});

test("provider error envelope is not accepted as a successful EVAL", async () => {
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    return Response.json(
      command[0] === "DEL"
        ? { result: 1 }
        : { error: "private provider detail" },
    );
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "admission");
  assert.equal(result.failure.category, "provider_error");
  assert.equal(result.deleted, 1);
  assert.doesNotMatch(formatReport(result), /private provider detail/);
});

test("malformed JSON is distinguished from provider error", async () => {
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    return command[0] === "DEL"
      ? Response.json({ result: 1 })
      : new Response("not-json", { status: 200 });
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "admission");
  assert.equal(result.failure.category, "response_shape");
  assert.equal(result.deleted, 1);
});

test("TTL failure is reported separately and cleanup still runs", async () => {
  let used = 0;
  const commands = [];
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    commands.push(command[0]);
    if (command[0] === "EVAL") {
      if (used >= 2) return Response.json({ result: [0, used] });
      used++;
      return Response.json({ result: [1, used] });
    }
    return Response.json({ result: command[0] === "TTL" ? -1 : 1 });
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "ttl");
  assert.deepEqual(result.failure, {
    operation: "TTL",
    category: "unexpected_result",
    httpStatus: null,
  });
  assert.equal(result.deleted, 1);
  assert.deepEqual(commands, ["EVAL", "EVAL", "EVAL", "TTL", "DEL"]);
  assert.equal(result.requests, 5);
});

test("cleanup failure after successful reservation is its own failure", async () => {
  let used = 0;
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    if (command[0] === "EVAL") {
      if (used >= 2) return Response.json({ result: [0, used] });
      used++;
      return Response.json({ result: [1, used] });
    }
    if (command[0] === "TTL") return Response.json({ result: 3599 });
    return new Response(null, { status: 403 });
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.pass, false);
  assert.equal(result.stage, "cleanup");
  assert.deepEqual(result.failure, {
    operation: "DEL",
    category: "http_status",
    httpStatus: 403,
  });
  assert.equal(result.admitted, 2);
  assert.equal(result.rejected, 1);
  assert.equal(result.ttlValid, true);
  assert.equal(result.requests, 5);
});

test("exhaustion failure is distinct from admission and TTL", async () => {
  let used = 0;
  const transport = async (_origin, init) => {
    const command = JSON.parse(init.body);
    if (command[0] === "DEL") return Response.json({ result: 1 });
    used++;
    return Response.json({ result: [1, used] });
  };
  const result = await verifyQuota({ rawUrl, token, lua, transport, uuid });
  assert.equal(result.stage, "exhaustion");
  assert.equal(result.failure.operation, "EVAL");
  assert.equal(result.failure.category, "unexpected_result");
  assert.equal(result.requests, 4);
});
