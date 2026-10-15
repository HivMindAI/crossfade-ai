import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
import { parsePlanResponse } from "@/lib/plan-response";
import type { PlanRequest } from "@/lib/model";

// Invented transport rows exercise the existing P1 route and production client.
// These fixtures are not captured Qloo data or a live P1 measurement.
const p1: PlanRequest = {
  mode: "live",
  audiences: [
    {
      name: "The improvisers",
      interests: [
        { name: "Miles Davis", type: "artist" },
        { name: "Spirited Away", type: "movie" },
      ],
    },
    {
      name: "The shapeshifters",
      interests: [
        { name: "Beyoncé", type: "artist" },
        { name: "Everything Everywhere All at Once", type: "movie" },
      ],
    },
  ],
  constraints: {
    maxMovieMinutes: 120,
    maxProgramMinutes: 180,
    allowedRatings: ["G", "PG", "PG-13"],
    excludedIds: [],
  },
};

function offlineP1(
  mode:
    | "complete"
    | "no-overlap"
    | "missing-subtype"
    | "conflict"
    | "service-failure",
) {
  const searches = new Map([
    ["Miles Davis", "invented-a-artist"],
    ["Spirited Away", "invented-a-movie"],
    ["Beyoncé", "invented-b-artist"],
    ["Everything Everywhere All at Once", "invented-b-movie"],
  ]);
  const calls: { provider: "redis" | "qloo"; path: string }[] = [];
  const fetcher = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.origin === "https://offline-fixture.upstash.io") {
      calls.push({ provider: "redis", path: url.pathname });
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))[0]).toBe("EVAL");
      return Response.json({ result: [1, 1] });
    }
    expect(url.origin).toBe("https://hackathon.api.qloo.com");
    expect(init?.redirect).toBe("manual");
    calls.push({ provider: "qloo", path: url.pathname });
    if (url.pathname === "/search") {
      const name = url.searchParams.get("query") ?? "";
      const id = searches.get(name);
      if (!id) throw new Error("Unexpected offline Search fixture");
      return Response.json({
        results: [
          {
            entity_id: id,
            name,
            types: [url.searchParams.get("types")],
          },
        ],
      });
    }
    expect(url.pathname).toBe("/v2/insights");
    const type = url.searchParams.get("filter.type");
    const domain = type?.slice("urn:entity:".length);
    const side = url.searchParams
      .get("signal.interests.entities")
      ?.includes("invented-a-")
      ? "a"
      : "b";
    if (mode === "service-failure" && domain === "artist" && side === "a")
      return new Response(null, { status: 503 });
    const row: Record<string, unknown> = {
      entity_id:
        mode === "no-overlap" && domain === "artist"
          ? `invented-${side}-artist-only`
          : `invented-shared-${domain}`,
      name: `Invented ${domain}`,
      type: "urn:entity",
      subtype: type,
      query: { explainability: {} },
    };
    if (domain === "movie") row.properties = { content_rating: "PG" };
    if (mode === "missing-subtype" && domain === "artist") delete row.subtype;
    if (mode === "conflict" && domain === "artist")
      row.types = ["urn:entity:artist", "urn:entity:movie"];
    return Response.json({ results: { entities: [row] } });
  });
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QLOO_API_KEY", "invented-offline-key");
  vi.stubEnv("QLOO_LIVE_ENABLED", "1");
  vi.stubEnv("QLOO_API_ORIGIN", "https://hackathon.api.qloo.com");
  vi.stubEnv("CROSSFADE_SITE_ORIGIN", undefined);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://offline-fixture.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "invented-offline-token");
  vi.stubEnv("QLOO_LIVE_PLANS_PER_HOUR", "1");
  vi.stubGlobal("fetch", fetcher);
  return { calls, fetcher };
}

async function postP1() {
  return POST(
    new Request("https://crossfade.example/api/plan", {
      method: "POST",
      headers: {
        Origin: "https://crossfade.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(p1),
    }),
  );
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("runs the existing P1 route through Search, generic Artist/Movie/Book Insights and negotiation offline", async () => {
  const { calls } = offlineP1("complete");
  const response = await postP1();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(parsePlanResponse(body, p1)).toBeDefined();
  expect(body.status).toBe("conceptual");
  expect(body.metrics).toMatchObject({
    sourceCalls: 10,
    httpAttempts: 10,
    recoveryCalls: 0,
    sharedEligible: { artist: 1, movie: 1, book: 1 },
  });
  expect(body.options.length).toBeGreaterThan(0);
  expect(
    body.options.every((option: { candidates: { source: string }[] }) =>
      option.candidates.every((candidate) => candidate.source === "qloo"),
    ),
  ).toBe(true);
  expect(calls.filter((call) => call.provider === "redis")).toHaveLength(1);
  expect(calls.filter((call) => call.provider === "qloo")).toHaveLength(10);
  expect(
    calls.every(
      (call) =>
        call.provider === "redis" ||
        ["/search", "/v2/insights"].includes(call.path),
    ),
  ).toBe(true);
});

it.each([
  ["missing-subtype", "missing-or-wrong-subtype"],
  ["conflict", "conflicting-primary-domains"],
] as const)(
  "stops at invalid Artist evidence (%s) with redacted counts",
  async (mode, reason) => {
    const { calls } = offlineP1(mode);
    const response = await postP1();
    expect(response.status).toBe(502);
    const body = await response.json();
    expect(body).toMatchObject({
      error: "QLOO_MALFORMED",
      details: {
        endpoint: "insights",
        domain: "artist",
        category: "entity-classification",
        resultCount: 1,
        acceptedCount: 0,
        rejectedCount: 1,
        reasons: { [reason]: 1 },
      },
    });
    expect(JSON.stringify(body)).not.toMatch(
      /Invented artist|invented-shared-artist|invented-offline-key|invented-offline-token/,
    );
    expect(
      calls.filter((call) => call.provider === "qloo").length,
    ).toBeLessThanOrEqual(24);
  },
);

it("reports service failure without leaking provider content or exceeding the HTTP cap", async () => {
  const { calls } = offlineP1("service-failure");
  const response = await postP1();
  expect(response.status).toBe(503);
  const body = await response.json();
  expect(body.error).toBe("QLOO_UPSTREAM");
  expect(JSON.stringify(body)).not.toMatch(
    /invented-offline-key|invented-offline-token/,
  );
  expect(
    calls.filter((call) => call.provider === "qloo").length,
  ).toBeLessThanOrEqual(24);
});

it("returns an honest no-solution when no Artist ID is shared", async () => {
  const { calls } = offlineP1("no-overlap");
  const response = await postP1();
  expect(response.status).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("no-solution");
  expect(body.options).toEqual([]);
  expect(body.metrics).toMatchObject({
    sharedEligible: { artist: 0, movie: 1, book: 1 },
    sourceCalls: 10,
    httpAttempts: 10,
  });
  expect(calls.filter((call) => call.provider === "qloo")).toHaveLength(10);
});
