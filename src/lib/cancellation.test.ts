import { expect, it, vi } from "vitest";
import { type CulturalSource, type PlanRequest } from "./model";
import { runNegotiation } from "./orchestrator";
import { QlooClient } from "./qloo";

const request: PlanRequest = {
  mode: "synthetic",
  audiences: [
    { name: "A", interests: [{ name: "Seed A", type: "artist" }] },
    { name: "B", interests: [{ name: "Seed B", type: "artist" }] },
  ],
  constraints: {
    maxMovieMinutes: 120,
    allowedRatings: ["PG"],
    excludedIds: [],
  },
};

function gate() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

it("stops before Insights when aborted during Search", async () => {
  const controller = new AbortController();
  const pending = gate();
  let searches = 0;
  let insights = 0;
  const source: CulturalSource = {
    async search(name, domain) {
      searches++;
      await pending.promise;
      return [{ id: name, name, domain }];
    },
    async insights() {
      insights++;
      return { entities: [], signalIds: [], source: "synthetic" };
    },
  };
  const result = runNegotiation(request, source, { signal: controller.signal });
  expect(searches).toBe(2);
  controller.abort();
  pending.release();
  await expect(result).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
  expect(insights).toBe(0);
});

it("stops queued Insights after an observable abort", async () => {
  const controller = new AbortController();
  const pending = gate();
  let insights = 0;
  const source: CulturalSource = {
    async search(name, domain) {
      return [{ id: name, name, domain }];
    },
    async insights() {
      insights++;
      await pending.promise;
      return { entities: [], signalIds: [], source: "synthetic" };
    },
  };
  const result = runNegotiation(request, source, {
    signal: controller.signal,
    concurrency: 1,
  });
  await vi.waitFor(() => expect(insights).toBe(1));
  controller.abort();
  pending.release();
  await expect(result).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
  expect(insights).toBe(1);
});

it("stops the second recovery page after aborting the first", async () => {
  const controller = new AbortController();
  const pending = gate();
  let recovery = 0;
  const source: CulturalSource = {
    async search(name, domain) {
      return [{ id: name, name, domain }];
    },
    async insights(domain, signalIds, _excluded, options) {
      if (options?.page === 2) {
        recovery++;
        await pending.promise;
      }
      return {
        entities:
          domain === "artist"
            ? Array.from({ length: 20 }, (_, i) => ({
                id: `${signalIds[0]}-${i}`,
                name: `item ${i}`,
                domain,
              }))
            : [
                {
                  id: domain,
                  name: domain,
                  domain,
                  ...(domain === "movie"
                    ? { duration: 90, contentRating: "PG" }
                    : {}),
                },
              ],
        signalIds,
        source: "synthetic",
        ...options,
      };
    },
  };
  const result = runNegotiation(request, source, {
    signal: controller.signal,
    concurrency: 1,
  });
  await vi.waitFor(() => expect(recovery).toBe(1));
  controller.abort();
  pending.release();
  await expect(result).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
  expect(recovery).toBe(1);
});

it("cancels a Qloo retry wait without dispatching another attempt", async () => {
  const controller = new AbortController();
  const fetcher = vi.fn(async () => {
    queueMicrotask(() => controller.abort());
    return new Response(null, { status: 429, headers: { "Retry-After": "1" } });
  }) as unknown as typeof fetch;
  const client = new QlooClient("offline-test-key", fetcher);
  await expect(
    client.search("Seed A", "artist", { signal: controller.signal }),
  ).rejects.toMatchObject({ code: "REQUEST_ABORTED" });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(client.metrics().httpAttempts).toBe(1);
});
