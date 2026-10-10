import {
  DOMAINS,
  type Blueprint,
  type Candidate,
  type Domain,
  type Entity,
  type EvidenceSet,
  type PlanRequest,
} from "./model";

export type EvidenceMatrix = Record<Domain, [EvidenceSet, EvidenceSet]>;
export const PROGRAM_OVERHEAD_MINUTES = 45; // 20 listening, 10 transition, 15 discussion
export const DEFAULT_MAX_PROGRAM_MINUTES = 180;

function mergedEntity(a: Entity, b: Entity): Entity | undefined {
  if (a.duration && b.duration && a.duration !== b.duration) return undefined;
  if (a.contentRating && b.contentRating && a.contentRating !== b.contentRating)
    return undefined;
  return {
    ...a,
    duration: a.duration ?? b.duration,
    contentRating: a.contentRating ?? b.contentRating,
  };
}

function permitted(entity: Entity, request: PlanRequest): boolean {
  if (request.constraints.excludedIds.includes(entity.id)) return false;
  if (entity.domain !== "movie") return true;
  if (!entity.duration || !entity.contentRating) return false;
  if (entity.duration > request.constraints.maxMovieMinutes) return false;
  if (
    entity.duration + PROGRAM_OVERHEAD_MINUTES >
    (request.constraints.maxProgramMinutes ?? DEFAULT_MAX_PROGRAM_MINUTES)
  )
    return false;
  return request.constraints.allowedRatings.includes(
    entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
  );
}

export function buildCandidates(
  matrix: EvidenceMatrix,
  request: PlanRequest,
): Record<Domain, Candidate[]> {
  const result = {} as Record<Domain, Candidate[]>;
  for (const domain of DOMAINS) {
    const [a, b] = matrix[domain];
    const bRank = new Map<string, { entity: Entity; rank: number }>();
    b.entities.forEach((entity, index) => {
      if (!bRank.has(entity.id))
        bRank.set(entity.id, { entity, rank: index + 1 });
    });
    const seen = new Set<string>();
    result[domain] = a.entities
      .flatMap((first, index) => {
        if (seen.has(first.id)) return [];
        seen.add(first.id);
        const second = bRank.get(first.id);
        if (!second) return [];
        const entity = mergedEntity(first, second.entity);
        if (!entity || !permitted(entity, request)) return [];
        const ranks: [number, number] = [index + 1, second.rank];
        return [
          {
            entity,
            ranks,
            signals: [a.signalIds, b.signalIds] as [string[], string[]],
            influences: [
              first.influence ?? [],
              second.entity.influence ?? [],
            ] as Candidate["influences"],
            source: a.source,
            explanation: `Appears by the same entity ID in both result sets: #${ranks[0]} for ${request.audiences[0].name}, #${ranks[1]} for ${request.audiences[1].name}. These are positions within separate requests, not probabilities.`,
          },
        ];
      })
      .sort(
        (x, y) =>
          Math.max(...x.ranks) - Math.max(...y.ranks) ||
          x.ranks[0] + x.ranks[1] - y.ranks[0] - y.ranks[1] ||
          x.entity.id.localeCompare(y.entity.id),
      );
  }
  return result;
}

function dominates(a: Blueprint, b: Blueprint): boolean {
  return (
    a.balance[0] <= b.balance[0] &&
    a.balance[1] <= b.balance[1] &&
    (a.balance[0] < b.balance[0] || a.balance[1] < b.balance[1])
  );
}

function compareFairness(a: Blueprint, b: Blueprint): number {
  return (
    Math.max(...a.balance) - Math.max(...b.balance) ||
    Math.abs(a.balance[0] - a.balance[1]) -
      Math.abs(b.balance[0] - b.balance[1]) ||
    a.balance[0] + a.balance[1] - b.balance[0] - b.balance[1] ||
    a.id.localeCompare(b.id)
  );
}

export function negotiate(
  matrix: EvidenceMatrix,
  request: PlanRequest,
): Blueprint[] {
  const eligible = buildCandidates(matrix, request);
  if (DOMAINS.some((domain) => eligible[domain].length === 0)) return [];
  const combinations: Blueprint[] = [];
  for (const artist of eligible.artist.slice(0, 12)) {
    for (const movie of eligible.movie.slice(0, 12)) {
      for (const book of eligible.book.slice(0, 12)) {
        const picks = [artist, movie, book];
        const balance: [number, number] = [
          picks.reduce((sum, pick) => sum + pick.ranks[0], 0),
          picks.reduce((sum, pick) => sum + pick.ranks[1], 0),
        ];
        combinations.push({
          id: picks.map((pick) => pick.entity.id).join("~"),
          title: `The ${artist.entity.name.split(" ")[1] ?? "Shared"} Exchange`,
          candidates: picks,
          balance,
          path: "fairness",
          programMinutes: movie.entity.duration! + PROGRAM_OVERHEAD_MINUTES,
          rationale:
            "A listening opening, shared screening, and reading prompt. The sequence is a creative interpretation; the rank totals are algorithmic, ordinal scores.",
        });
      }
    }
  }
  const frontier = combinations.filter(
    (candidate) => !combinations.some((other) => dominates(other, candidate)),
  );
  frontier.sort(compareFairness);
  const fair = frontier[0];
  const selected = [fair];
  const favorsA = frontier
    .filter(
      (option) =>
        option.balance[0] < fair.balance[0] &&
        option.balance[1] > fair.balance[1],
    )
    .sort((a, b) => a.balance[0] - b.balance[0] || compareFairness(a, b))[0];
  if (favorsA) selected.push({ ...favorsA, path: "audience-a" });
  const favorsB = frontier
    .filter(
      (option) =>
        option.balance[1] < fair.balance[1] &&
        option.balance[0] > fair.balance[0],
    )
    .sort((a, b) => a.balance[1] - b.balance[1] || compareFairness(a, b))[0];
  if (favorsB) selected.push({ ...favorsB, path: "audience-b" });
  return selected;
}
