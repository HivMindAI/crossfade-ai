import assert from "node:assert/strict";
import test from "node:test";
import { MAX_QLOO_CALLS, runBridgeExperiment } from "./bridge-experiment.mjs";
import { QUOTA_KEY, RESERVE_SCRIPT } from "../src/lib/live-quota-core.mjs";

// Invented fixtures only. No recorded Qloo payload or credential is used.
const ARTIST = "urn:entity:artist";
const search = (id, name) => ({
  results: [{ entity_id: id, name, types: ["urn:entity", ARTIST] }],
});
const item = (id, extra = {}) => ({
  entity_id: id,
  name: `Invented ${id}`,
  type: "urn:entity",
  subtype: ARTIST,
  ...extra,
});
const insights = (...ids) => ({
  results: { entities: ids.map((id) => item(id)) },
});
const defaultBodies = () => [
  search("seed-a", "Miles Davis"),
  search("seed-b", "Beyoncé"),
  insights("a", "b"),
  insights("b", "c"),
  insights("a", "b", "c"),
  insights("c", "b"),
  insights("b"),
  insights("b"),
];

function harness({
  bodies = defaultBodies(),
  redisResult = [1, 1],
  redisFailure,
  errorAt,
} = {}) {
  const qlooCalls = [];
  const redisCalls = [];
  const qlooTransport = async (url, init) => {
    const index = qlooCalls.length;
    qlooCalls.push({ url, init });
    if (index === errorAt)
      throw new Error("PRIVATE provider body seed-a credential-marker");
    const body = bodies[index];
    return body instanceof Response ? body : Response.json(body);
  };
  const redisTransport = async (url, init) => {
    redisCalls.push({ url, init });
    if (redisFailure) throw redisFailure;
    return redisResult instanceof Response
      ? redisResult
      : Response.json({ result: redisResult });
  };
  const config = {
    authorized: true,
    liveModeOff: true,
    key: "invented-qloo-secret",
    qlooOrigin: "https://hackathon.api.qloo.com",
    redisUrl: "https://invented-fixture.upstash.io",
    redisToken: "invented-redis-secret",
    quotaLimit: "1",
  };
  return {
    qlooCalls,
    redisCalls,
    config,
    run: () => runBridgeExperiment({ config, qlooTransport, redisTransport }),
  };
}

test("valid artist protocol uses the exact production key and eight zero-retry calls", async () => {
  const fixture = harness();
  const report = await fixture.run();
  assert.equal(report.status, "VALID");
  assert.equal(report.logicalCalls, 8);
  assert.equal(report.httpAttempts, 8);
  assert.equal(report.redisRequests, 1);
  assert.equal(report.reservationOutcome, "admitted");
  assert.equal(MAX_QLOO_CALLS, 8);
  assert.equal(fixture.redisCalls.length, 1);
  assert.equal(fixture.qlooCalls.length, 8);
  const command = JSON.parse(fixture.redisCalls[0].init.body);
  assert.deepEqual(command, ["EVAL", RESERVE_SCRIPT, 1, QUOTA_KEY, 1]);
  assert.deepEqual(
    [
      report.initialIntersection,
      report.unionCandidates,
      report.doublyReturned,
      report.newlyDoublyReturned,
      report.baselineEvaluable,
      report.baselineFrontier,
      report.expandedFrontier,
    ],
    [1, 3, 2, 1, 1, 1, 2],
  );
  assert.deepEqual(report.discoveryReturned, [2, 2]);
  assert.deepEqual(report.evaluationReturned, [3, 2]);
  assert.deepEqual(report.controlReturned, [1, 1]);
  assert.deepEqual(report.controlMembershipValid, [true, true]);
  assert.equal(report.filterEvidence, "sample-membership-only");
  assert.equal(report.culturalCompatibility, "unverified");
  assert.equal(report.monthlyHeaderState, "absent");
  assert.equal(report.provenanceRecords, 11);
  assert.ok(Number.isInteger(report.latencyMs));
  const paths = fixture.qlooCalls.map(({ url }) => url.pathname);
  assert.deepEqual(paths, [
    "/search",
    "/search",
    "/v2/insights",
    "/v2/insights",
    "/v2/insights",
    "/v2/insights",
    "/v2/insights",
    "/v2/insights",
  ]);
  const params = fixture.qlooCalls.map(({ url }) => url.searchParams);
  assert.deepEqual(
    params.slice(0, 2).map((value) => Object.fromEntries(value)),
    [
      { query: "Miles Davis", types: ARTIST, take: "8" },
      { query: "Beyoncé", types: ARTIST, take: "8" },
    ],
  );
  assert.equal(params[4].get("filter.results.entities"), "a,b,c");
  assert.equal(params[5].get("filter.results.entities"), "a,b,c");
  assert.equal(params[6].get("filter.results.entities"), "b,c");
  assert.equal(params[7].get("filter.results.entities"), "a,b");
  for (const { url, init } of fixture.qlooCalls) {
    assert.equal(url.origin, "https://hackathon.api.qloo.com");
    assert.equal(init.method, "GET");
    assert.equal(init.redirect, "manual");
    assert.equal(init.headers["X-Api-Key"], "invented-qloo-secret");
    assert.equal(
      url.searchParams.get("types") ?? url.searchParams.get("filter.type"),
      ARTIST,
    );
  }
  assert.doesNotMatch(
    JSON.stringify(report),
    /seed-a|seed-b|invented-qloo-secret|invented-redis-secret|"a"|"b"|"c"/,
  );
});

test("optional monthly header records only bounded numeric metadata and never a raw value", async () => {
  const bodies = defaultBodies();
  bodies[0] = Response.json(bodies[0], {
    headers: { "x-month-ratelimit-remaining": "17" },
  });
  bodies[1] = Response.json(bodies[1], {
    headers: { "x-month-ratelimit-remaining": "15" },
  });
  let report = await harness({ bodies }).run();
  assert.equal(report.monthlyHeaderState, "numeric-unverified");
  assert.equal(report.monthlyRemainingMinimum, 15);

  const invalidBodies = defaultBodies();
  invalidBodies[1] = Response.json(invalidBodies[1], {
    headers: { "x-month-ratelimit-remaining": "private-header-marker" },
  });
  report = await harness({ bodies: invalidBodies }).run();
  assert.equal(report.monthlyHeaderState, "invalid");
  assert.equal(report.monthlyRemainingMinimum, null);
  assert.doesNotMatch(JSON.stringify(report), /private-header-marker/);
});

test("denied or unhealthy shared reservation stops before any Qloo call", async () => {
  for (const redisResult of [[0, 1], new Response(null, { status: 503 })]) {
    const fixture = harness({ redisResult });
    const report = await fixture.run();
    assert.equal(report.status, "BLOCKED");
    assert.equal(
      report.category,
      Array.isArray(redisResult) ? "quota-denied" : "quota-http-status",
    );
    assert.equal(
      report.reservationOutcome,
      Array.isArray(redisResult) ? "denied" : "unknown",
    );
    assert.equal(report.httpStatus, Array.isArray(redisResult) ? 200 : 503);
    assert.equal(report.redisRequests, 1);
    assert.equal(report.httpAttempts, 0);
    assert.equal(fixture.redisCalls.length, 1);
    assert.equal(fixture.qlooCalls.length, 0);
  }
});

test("reservation failures have fixed redacted causes and ambiguous outcomes", async () => {
  for (const [redis, category, status] of [
    [
      { redisFailure: new DOMException("private-timeout", "TimeoutError") },
      "quota-timeout",
      null,
    ],
    [{ redisFailure: new Error("private-transport") }, "quota-transport", null],
    [
      { redisResult: new Response("private-auth", { status: 401 }) },
      "quota-authentication",
      401,
    ],
    [
      { redisResult: Response.json({ error: "private-provider" }) },
      "quota-provider-error",
      200,
    ],
    [
      { redisResult: Response.json({ result: [1, 999] }) },
      "quota-malformed-response",
      200,
    ],
  ]) {
    const fixture = harness(redis);
    const report = await fixture.run();
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.stage, "reservation");
    assert.equal(report.category, category);
    assert.equal(report.httpStatus, status);
    assert.equal(report.reservationOutcome, "unknown");
    assert.equal(report.redisRequests, 1);
    assert.equal(report.httpAttempts, 0);
    assert.equal(fixture.redisCalls.length, 1);
    assert.equal(fixture.qlooCalls.length, 0);
    assert.doesNotMatch(
      JSON.stringify(report),
      /private-|invented-redis-secret/,
    );
  }
});

test("missing authorization, key, or approved origin dispatches nothing", async () => {
  for (const change of [
    { authorized: false },
    { liveModeOff: false },
    { key: "" },
    { qlooOrigin: "https://api.qloo.com" },
  ]) {
    const fixture = harness();
    Object.assign(fixture.config, change);
    const report = await fixture.run();
    assert.equal(report.status, change.qlooOrigin ? "FAIL" : "BLOCKED");
    assert.equal(fixture.redisCalls.length, 0);
    assert.equal(fixture.qlooCalls.length, 0);
  }
});

test("failed eighth dispatch counts as attempt eight and is never retried", async () => {
  const fixture = harness({ errorAt: 7 });
  const report = await fixture.run();
  assert.equal(report.status, "FAIL");
  assert.equal(report.stage, "control-1");
  assert.equal(report.category, "qloo-transport");
  assert.equal(report.logicalCalls, 8);
  assert.equal(report.httpAttempts, 8);
  assert.equal(fixture.qlooCalls.length, 8);
  assert.doesNotMatch(
    JSON.stringify(report),
    /PRIVATE|provider body|credential-marker/,
  );
});

test("HTTP failures and redirects stop immediately without retry", async () => {
  for (const response of [
    new Response("PRIVATE", { status: 429 }),
    new Response("PRIVATE", { status: 302 }),
  ]) {
    const bodies = defaultBodies();
    bodies[2] = response;
    const fixture = harness({ bodies });
    const report = await fixture.run();
    assert.equal(report.status, "FAIL");
    assert.equal(report.httpAttempts, 3);
    assert.equal(fixture.qlooCalls.length, 3);
    assert.doesNotMatch(JSON.stringify(report), /PRIVATE/);
  }
});

test("an outsider in a same-union response invalidates the filter", async () => {
  const bodies = defaultBodies();
  bodies[4] = insights("outside");
  const fixture = harness({ bodies });
  const report = await fixture.run();
  assert.equal(report.status, "FAIL");
  assert.equal(report.category, "filtered-outsider");
  assert.equal(report.httpAttempts, 5);
});

test("an ignored control that returns the omitted ID fails closed", async () => {
  const bodies = defaultBodies();
  bodies[6] = insights("a");
  const fixture = harness({ bodies });
  const report = await fixture.run();
  assert.equal(report.status, "FAIL");
  assert.equal(report.category, "filtered-outsider");
  assert.equal(report.httpAttempts, 7);
});

test("empty evaluation or control is inconclusive and stops", async () => {
  for (const index of [4, 6]) {
    const bodies = defaultBodies();
    bodies[index] = insights();
    const fixture = harness({ bodies });
    const report = await fixture.run();
    assert.equal(report.status, "INCONCLUSIVE");
    assert.equal(report.category, "empty-results");
    assert.equal(report.httpAttempts, index + 1);
  }
});

test("empty discovery and a one-ID union stop before filtered requests", async () => {
  const emptyBodies = defaultBodies();
  emptyBodies[2] = insights();
  const empty = harness({ bodies: emptyBodies });
  const emptyReport = await empty.run();
  assert.equal(emptyReport.status, "INCONCLUSIVE");
  assert.equal(emptyReport.httpAttempts, 3);

  const singleBodies = defaultBodies();
  singleBodies[2] = insights("only");
  singleBodies[3] = insights("only");
  const single = harness({ bodies: singleBodies });
  const singleReport = await single.run();
  assert.equal(singleReport.status, "INCONCLUSIVE");
  assert.equal(singleReport.category, "insufficient-pool");
  assert.equal(singleReport.unionCandidates, 1);
  assert.equal(singleReport.httpAttempts, 4);
});

test("duplicate, conflicting, and malformed Insights entities fail at discovery", async () => {
  for (const rows of [
    [item("a"), item("a")],
    [item("a", { subtype: "urn:entity:movie" })],
    [item("a", { entity_id: "" })],
    [item("a", { properties: [] })],
  ]) {
    const bodies = defaultBodies();
    bodies[2] = { results: { entities: rows } };
    const fixture = harness({ bodies });
    const report = await fixture.run();
    assert.equal(report.status, "FAIL");
    assert.equal(report.category, "insights-entities");
    assert.equal(report.httpAttempts, 3);
  }
});

test("Search preserves exact typed identity and rejects ambiguous or malformed seeds", async () => {
  for (const first of [
    {
      results: [
        { entity_id: "a", name: "Miles Davis", types: [ARTIST] },
        { entity_id: "b", name: "Miles Davis", types: [ARTIST] },
      ],
    },
    { results: [{ entity_id: "", name: "Miles Davis", types: [ARTIST] }] },
    {
      results: [
        { entity_id: "a", name: "Miles Davis", types: ["urn:entity:movie"] },
      ],
    },
  ]) {
    const bodies = defaultBodies();
    bodies[0] = first;
    const fixture = harness({ bodies });
    const report = await fixture.run();
    assert.notEqual(report.status, "VALID");
    assert.equal(report.httpAttempts, 1);
  }
});

test("Search and Insights envelopes remain separate and explicit provider failure stops", async () => {
  for (const [index, replacement, category] of [
    [0, { results: { entities: [] } }, "search-envelope"],
    [2, { results: [] }, "insights-envelope"],
    [2, { success: false, results: { entities: [] } }, "insights-envelope"],
  ]) {
    const bodies = defaultBodies();
    bodies[index] = replacement;
    const fixture = harness({ bodies });
    const report = await fixture.run();
    assert.equal(report.status, "FAIL");
    assert.equal(report.category, category);
    assert.equal(report.httpAttempts, index + 1);
  }
});

test("a valid duplicate Search ID is deduplicated by the shared Search validator", async () => {
  const bodies = defaultBodies();
  bodies[0] = {
    results: [
      { entity_id: "seed-a", name: "Miles Davis", types: [ARTIST] },
      { entity_id: "seed-a", name: "Miles Davis", types: [ARTIST] },
    ],
  };
  const fixture = harness({ bodies });
  const report = await fixture.run();
  assert.equal(report.status, "VALID");
  assert.equal(report.httpAttempts, 8);
});

test("an oversized encoded URL stops before dispatch and no IDs enter the report", async () => {
  const long = (letter) => letter.repeat(700);
  const bodies = defaultBodies();
  bodies[2] = {
    results: {
      entities: Array.from({ length: 10 }, (_, i) => item(`${long("a")}${i}`)),
    },
  };
  bodies[3] = {
    results: {
      entities: Array.from({ length: 10 }, (_, i) => item(`${long("b")}${i}`)),
    },
  };
  const fixture = harness({ bodies });
  const report = await fixture.run();
  assert.equal(report.status, "INCONCLUSIVE");
  assert.equal(report.category, "url-size");
  assert.equal(report.httpAttempts, 4);
  assert.doesNotMatch(JSON.stringify(report), /a{100}|b{100}/);
});
