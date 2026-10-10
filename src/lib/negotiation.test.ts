import { describe, expect, it } from "vitest";
import { AppError } from "./errors";
import {
  type CulturalSource,
  type Domain,
  type Entity,
  type PlanRequest,
} from "./model";
import { buildCandidates, negotiate, type EvidenceMatrix } from "./negotiation";
import { runNegotiation } from "./orchestrator";
import { syntheticSource } from "./synthetic";

const base: PlanRequest = {
  mode: "synthetic",
  audiences: [
    {
      name: "Jazz",
      interests: [
        { name: "Miles Davis", type: "artist" },
        { name: "Spirited Away", type: "movie" },
      ],
    },
    {
      name: "Pop",
      interests: [
        { name: "Beyoncé", type: "artist" },
        { name: "Everything Everywhere All at Once", type: "movie" },
      ],
    },
  ],
  constraints: {
    maxMovieMinutes: 120,
    allowedRatings: ["G", "PG", "PG-13"],
    excludedIds: [],
  },
};
const clone = () => structuredClone(base);

describe("negotiation", () => {
  it("builds alternatives with separate audience evidence", async () => {
    const result = await runNegotiation(clone(), syntheticSource);
    expect(result.status).toBe("ready");
    expect(result.options).toHaveLength(3);
    expect(result.options[0].candidates).toHaveLength(3);
    expect(
      result.options[0].candidates.every(
        (item) => item.ranks[0] > 0 && item.ranks[1] > 0,
      ),
    ).toBe(true);
    expect(result.audit.map((step) => step.step)).toEqual([
      "PLAN",
      "SELECT TOOLS",
      "EXECUTE",
      "EVALUATE",
      "VERIFY",
    ]);
  });

  it("repairs after rejection and records replanning", async () => {
    const first = await runNegotiation(clone(), syntheticSource);
    const rejected = first.options[0].candidates[1].entity.id;
    const next = clone();
    next.constraints.excludedIds = [rejected];
    const repaired = await runNegotiation(next, syntheticSource);
    expect(
      repaired.options[0].candidates.map((item) => item.entity.id),
    ).not.toContain(rejected);
    expect(repaired.audit.some((step) => step.step === "REPLAN")).toBe(true);
  });

  it("returns no solution for impossible constraints", async () => {
    const next = clone();
    next.constraints.maxMovieMinutes = 60;
    next.constraints.allowedRatings = ["R"];
    expect((await runNegotiation(next, syntheticSource)).status).toBe(
      "no-solution",
    );
  });

  it("returns no solution when the audiences have no shared IDs", () => {
    const entity = (id: string, domain: Domain): Entity => ({
      id,
      name: id,
      domain,
      ...(domain === "movie" ? { duration: 90, contentRating: "PG" } : {}),
    });
    const matrix = Object.fromEntries(
      (["artist", "movie", "book"] as Domain[]).map((domain) => [
        domain,
        [
          {
            source: "synthetic",
            signalIds: ["a"],
            entities: [entity(`a-${domain}`, domain)],
          },
          {
            source: "synthetic",
            signalIds: ["b"],
            entities: [entity(`b-${domain}`, domain)],
          },
        ],
      ]),
    ) as EvidenceMatrix;
    expect(negotiate(matrix, clone())).toEqual([]);
  });

  it("does not accept missing film metadata for a hard constraint", () => {
    const matrix = Object.fromEntries(
      (["artist", "movie", "book"] as Domain[]).map((domain) => [
        domain,
        [0, 1].map(() => ({
          source: "synthetic",
          signalIds: ["x"],
          entities: [{ id: domain, name: domain, domain }],
        })),
      ]),
    ) as EvidenceMatrix;
    expect(buildCandidates(matrix, clone()).movie).toEqual([]);
  });

  it("forces ambiguous entity selection", async () => {
    const source: CulturalSource = {
      ...syntheticSource,
      search: async () => [
        { id: "one", name: "Miles Davis", domain: "artist" },
        { id: "two", name: "Miles Davis", domain: "artist" },
      ],
    };
    const next = clone();
    next.audiences[0].interests = [{ name: "Miles Davis", type: "artist" }];
    await expect(runNegotiation(next, source)).rejects.toMatchObject({
      code: "AMBIGUOUS_ENTITY",
    });
  });

  it("rejects a supplied ID that is absent from search results", async () => {
    const next = clone();
    next.audiences[0].interests[0].id = "forged-id";
    await expect(runNegotiation(next, syntheticSource)).rejects.toBeInstanceOf(
      AppError,
    );
  });

  it("ranks deterministically across repeat runs", async () => {
    const first = await runNegotiation(clone(), syntheticSource);
    const second = await runNegotiation(clone(), syntheticSource);
    expect(first.options.map((option) => option.id)).toEqual(
      second.options.map((option) => option.id),
    );
  });
});
