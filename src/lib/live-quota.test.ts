import { afterEach, expect, it, vi } from "vitest";
import { reserveLivePlan } from "./live-quota";

function configure() {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://safe-example.upstash.io");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "offline-test-token");
  vi.stubEnv("QLOO_LIVE_PLANS_PER_HOUR", "2");
}

afterEach(() => vi.unstubAllEnvs());

it("fails closed without a shared quota configuration", async () => {
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("QLOO_LIVE_PLANS_PER_HOUR", "");
  const transport = vi.fn<typeof fetch>();
  await expect(reserveLivePlan(transport)).rejects.toMatchObject({
    code: "QLOO_GUARD_UNAVAILABLE",
    status: 503,
  });
  expect(transport).not.toHaveBeenCalled();
});

it.each([
  "https://safe-example.upstash.io.evil.test",
  "https://safe-example.upstash.io:8443",
  "https://safe-example.upstash.io/other-path",
])("rejects an unapproved Redis URL before sending its token", async (url) => {
  configure();
  vi.stubEnv("UPSTASH_REDIS_REST_URL", url);
  const transport = vi.fn<typeof fetch>();
  await expect(reserveLivePlan(transport)).rejects.toMatchObject({
    code: "QLOO_GUARD_UNAVAILABLE",
  });
  expect(transport).not.toHaveBeenCalled();
});

it("uses one atomic, server-only reservation before allowing live planning", async () => {
  configure();
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ result: [1, 1] }));
  await reserveLivePlan(transport);
  expect(transport).toHaveBeenCalledTimes(1);
  const [url, init] = transport.mock.calls[0];
  expect(url).toBe("https://safe-example.upstash.io");
  expect(init).toMatchObject({
    method: "POST",
    cache: "no-store",
    redirect: "manual",
    headers: {
      Authorization: "Bearer offline-test-token",
      "Content-Type": "application/json",
    },
  });
  const command = JSON.parse(String(init?.body));
  expect(command).toMatchObject([
    "EVAL",
    expect.any(String),
    1,
    expect.any(String),
    2,
  ]);
  expect(command[1]).toContain('redis.call("INCR", KEYS[1])');
  expect(command[1]).toContain('redis.call("EXPIRE", KEYS[1], 3600)');
});

it("blocks a plan when the shared budget is spent", async () => {
  configure();
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(Response.json({ result: [0, 2] }));
  await expect(reserveLivePlan(transport)).rejects.toMatchObject({
    code: "QLOO_SHARED_QUOTA",
    status: 429,
  });
});

it.each([
  ["unauthorized", new Response(null, { status: 401 })],
  ["redirect", new Response(null, { status: 302 })],
  ["malformed", Response.json({ error: "offline test" })],
  ["inconsistent counter", Response.json({ result: [1, 999] })],
])("fails closed for a %s provider response", async (_name, response) => {
  configure();
  const transport = vi.fn<typeof fetch>().mockResolvedValue(response);
  await expect(reserveLivePlan(transport)).rejects.toMatchObject({
    code: "QLOO_GUARD_UNAVAILABLE",
    status: 503,
  });
});

it("fails closed on a provider network error", async () => {
  configure();
  const transport = vi
    .fn<typeof fetch>()
    .mockRejectedValue(new Error("offline outage"));
  await expect(reserveLivePlan(transport)).rejects.toMatchObject({
    code: "QLOO_GUARD_UNAVAILABLE",
    status: 503,
  });
});

it("rejects a limit that could silently overspend the planned ceiling", async () => {
  configure();
  vi.stubEnv("QLOO_LIVE_PLANS_PER_HOUR", "999");
  const transport = vi.fn<typeof fetch>();
  await expect(reserveLivePlan(transport)).rejects.toMatchObject({
    code: "QLOO_GUARD_UNAVAILABLE",
  });
  expect(transport).not.toHaveBeenCalled();
});
