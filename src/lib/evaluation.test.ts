import { expect, it } from "vitest";
import { type Interest, type PlanRequest } from "./model";
import { runNegotiation } from "./orchestrator";
import { syntheticCatalog, syntheticSource } from "./synthetic";

// Twenty reproducible SYNTHETIC / NOT REAL QLOO DATA evaluation scenarios.
const pairs = [
  [
    "Miles Davis",
    "Spirited Away",
    "Beyoncé",
    "Everything Everywhere All at Once",
  ],
  ["Nina Simone", "The Matrix", "Beyoncé", "Spirited Away"],
  ["Spirited Away", "The Matrix", "Miles Davis", "Nina Simone"],
  [
    "Miles Davis",
    "Nina Simone",
    "The Matrix",
    "Everything Everywhere All at Once",
  ],
];
const rules = [
  {
    name: "family friendly",
    maxMovieMinutes: 120,
    allowedRatings: ["G", "PG", "PG-13"],
    excludedIds: [],
    expected: "ready",
  },
  {
    name: "short program",
    maxMovieMinutes: 90,
    allowedRatings: ["G", "PG"],
    excludedIds: [],
    expected: "ready",
  },
  {
    name: "G only",
    maxMovieMinutes: 120,
    allowedRatings: ["G"],
    excludedIds: [],
    expected: "ready",
  },
  {
    name: "reject first screening",
    maxMovieMinutes: 120,
    allowedRatings: ["G", "PG", "PG-13"],
    excludedIds: ["syn-movie-1"],
    expected: "ready",
  },
  {
    name: "impossible duration and rating",
    maxMovieMinutes: 60,
    allowedRatings: ["R"],
    excludedIds: [],
    expected: "no-solution",
  },
] as const;
const interest = (name: string): Interest => ({
  name,
  type: syntheticCatalog.find((item) => item.name === name)!.domain,
});

for (const [pairIndex, pair] of pairs.entries()) {
  for (const [ruleIndex, rule] of rules.entries()) {
    it(`synthetic scenario ${pairIndex * 5 + ruleIndex + 1}: pair ${pairIndex + 1}, ${rule.name}`, async () => {
      const request: PlanRequest = {
        mode: "synthetic",
        audiences: [
          { name: "Audience A", interests: pair.slice(0, 2).map(interest) },
          { name: "Audience B", interests: pair.slice(2).map(interest) },
        ],
        constraints: {
          maxMovieMinutes: rule.maxMovieMinutes,
          allowedRatings: [...rule.allowedRatings],
          excludedIds: [...rule.excludedIds],
        },
      };
      const first = await runNegotiation(request, syntheticSource);
      const repeated = await runNegotiation(request, syntheticSource);
      expect(first.status).toBe(rule.expected);
      expect(first.options.map((option) => option.id)).toEqual(
        repeated.options.map((option) => option.id),
      );
      expect(
        first.options.every((option) =>
          option.candidates.every(
            (candidate) =>
              !new Set<string>(rule.excludedIds).has(candidate.entity.id),
          ),
        ),
      ).toBe(true);
    });
  }
}
