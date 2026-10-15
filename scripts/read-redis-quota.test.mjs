import assert from "node:assert/strict";
import test from "node:test";
import { readQuotaState } from "./read-redis-quota.mjs";
import { QUOTA_KEY } from "../src/lib/live-quota-core.mjs";

// Invented Redis responses only. These tests make no provider requests.
function harness(responses) {
  const calls = [];
  const transport = async (url, init) => {
    calls.push({ url, init });
    const response = responses[calls.length - 1];
    if (response instanceof Error) throw response;
    return response;
  };
  return {
    calls,
    run: () =>
      readQuotaState({
        rawUrl: "https://offline-fixture.upstash.io",
        token: "invented-private-token",
        transport,
      }),
  };
}

test("reads only the production key with GET and TTL, at most two requests", async () => {
  const fixture = harness([
    Response.json({ result: "1" }),
    Response.json({ result: 1200 }),
  ]);
  const report = await fixture.run();
  assert.deepEqual(report, {
    status: "PASS",
    stage: "complete",
    category: "none",
    httpStatus: null,
    requests: 2,
    httpStatuses: [200, 200],
    counter: 1,
    ttlSeconds: 1200,
    state: "active",
  });
  assert.deepEqual(
    fixture.calls.map(({ init }) => JSON.parse(init.body)),
    [
      ["GET", QUOTA_KEY],
      ["TTL", QUOTA_KEY],
    ],
  );
  for (const { url, init } of fixture.calls) {
    assert.equal(url, "https://offline-fixture.upstash.io");
    assert.equal(init.method, "POST");
    assert.equal(init.redirect, "manual");
    assert.equal(init.cache, "no-store");
  }
  assert.doesNotMatch(
    JSON.stringify(report),
    /invented-private-token|offline-fixture/,
  );
});

test("absent counter and TTL are reported without mutation", async () => {
  const report = await harness([
    Response.json({ result: null }),
    Response.json({ result: -2 }),
  ]).run();
  assert.equal(report.status, "PASS");
  assert.equal(report.state, "absent");
  assert.equal(report.counter, null);
  assert.equal(report.ttlSeconds, -2);
});

test("a counter with no expiry is blocked, never repaired", async () => {
  const fixture = harness([
    Response.json({ result: "1" }),
    Response.json({ result: -1 }),
  ]);
  const report = await fixture.run();
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.category, "state-ambiguous");
  assert.equal(fixture.calls.length, 2);
});

test("a zero-valued existing counter is not mistaken for a free window", async () => {
  const report = await harness([
    Response.json({ result: "0" }),
    Response.json({ result: 1200 }),
  ]).run();
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.category, "state-ambiguous");
});

test("authentication, transport, malformed and timeout errors stop without retry", async () => {
  for (const [first, category, status] of [
    [new Response("private-auth", { status: 401 }), "authentication", 401],
    [new Error("private-transport"), "transport", null],
    [Response.json({ error: "private-provider" }), "provider-error", 200],
    [Response.json({ result: "not-a-count" }), "malformed-response", 200],
    [new DOMException("private-timeout", "TimeoutError"), "timeout", null],
  ]) {
    const fixture = harness([first]);
    const report = await fixture.run();
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.category, category);
    assert.equal(report.httpStatus, status);
    assert.equal(report.requests, 1);
    assert.equal(fixture.calls.length, 1);
    assert.doesNotMatch(JSON.stringify(report), /private-/);
  }
});

test("invalid configuration cannot send a token", async () => {
  let calls = 0;
  const transport = async () => {
    calls++;
    throw new Error("unreachable");
  };
  for (const rawUrl of [
    "https://offline-fixture.upstash.io.evil.test",
    "http://offline-fixture.upstash.io",
  ]) {
    const report = await readQuotaState({
      rawUrl,
      token: "invented-private-token",
      transport,
    });
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.category, "origin");
    assert.equal(report.requests, 0);
  }
  assert.equal(calls, 0);
});
