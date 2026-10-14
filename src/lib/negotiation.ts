import {
  DOMAINS,
  type Blueprint,
  type Candidate,
  type Domain,
  type EligibilityIssue,
  type Entity,
  type EvidenceSet,
  type PlanRequest,
} from "./model";

export type EvidenceMatrix = Record<Domain, [EvidenceSet, EvidenceSet]>;
export const PROGRAM_OVERHEAD_MINUTES = 45; // 20 listening, 10 transition, 15 discussion
export const DEFAULT_MAX_PROGRAM_MINUTES = 180;

function mergedEntity(a: Entity, b: Entity): Entity | undefined {
  if (
    a.duration !== undefined &&
    b.duration !== undefined &&
    a.duration !== b.duration
  )
    return undefined;
  if (a.contentRating && b.contentRating && a.contentRating !== b.contentRating)
    return undefined;
  return {
    ...a,
    duration: a.duration ?? b.duration,
    contentRating: a.contentRating ?? b.contentRating,
  };
}

function indexedEvidence(set: EvidenceSet) {
  const indexed = new Map<
    string,
    { entity: Entity; rank: number; conflict: boolean }
  >();
  set.entities.forEach((entity, index) => {
    const previous = indexed.get(entity.id);
    if (!previous)
      indexed.set(entity.id, {
        entity,
        rank: entity.retrievedRank ?? index + 1,
        conflict: false,
      });
    else {
      const merged = mergedEntity(previous.entity, entity);
      if (!merged) previous.conflict = true;
      else previous.entity = merged;
    }
  });
  return indexed;
}

function eligibilityIssue(
  entity: Entity,
  request: PlanRequest,
): EligibilityIssue | undefined {
  if (request.constraints.excludedIds.includes(entity.id)) return "excluded";
  if (entity.domain !== "movie") return undefined;
  // Missing metadata permits only a conceptual option. Known violations still
  // disqualify the film; unknown values never count as a passed hard gate.
  if (entity.duration !== undefined) {
    if (!Number.isInteger(entity.duration) || entity.duration <= 0)
      return "invalid-runtime";
    if (entity.duration > request.constraints.maxMovieMinutes)
      return "film-limit";
    if (
      entity.duration + PROGRAM_OVERHEAD_MINUTES >
      (request.constraints.maxProgramMinutes ?? DEFAULT_MAX_PROGRAM_MINUTES)
    )
      return "program-limit";
  }
  if (
    entity.contentRating !== undefined &&
    !request.constraints.allowedRatings.includes(
      entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
    )
  )
    return "rating";
  return undefined;
}

export function inspectDomain(
  domain: Domain,
  pair: [EvidenceSet, EvidenceSet],
  request: PlanRequest,
): {
  candidates: Candidate[];
  shared: number;
  issues: Partial<Record<EligibilityIssue, number>>;
} {
  const [a, b] = pair;
  const issues: Partial<Record<EligibilityIssue, number>> = {};
  const count = (issue: EligibilityIssue) => {
    issues[issue] = (issues[issue] ?? 0) + 1;
  };
  if (!a.entities.length || !b.entities.length) count("no-source-results");
  const bRank = indexedEvidence(b);
  let shared = 0;
  const candidates = [...indexedEvidence(a).values()]
    .flatMap(({ entity: first, rank, conflict }) => {
      const second = bRank.get(first.id);
      if (!second) return [];
      shared++;
      const entity = mergedEntity(first, second.entity);
      if (!entity || conflict || second.conflict) {
        count("metadata-conflict");
        return [];
      }
      const issue = eligibilityIssue(entity, request);
      if (issue) {
        count(issue);
        return [];
      }
      const ranks: [number, number] = [rank, second.rank];
      const checked = [
        "Same entity ID in both audience result sets",
        "Rejected IDs excluded",
      ];
      const unverified: string[] = [];
      if (domain === "movie") {
        if (entity.duration === undefined)
          unverified.push("Film runtime and both duration limits");
        else
          checked.push(
            "Known film runtime within film and total-program limits",
          );
        if (entity.contentRating === undefined)
          unverified.push("Film content rating");
        else checked.push("Known film rating in allowed ratings");
        unverified.push("Screening rights, availability, and venue");
      }
      const limitations = [
        "Rank positions are ordinal within separate requests, not affinity probabilities",
      ];
      if (a.source === "synthetic")
        limitations.push("Invented development fixture; not Qloo evidence");
      if (first.evidenceWarning) limitations.push(first.evidenceWarning);
      if (
        second.entity.evidenceWarning &&
        second.entity.evidenceWarning !== first.evidenceWarning
      )
        limitations.push(second.entity.evidenceWarning);
      if (
        a.source === "qloo" &&
        (first.explainability !== "available" ||
          second.entity.explainability !== "available")
      )
        limitations.push(
          "Recognized per-result Qloo explainability unavailable for at least one audience",
        );
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
          receipt: { checked, unverified, limitations },
        },
      ];
    })
    .sort(
      (x, y) =>
        Math.max(...x.ranks) - Math.max(...y.ranks) ||
        x.ranks[0] + x.ranks[1] - y.ranks[0] - y.ranks[1] ||
        x.entity.id.localeCompare(y.entity.id),
    );
  if (a.entities.length && b.entities.length && !shared) count("no-shared-ids");
  return { candidates, shared, issues };
}

export function buildCandidates(
  matrix: EvidenceMatrix,
  request: PlanRequest,
): Record<Domain, Candidate[]> {
  const result = {} as Record<Domain, Candidate[]>;
  for (const domain of DOMAINS) {
    result[domain] = inspectDomain(domain, matrix[domain], request).candidates;
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
