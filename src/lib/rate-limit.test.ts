import { afterEach, expect, it, vi } from "vitest";
import { checkRateLimit, checkRequestOrigin } from "./rate-limit";

afterEach(() => vi.unstubAllEnvs());

function originRequest(
  origin?: string,
  extra: Record<string, string> = {},
  url = "http://localhost:3100/api/plan",
): Request {
  const headers = new Headers(extra);
  if (origin !== undefined) headers.set("Origin", origin);
  return new Request(url, { method: "POST", headers });
}

it("accepts only the explicit production site origin when Next reconstructs an internal URL", () => {
  vi.stubEnv("CROSSFADE_SITE_ORIGIN", "http://127.0.0.1:3100");
  expect(() =>
    checkRequestOrigin(
      originRequest("http://127.0.0.1:3100", {
        Host: "127.0.0.1:3100",
        "Sec-Fetch-Site": "same-origin",
        "X-Forwarded-Host": "127.0.0.1:3100",
      }),
      true,
    ),
  ).not.toThrow();
});

it.each([
  ["missing", undefined],
  ["null", "null"],
  ["malformed", "not-an-origin"],
  ["foreign", "https://other.example"],
  ["other port", "http://127.0.0.1:3101"],
  ["other protocol", "https://127.0.0.1:3100"],
  ["path-bearing", "http://127.0.0.1:3100/path"],
] as const)(
  "rejects a %s Origin even with spoofed forwarding headers",
  (_label, origin) => {
    vi.stubEnv("CROSSFADE_SITE_ORIGIN", "http://127.0.0.1:3100");
    expect(() =>
      checkRequestOrigin(
        originRequest(origin, {
          Host: "127.0.0.1:3100",
          "X-Forwarded-Host": "127.0.0.1:3100",
          "X-Forwarded-Proto": "http",
          "Sec-Fetch-Site": "same-origin",
        }),
        true,
      ),
    ).toThrowError(/Planning requests must come from this site/);
  },
);

it("rejects cross-site browser metadata even when Origin matches the configured site", () => {
  vi.stubEnv("CROSSFADE_SITE_ORIGIN", "http://127.0.0.1:3100");
  expect(() =>
    checkRequestOrigin(
      originRequest("http://127.0.0.1:3100", {
        "Sec-Fetch-Site": "cross-site",
      }),
      true,
    ),
  ).toThrowError(/Planning requests must come from this site/);
});

it.each([
  "",
  "*",
  "http://crossfade.example",
  "https://crossfade.example/path",
])("fails closed on invalid explicit site origin %s", (siteOrigin) => {
  vi.stubEnv("CROSSFADE_SITE_ORIGIN", siteOrigin);
  expect(() =>
    checkRequestOrigin(originRequest("https://crossfade.example"), true),
  ).toThrowError(/trusted site origin is invalid/);
});

it("limits a caller and resets in a new window", () => {
  for (let i = 0; i < 15; i++)
    expect(() => checkRateLimit("test-rate", 1000)).not.toThrow();
  expect(() => checkRateLimit("test-rate", 1001)).toThrowError(/Too many/);
  expect(() => checkRateLimit("test-rate", 62000)).not.toThrow();
});

it("keeps the synthetic emergency window separate from live", () => {
  for (let i = 0; i < 60; i++) checkRateLimit("mode-synthetic", 1000, 60);
  expect(() => checkRateLimit("mode-synthetic", 1000, 60)).toThrow();
  expect(() => checkRateLimit("mode-live", 1000, 15)).not.toThrow();
  for (let i = 1; i < 15; i++) checkRateLimit("mode-live", 1000, 15);
  expect(() => checkRateLimit("mode-live", 1000, 15)).toThrow();
});
