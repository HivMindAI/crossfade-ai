import { afterEach, expect, it, vi } from "vitest";
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

afterEach(() => vi.unstubAllEnvs());

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
