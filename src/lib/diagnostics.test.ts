import { describe, expect, it } from "vitest";
import {
  type CulturalSource,
  type Domain,
  type Entity,
  type PlanRequest,
} from "./model";
import { evaluateSyntheticScenario } from "./evaluation";
import { runNegotiation } from "./orchestrator";
import { syntheticSource } from "./synthetic";

const request = (): PlanRequest => ({
  mode: "synthetic",
  audiences: [
    { name: "A", interests: [{ name: "Alpha", type: "artist" }] },
    { name: "B", interests: [{ name: "Beta", type: "artist" }] },
  ],
  constraints: {
    maxMovieMinutes: 120,
    maxProgramMinutes: 180,
    allowedRatings: ["PG"],
    excludedIds: [],
  },
});
const entity = (
  id: string,
  domain: Domain,
  patch: Partial<Entity> = {},
): Entity => ({
  id,
  name: id,
  domain,
  ...(domain === "movie" ? { duration: 90, contentRating: "PG" } : {}),
  ...patch,
});
function fixture(
  overrides: Partial<Record<Domain, [Entity[], Entity[]]>> = {},
): CulturalSource {
  return {
    async search(name, domain) {
      return [{ id: `seed-${name}`, name, domain }];
    },
    async insights(domain, signalIds) {
      const side = signalIds[0] === "seed-Alpha" ? 0 : 1;
      return {
        entities: (overrides[domain] ?? [
          [entity(domain, domain)],
          [entity(domain, domain)],
        ])[side],
        signalIds,
        source: "synthetic",
      };
    },
  };
}

describe("retrieved-pool diagnostics and receipts", () => {
  it("rejects conflicting metadata on duplicate IDs within one audience", async () => {
    const films: [Entity[], Entity[]] = [
      [
        entity("duplicate", "movie", { contentRating: "PG" }),
        entity("duplicate", "movie", { contentRating: "R" }),
      ],
      [entity("duplicate", "movie", { contentRating: "PG" })],
    ];
    const result = await runNegotiation(request(), fixture({ movie: films }));
    expect(result.status).toBe("no-solution");
    expect(result.diagnostics[1]).toMatchObject({
      shared: 1,
      eligible: 0,
      issues: { "metadata-conflict": 1 },
    });
  });
  it("recovers full pages containing rejected rows and keeps original second-page positions", async () => {
    const input = request();
    input.constraints.excludedIds = ["rejected"];
    const mock: CulturalSource = {
      ...fixture(),
      async insights(domain, signalIds, _excluded, options) {
        const side = signalIds[0];
        const entities =
          domain !== "artist"
            ? [entity(domain, domain)]
            : options?.page === 2
              ? [entity("rejected", domain), entity("bridge", domain)]
              : [
                  entity("rejected", domain),
                  ...Array.from({ length: 19 }, (_, i) =>
                    entity(`${side}-${i}`, domain),
                  ),
                ];
        return { entities, signalIds, source: "synthetic", ...options };
      },
    };
    const result = await runNegotiation(input, mock);
    expect(result.status).toBe("ready");
    expect(result.metrics.recoveryCalls).toBe(2);
    expect(result.options[0].candidates[0]).toMatchObject({
      entity: { id: "bridge" },
      ranks: [22, 22],
    });
    expect(result.diagnostics[0].issues).toEqual({ excluded: 1 });
    expect(
      result.diagnostics[0].partial.some(
        (item) => item.entity.id === "rejected",
      ),
    ).toBe(false);
  });
  it("keeps valid partial evidence but never labels it a complete plan", async () => {
    const result = await runNegotiation(
      request(),
      fixture({ book: [[entity("a", "book")], [entity("b", "book")]] }),
    );
    expect(result.status).toBe("no-solution");
    expect(result.options).toEqual([]);
    expect(
      result.diagnostics?.find((item) => item.domain === "artist"),
    ).toMatchObject({ eligible: 1, recovery: "not-needed" });
    expect(
      result.diagnostics?.find((item) => item.domain === "book"),
    ).toMatchObject({
      eligible: 0,
      issues: { "no-shared-ids": 1 },
      recovery: "no-full-page",
    });
    expect(
      result.diagnostics?.find((item) => item.domain === "artist")?.partial[0]
        .receipt.checked,
    ).toContain("Rejected IDs excluded");
  });

  it("distinguishes multiple empty or disjoint domains", async () => {
    const result = await runNegotiation(
      request(),
      fixture({
        movie: [[], []],
        book: [[entity("a", "book")], [entity("b", "book")]],
      }),
    );
    expect(result.status).toBe("no-solution");
    expect(
      result.diagnostics?.find((item) => item.domain === "movie")?.issues,
    ).toEqual({ "no-source-results": 1 });
    expect(
      result.diagnostics?.find((item) => item.domain === "book")?.issues,
    ).toEqual({ "no-shared-ids": 1 });
  });

  it("separates rejected IDs, conflicting metadata, invalid runtime and known limits", async () => {
    const input = request();
    input.constraints.excludedIds.push("excluded");
    const filmsA = [
      entity("excluded", "movie"),
      entity("conflict", "movie", { duration: 80 }),
      entity("invalid", "movie", { duration: 0 }),
      entity("long", "movie", { duration: 150 }),
      entity("program", "movie", { duration: 110 }),
      entity("rating", "movie", { contentRating: "R" }),
    ];
    const filmsB = filmsA.map((item) =>
      item.id === "conflict" ? { ...item, duration: 90 } : item,
    );
    input.constraints.maxProgramMinutes = 145;
    const result = await runNegotiation(
      input,
      fixture({ movie: [filmsA, filmsB] }),
    );
    expect(result.status).toBe("no-solution");
    expect(
      result.diagnostics?.find((item) => item.domain === "movie")?.issues,
    ).toEqual({
      excluded: 1,
      "metadata-conflict": 1,
      "invalid-runtime": 1,
      "film-limit": 1,
      "program-limit": 1,
      rating: 1,
    });
  });

  it("reports a skipped recovery when a full page cannot fit the source budget", async () => {
    const long = (side: string) =>
      Array.from({ length: 20 }, (_, index) =>
        entity(`${side}-${index}`, "book"),
      );
    const result = await runNegotiation(
      request(),
      fixture({ book: [long("a"), long("b")] }),
      { maxSourceCalls: 8 },
    );
    expect(
      result.diagnostics?.find((item) => item.domain === "book")?.recovery,
    ).toBe("budget-limited");
    expect(result.metrics).toMatchObject({ sourceCalls: 8, recoveryCalls: 0 });
  });

  it("makes unknown film metadata conceptual and keeps source and rule receipts", async () => {
    const film = entity("unknown", "movie", {
      duration: undefined,
      contentRating: undefined,
    });
    const result = await runNegotiation(
      request(),
      fixture({ movie: [[film], [film]] }),
    );
    expect(result.status).toBe("conceptual");
    const receipt = result.options[0].candidates[1].receipt;
    expect(receipt.unverified).toContain(
      "Film runtime and both duration limits",
    );
    expect(receipt.unverified).toContain("Film content rating");
    expect(receipt.limitations).toContain(
      "Invented development fixture; not Qloo evidence",
    );
    expect(result.options[0].programMinutes).toBeNull();
  });

  it("evaluates product and a simple feasible baseline on one synthetic pool", async () => {
    const first = await evaluateSyntheticScenario(request(), fixture());
    expect(first.label).toContain("SYNTHETIC OFFLINE");
    expect(first.coverage.complete).toEqual({ product: true, baseline: true });
    expect(first.product).toMatchObject({
      hardViolations: 0,
      provenanceComplete: true,
    });
    expect(first.baseline).toMatchObject({
      hardViolations: 0,
      provenanceComplete: true,
      alternativeDiversity: 1,
    });
    expect(first.repair).toMatchObject({
      attempted: true,
      rejectedAbsent: true,
      status: "no-solution",
    });
    expect(first.sourceCalls).toBe(8);
  });

  it("reproduces the built-in synthetic demonstration comparison", async () => {
    const input = request();
    input.audiences[0].interests = [
      { name: "Miles Davis", type: "artist" },
      { name: "Spirited Away", type: "movie" },
    ];
    input.audiences[1].interests = [
      { name: "Beyoncé", type: "artist" },
      { name: "Everything Everywhere All at Once", type: "movie" },
    ];
    const report = await evaluateSyntheticScenario(input, syntheticSource);
    expect(report.coverage.complete).toEqual({ product: true, baseline: true });
    expect(report.product.hardViolations).toBe(0);
    expect(report.baseline.hardViolations).toBe(0);
    expect(report.repair.rejectedAbsent).toBe(true);
    console.info(`SYNTHETIC fixture comparison: ${JSON.stringify(report)}`);
  });

  it("rejects live mode in the offline evaluator", async () => {
    const input = request();
    input.mode = "live";
    await expect(evaluateSyntheticScenario(input, fixture())).rejects.toThrow(
      "synthetic mode only",
    );
  });
});
