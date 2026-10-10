import {
  DOMAINS,
  type Blueprint,
  type Candidate,
  type Domain,
  type EvidenceSet,
  type PlanRequest,
} from "./model";

export type EvidenceMatrix = Record<Domain, [EvidenceSet, EvidenceSet]>;

function permitted(candidate: Candidate, request: PlanRequest): boolean {
  const { entity } = candidate;
  if (request.constraints.excludedIds.includes(entity.id)) return false;
  if (entity.domain === "movie") {
    // Missing metadata cannot satisfy a hard constraint.
    if (!entity.duration || !entity.contentRating) return false;
    if (entity.duration > request.constraints.maxMovieMinutes) return false;
    if (
      !request.constraints.allowedRatings.includes(
        entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
      )
    )
      return false;
  }
  return true;
}

export function buildCandidates(
  matrix: EvidenceMatrix,
  request: PlanRequest,
): Record<Domain, Candidate[]> {
  const result = {} as Record<Domain, Candidate[]>;
  for (const domain of DOMAINS) {
    const [a, b] = matrix[domain];
    const bRank = new Map(
      b.entities.map((entity, index) => [entity.id, index + 1]),
    );
    result[domain] = a.entities
      .flatMap((entity, index) => {
        const rankB = bRank.get(entity.id);
        if (!rankB) return [];
        const candidate: Candidate = {
          entity,
          ranks: [index + 1, rankB],
          signals: [a.signalIds, b.signalIds],
          source: a.source,
          explanation: `Appears in both audience result sets: #${index + 1} for ${request.audiences[0].name}, #${rankB} for ${request.audiences[1].name}. Rank is within each request, not a probability.`,
        };
        return permitted(candidate, request) ? [candidate] : [];
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

export function negotiate(
  matrix: EvidenceMatrix,
  request: PlanRequest,
): Blueprint[] {
  const eligible = buildCandidates(matrix, request);
  if (DOMAINS.some((domain) => eligible[domain].length === 0)) return [];
  const combinations: Blueprint[] = [];
  for (const artist of eligible.artist.slice(0, 4)) {
    for (const movie of eligible.movie.slice(0, 4)) {
      for (const book of eligible.book.slice(0, 4)) {
        const picks = [artist, movie, book];
        const balance: [number, number] = [0, 1].map((side) =>
          picks.reduce((sum, pick) => sum + pick.ranks[side], 0),
        ) as [number, number];
        combinations.push({
          id: picks.map((pick) => pick.entity.id).join("~"),
          title: `The ${artist.entity.name.split(" ")[1] ?? "Shared"} Exchange`,
          candidates: picks,
          balance,
          rationale: `A listening opening, shared screening, and reading prompt. This sequence is a creative interpretation. Both audiences have evidence for all three selections.`,
        });
      }
    }
  }
  combinations.sort(
    (x, y) =>
      Math.max(...x.balance) - Math.max(...y.balance) ||
      Math.abs(x.balance[0] - x.balance[1]) -
        Math.abs(y.balance[0] - y.balance[1]) ||
      x.balance[0] + x.balance[1] - y.balance[0] - y.balance[1] ||
      x.id.localeCompare(y.id),
  );
  const selected: Blueprint[] = [];
  for (const option of combinations) {
    if (selected.length >= 3) break;
    if (
      selected.some(
        (existing) =>
          existing.candidates.filter(
            (candidate, i) =>
              candidate.entity.id !== option.candidates[i].entity.id,
          ).length < 1,
      )
    )
      continue;
    selected.push(option);
  }
  return selected;
}
