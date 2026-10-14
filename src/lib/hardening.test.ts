import { describe, expect, it } from "vitest";
import {
  type CulturalSource,
  type Domain,
  type Entity,
  type PlanRequest,
} from "./model";
import { buildCandidates, negotiate, type EvidenceMatrix } from "./negotiation";
import { runNegotiation } from "./orchestrator";
import { syntheticSource } from "./synthetic";

// All names, IDs, ranks, and film metadata in this file are SYNTHETIC fixtures.
const base = (): PlanRequest => ({
  mode: "synthetic",
  audiences: [
    { name: "A", interests: [{ name: "Miles Davis", type: "artist" }] },
    { name: "B", interests: [{ name: "Beyoncé", type: "artist" }] },
  ],
  constraints: {
    maxMovieMinutes: 120,
    maxProgramMinutes: 180,
    allowedRatings: ["G", "PG", "PG-13"],
    excludedIds: [],
  },
});

function entity(id: string, domain: Domain, duration = 90): Entity {
  return {
    id,
    name: id,
    domain,
    ...(domain === "movie" ? { duration, contentRating: "PG" } : {}),
  };
}

function matrix(): EvidenceMatrix {
  return Object.fromEntries(
    (["artist", "movie", "book"] as Domain[]).map((domain) => [
      domain,
      [0, 1].map((side) => ({
        entities: [entity(`shared-${domain}`, domain)],
        signalIds: [`seed-${side}`],
        source: "synthetic",
      })),
    ]),
  ) as EvidenceMatrix;
}

describe("conditional planning and negotiation hardening", () => {
  it("recovers a missing domain by requesting only its full second pages", async () => {
    let active = 0;
    let peak = 0;
    const pages: string[] = [];
    const source: CulturalSource = {
      async search(name, domain) {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        return [{ id: `seed-${name}`, name, domain }];
      },
      async insights(domain, signalIds, _excluded, options) {
        active++;
        peak = Math.max(peak, active);
        await Promise.resolve();
        active--;
        const side = signalIds[0].includes("Miles") ? "a" : "b";
        pages.push(`${domain}-${side}-${options?.page}`);
        const entities =
          domain === "artist"
            ? options?.page === 2
              ? [entity("shared-artist", domain)]
              : Array.from({ length: 20 }, (_, index) =>
                  entity(`${side}-${index}`, domain),
                )
            : [entity(`shared-${domain}`, domain)];
        return { entities, signalIds, source: "synthetic", ...options };
      },
    };
    const result = await runNegotiation(base(), source);
    expect(result.status).toBe("ready");
    expect(result.options[0].candidates[0].entity.id).toBe("shared-artist");
    expect(pages.filter((entry) => entry.endsWith("-2"))).toEqual([
      "artist-a-2",
      "artist-b-2",
    ]);
    expect(result.metrics).toMatchObject({ sourceCalls: 10, recoveryCalls: 2 });
    expect(result.metrics.sharedEligible.artist).toBe(1);
    expect(result.metrics.elapsedMs).toBeGreaterThanOrEqual(0);
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(3);
    expect(
      result.audit.some(
        (item) => item.step === "REPLAN" && item.detail.includes("page two"),
      ),
    ).toBe(true);
  });

  it("returns a precise no-solution gap when one short domain has no shared IDs", async () => {
    const source: CulturalSource = {
      async search(name, domain) {
        return [{ id: `seed-${name}`, name, domain }];
      },
      async insights(domain, signalIds) {
        const side = signalIds[0].includes("Miles") ? "a" : "b";
        return {
          entities: [
            entity(
              domain === "book" ? `${side}-book` : `shared-${domain}`,
              domain,
            ),
          ],
          signalIds,
          source: "synthetic",
        };
      },
    };
    const result = await runNegotiation(base(), source);
    expect(result.status).toBe("no-solution");
    expect(result.gaps).toEqual([
      expect.stringContaining("book: the audiences have no shared entity IDs"),
    ]);
    expect(result.metrics).toMatchObject({ sourceCalls: 8, recoveryCalls: 0 });
    expect(result.metrics.sharedEligible.book).toBe(0);
    expect(
      result.audit.some((item) =>
        item.detail.includes("ask the user to revise"),
      ),
    ).toBe(true);
  });

  it("rejects conflicting film metadata and a known total-program overrun", () => {
    const data = matrix();
    data.movie[1].entities[0].duration = 105;
    expect(buildCandidates(data, base()).movie).toEqual([]);
    data.movie[1].entities[0].duration = undefined;
    data.movie[0].entities[0].duration = undefined;
    expect(buildCandidates(data, base()).movie).toHaveLength(1);
    expect(negotiate(data, base())[0]).toMatchObject({
      scheduleStatus: "conceptual",
      programMinutes: null,
      unverified: ["runtime"],
    });
    data.movie[0].entities[0].duration = 100;
    const request = base();
    request.constraints.maxProgramMinutes = 140;
    expect(negotiate(data, request)).toEqual([]); // 100 + 45 > 140
    expect(request.constraints.maxMovieMinutes).toBe(120);
  });

  it("offers only actual non-dominated, directionally distinct alternatives", async () => {
    const result = await runNegotiation(base(), syntheticSource);
    expect(result.status).toBe("ready");
    const fair = result.options[0];
    expect(fair.path).toBe("fairness");
    for (const option of result.options.slice(1)) {
      if (option.path === "audience-a") {
        expect(option.balance[0]).toBeLessThan(fair.balance[0]);
        expect(option.balance[1]).toBeGreaterThan(fair.balance[1]);
      } else {
        expect(option.path).toBe("audience-b");
        expect(option.balance[1]).toBeLessThan(fair.balance[1]);
        expect(option.balance[0]).toBeGreaterThan(fair.balance[0]);
      }
    }
    expect(new Set(result.options.map((option) => option.id)).size).toBe(
      result.options.length,
    );
    expect(
      result.options.every(
        (option) =>
          option.programMinutes !== null && option.programMinutes <= 180,
      ),
    ).toBe(true);
  });

  it("shows fewer paths when the Pareto frontier offers no meaningful trade-off", () => {
    const data = matrix();
    const options = negotiate(data, base());
    expect(options).toHaveLength(1);
    expect(options[0].path).toBe("fairness");
  });

  it("keeps every prior rejection through several repair runs", async () => {
    const request = base();
    const rejected = new Set<string>();
    for (let attempt = 0; attempt < 4; attempt++) {
      const result = await runNegotiation(request, syntheticSource);
      if (result.status === "no-solution") break;
      const movie = result.options[0].candidates[1].entity.id;
      expect(rejected.has(movie)).toBe(false);
      rejected.add(movie);
      request.constraints.excludedIds.push(movie);
      expect(
        result.options.every((option) =>
          option.candidates.every((pick) => !rejected.has(pick.entity.id)),
        ),
      ).toBe(false);
    }
    const final = await runNegotiation(request, syntheticSource);
    expect(
      final.options.every((option) =>
        option.candidates.every((pick) => !rejected.has(pick.entity.id)),
      ),
    ).toBe(true);
    expect(final.audit.some((item) => item.step === "REPLAN")).toBe(true);
  });

  it("replans a mock Qloo-style conceptual journey through rejection and no-solution", async () => {
    const request = base();
    request.mode = "live";
    const source: CulturalSource = {
      async search(name, domain) {
        return [{ id: `mock-seed-${name}`, name, domain }];
      },
      async insights(domain, signalIds, excludedIds, options) {
        const sideA = signalIds[0].includes("Miles");
        const order = sideA ? [1, 2] : [2, 1];
        return {
          entities: order
            .map((index) => entity(`mock-${domain}-${index}`, domain))
            .filter((item) => !excludedIds.includes(item.id))
            .map((item) =>
              domain === "movie"
                ? { ...item, duration: undefined, contentRating: undefined }
                : item,
            ),
          signalIds,
          source: "qloo",
          ...options,
        };
      },
    };
    const first = await runNegotiation(request, source);
    expect(first.status).toBe("conceptual");
    expect(
      first.options[0].candidates.every(
        (candidate) => candidate.source === "qloo",
      ),
    ).toBe(true);
    expect(first.options[0].candidates[1].receipt.unverified).toContain(
      "Film runtime and both duration limits",
    );
    expect(first.warning).toBeUndefined();
    expect(first.options).toHaveLength(3);
    expect(
      first.options.every((option) => option.scheduleStatus === "conceptual"),
    ).toBe(true);
    expect(first.metrics.sharedEligible).toEqual({
      artist: 2,
      movie: 2,
      book: 2,
    });

    const rejectedMovie = first.options[0].candidates[1].entity.id;
    request.constraints.excludedIds.push(rejectedMovie);
    const repaired = await runNegotiation(request, source);
    expect(repaired.status).toBe("conceptual");
    expect(repaired.metrics.sharedEligible.movie).toBe(1);
    expect(
      repaired.options.every((option) =>
        option.candidates.every(
          (candidate) => candidate.entity.id !== rejectedMovie,
        ),
      ),
    ).toBe(true);
    expect(repaired.audit.some((step) => step.step === "REPLAN")).toBe(true);

    request.constraints.excludedIds.push(
      `mock-movie-${rejectedMovie.endsWith("1") ? "2" : "1"}`,
    );
    const exhausted = await runNegotiation(request, source);
    expect(exhausted.status).toBe("no-solution");
    expect(exhausted.metrics.sharedEligible.movie).toBe(0);
    expect(exhausted.gaps).toEqual([expect.stringContaining("movie:")]);
  });

  it("fails before any source call when the budget cannot cover baseline work", async () => {
    let count = 0;
    const source: CulturalSource = {
      async search() {
        count++;
        return [];
      },
      async insights() {
        count++;
        return { entities: [], signalIds: [], source: "synthetic" };
      },
    };
    await expect(
      runNegotiation(base(), source, { maxSourceCalls: 7 }),
    ).rejects.toMatchObject({ code: "BUDGET" });
    expect(count).toBe(0);
  });

  it("measures bounded transport concurrency and elapsed planning time", async () => {
    let active = 0;
    let peak = 0;
    const delay = async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 15));
      active--;
    };
    const source: CulturalSource = {
      async search(name, domain) {
        await delay();
        return [{ id: `seed-${name}`, name, domain }];
      },
      async insights(domain, signalIds) {
        await delay();
        return {
          entities: [entity(`shared-${domain}`, domain)],
          signalIds,
          source: "synthetic",
        };
      },
    };
    const result = await runNegotiation(base(), source);
    expect(result.status).toBe("ready");
    expect(result.metrics).toMatchObject({ sourceCalls: 8, recoveryCalls: 0 });
    expect(peak).toBe(3);
    expect(result.metrics.elapsedMs).toBeGreaterThanOrEqual(45);
    console.info(
      `Synthetic timed transport: ${result.metrics.sourceCalls} calls, peak ${peak} concurrent, ${result.metrics.elapsedMs} ms elapsed.`,
    );
  });
});
