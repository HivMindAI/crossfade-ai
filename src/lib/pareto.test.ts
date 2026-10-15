import { expect, it } from "vitest";
import { type Domain, type Entity, type PlanRequest } from "./model";
import { buildCandidates, negotiate, type EvidenceMatrix } from "./negotiation";

const domains: Domain[] = ["artist", "movie", "book"];
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

function fixture(counts: Record<Domain, number>): EvidenceMatrix {
  return Object.fromEntries(
    domains.map((domain) => {
      const entities: Entity[] = Array.from(
        { length: counts[domain] },
        (_, i) => ({
          id: `${domain}-${i}`,
          name: `${domain} ${i}`,
          domain,
          ...(domain === "movie" ? { duration: 90, contentRating: "PG" } : {}),
        }),
      );
      return [
        domain,
        [entities, [...entities].reverse()].map((items) => ({
          entities: items,
          signalIds: ["seed"],
          source: "synthetic" as const,
        })),
      ];
    }),
  ) as EvidenceMatrix;
}

it("retains both extreme non-dominated options beyond the old top-12 cut", () => {
  const options = negotiate(
    fixture({ artist: 20, movie: 1, book: 1 }),
    request,
  );
  expect(options).toHaveLength(3);
  expect(
    options.find((item) => item.path === "audience-a")?.candidates[0].entity.id,
  ).toBe("artist-0");
  expect(
    options.find((item) => item.path === "audience-b")?.candidates[0].entity.id,
  ).toBe("artist-19");
});

it("agrees with an exhaustive Pareto oracle on small three-domain scenarios", () => {
  for (const n of [2, 3, 4]) {
    const matrix = fixture({ artist: n, movie: n, book: n });
    const eligible = buildCandidates(matrix, request);
    const tuples = eligible.artist.flatMap((a) =>
      eligible.movie.flatMap((m) =>
        eligible.book.map((b) => ({
          id: [a, m, b].map((item) => item.entity.id).join("~"),
          balance: [
            a.ranks[0] + m.ranks[0] + b.ranks[0],
            a.ranks[1] + m.ranks[1] + b.ranks[1],
          ] as [number, number],
        })),
      ),
    );
    const oracle = tuples.filter(
      (item) =>
        !tuples.some(
          (other) =>
            other.balance[0] <= item.balance[0] &&
            other.balance[1] <= item.balance[1] &&
            (other.balance[0] < item.balance[0] ||
              other.balance[1] < item.balance[1]),
        ),
    );
    const observed = negotiate(matrix, request);
    expect(
      observed.every((option) => oracle.some((item) => item.id === option.id)),
    ).toBe(true);
    const minA = Math.min(...oracle.map((item) => item.balance[0]));
    const minB = Math.min(...oracle.map((item) => item.balance[1]));
    expect(observed.some((item) => item.balance[0] === minA)).toBe(true);
    expect(observed.some((item) => item.balance[1] === minB)).toBe(true);
  }
});

it("measures the bounded 40-candidate-per-domain case", () => {
  const matrix = fixture({ artist: 40, movie: 40, book: 40 });
  const start = performance.now();
  const options = negotiate(matrix, request);
  const elapsed = Math.round(performance.now() - start);
  expect(options).toHaveLength(3);
  console.info(
    `Synthetic Pareto benchmark: 64,000 tuples, ${elapsed} ms on this runner.`,
  );
});
