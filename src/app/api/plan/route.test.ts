import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "./route";

const requestBody = {
  mode: "live",
  audiences: [
    {
      name: "Audience A",
      interests: [{ name: "Miles Davis", type: "artist" }],
    },
    { name: "Audience B", interests: [{ name: "Beyoncé", type: "artist" }] },
  ],
  constraints: {
    maxMovieMinutes: 120,
    maxProgramMinutes: 180,
    allowedRatings: ["PG"],
    excludedIds: [],
  },
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

beforeEach(() => vi.stubEnv("CROSSFADE_SITE_ORIGIN", undefined));

it("fails closed in production live mode without a configured Qloo key", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QLOO_API_KEY", "");
  const response = await POST(
    new Request("https://crossfade.example/api/plan", {
      method: "POST",
      headers: {
        Origin: "https://crossfade.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: "MISSING_KEY" });
});

it.each([
  [
    "oversized collection",
    JSON.stringify({
      ...requestBody,
      constraints: {
        ...requestBody.constraints,
        allowedRatings: Array(1000).fill("PG"),
      },
    }),
    400,
    "INVALID_INPUT",
  ],
  ["malformed JSON", "{", 400, "INVALID_JSON"],
  ["oversized body", " ".repeat(16_385), 413, "REQUEST_SIZE"],
] as const)(
  "rejects %s before any provider request",
  async (_label, body, status, error) => {
    vi.stubEnv("NODE_ENV", "production");
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const response = await POST(
      new Request("https://crossfade.example/api/plan", {
        method: "POST",
        headers: {
          Origin: "https://crossfade.example",
          "Content-Type": "application/json",
        },
        body,
      }),
    );
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ error });
    expect(transport).not.toHaveBeenCalled();
  },
);

it("does not dispatch live Qloo planning when the launch switch is off", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QLOO_API_KEY", "offline-test-value");
  vi.stubEnv("QLOO_LIVE_ENABLED", "0");
  const response = await POST(
    new Request("https://crossfade.example/api/plan", {
      method: "POST",
      headers: {
        Origin: "https://crossfade.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({ error: "QLOO_LIVE_DISABLED" });
});

it("blocks live planning before Qloo when the shared guard is not configured", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QLOO_API_KEY", "offline-test-value");
  vi.stubEnv("QLOO_LIVE_ENABLED", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("QLOO_LIVE_PLANS_PER_HOUR", "");
  const transport = vi.fn();
  vi.stubGlobal("fetch", transport);
  const response = await POST(
    new Request("https://crossfade.example/api/plan", {
      method: "POST",
      headers: {
        Origin: "https://crossfade.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );
  expect(response.status).toBe(503);
  expect(await response.json()).toMatchObject({
    error: "QLOO_GUARD_UNAVAILABLE",
  });
  expect(transport).not.toHaveBeenCalled();
});

it("returns 429 without a Qloo call after shared admission is refused", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("QLOO_API_KEY", "offline-test-value");
  vi.stubEnv("QLOO_LIVE_ENABLED", "1");
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://safe-example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "offline-test-token");
  vi.stubEnv("QLOO_LIVE_PLANS_PER_HOUR", "2");
  const transport = vi.fn(async (url: string) => {
    expect(url).toBe("https://safe-example.upstash.io");
    return Response.json({ result: [0, 2] });
  });
  vi.stubGlobal("fetch", transport);
  const response = await POST(
    new Request("https://crossfade.example/api/plan", {
      method: "POST",
      headers: {
        Origin: "https://crossfade.example",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );
  expect(response.status).toBe(429);
  expect(await response.json()).toMatchObject({ error: "QLOO_SHARED_QUOTA" });
  expect(transport).toHaveBeenCalledTimes(1);
});

it("rejects a cross-site request despite spoofed forwarding headers", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const response = await POST(
    new Request("https://crossfade.example/api/plan", {
      method: "POST",
      headers: {
        Origin: "https://other.example",
        "Sec-Fetch-Site": "cross-site",
        "X-Real-IP": "127.0.0.1",
        "X-Forwarded-For": "127.0.0.1",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestBody),
    }),
  );
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ error: "ORIGIN" });
});

it.each([
  ["foreign origin", "https://other.example", "same-origin"],
  ["missing origin", undefined, "same-origin"],
  ["null origin", "null", "same-origin"],
  ["cross-site marker", "http://127.0.0.1:3100", "cross-site"],
] as const)(
  "rejects %s before any Redis or Qloo transport",
  async (_label, origin, fetchSite) => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("CROSSFADE_SITE_ORIGIN", "http://127.0.0.1:3100");
    vi.stubEnv("QLOO_API_KEY", "invented-offline-key");
    vi.stubEnv("QLOO_LIVE_ENABLED", "1");
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://offline-fixture.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "invented-offline-token");
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const headers = new Headers({
      "Content-Type": "application/json",
      Host: "127.0.0.1:3100",
      "X-Forwarded-Host": "127.0.0.1:3100",
      "X-Forwarded-Proto": "http",
      "Sec-Fetch-Site": fetchSite,
    });
    if (origin !== undefined) headers.set("Origin", origin);
    const response = await POST(
      new Request("http://localhost:3100/api/plan", {
        method: "POST",
        headers,
        body: JSON.stringify(requestBody),
      }),
    );
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: "ORIGIN" });
    expect(transport).not.toHaveBeenCalled();
  },
);
