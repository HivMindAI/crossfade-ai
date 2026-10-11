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
  // Missing metadata permits only a conceptual option. Known violations still
  // disqualify the film; unknown values never count as a passed hard gate.
  if (entity.duration !== undefined) {
    if (!Number.isInteger(entity.duration) || entity.duration <= 0)
      return false;
    if (entity.duration > request.constraints.maxMovieMinutes) return false;
    if (
      entity.duration + PROGRAM_OVERHEAD_MINUTES >
      (request.constraints.maxProgramMinutes ?? DEFAULT_MAX_PROGRAM_MINUTES)
    )
      return false;
  }
  return (
    entity.contentRating === undefined ||
    request.constraints.allowedRatings.includes(
      entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
    )
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
  // At most 40 entities per domain (two 20-result pages), or 64,000 tuples.
  // A top-k cut by worst individual rank is unsafe: an extreme trade-off can
  // have a poor rank for one audience and still be globally non-dominated.
  for (const artist of eligible.artist) {
    for (const movie of eligible.movie) {
      for (const book of eligible.book) {
        const picks = [artist, movie, book];
        const unverified: Blueprint["unverified"] = [];
        if (movie.entity.duration === undefined) unverified.push("runtime");
        if (movie.entity.contentRating === undefined)
          unverified.push("content rating");
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
          programMinutes:
            movie.entity.duration === undefined
              ? null
              : movie.entity.duration + PROGRAM_OVERHEAD_MINUTES,
          scheduleStatus: unverified.length
            ? "conceptual"
            : "duration-verified",
          unverified,
          rationale:
            "A listening opening, shared screening, and reading prompt. The sequence is a creative interpretation; the rank totals are algorithmic, ordinal scores.",
        });
      }
    }
  }
  // Never let an unverified suggestion displace a valid scheduled path.
  const pool = combinations.some(
    (item) => item.scheduleStatus === "duration-verified",
  )
    ? combinations.filter((item) => item.scheduleStatus === "duration-verified")
    : combinations;
  // In two dimensions, sort by A (then B). A point is non-dominated exactly
  // when its B rank is strictly better than every previously seen point.
  // Equal balance points are interchangeable for this ordinal objective; keep
  // the lexicographically first ID as a deterministic representative.
  pool.sort(
    (a, b) =>
      a.balance[0] - b.balance[0] ||
      a.balance[1] - b.balance[1] ||
      a.id.localeCompare(b.id),
  );
  const frontier: Blueprint[] = [];
  let bestB = Infinity;
  for (const option of pool) {
    if (option.balance[1] < bestB) {
      frontier.push(option);
      bestB = option.balance[1];
    }
  }
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
