import { AppError } from "./errors";
import { throwIfAborted } from "./cancellation";
import {
  DOMAINS,
  type Action,
  type CulturalSource,
  type Domain,
  type EvidenceSet,
  type PlanRequest,
  type PlanResult,
  type SearchMatch,
} from "./model";
import { buildCandidates, negotiate, type EvidenceMatrix } from "./negotiation";

const INITIAL_TAKE = 20;
const MAX_SOURCE_CALLS = 16;
const CONCURRENCY = 3;

async function mapBounded<T, U>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<U>,
  signal?: AbortSignal,
): Promise<U[]> {
  const results = new Array<U>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (next < items.length) {
        throwIfAborted(signal);
        const index = next++;
        results[index] = await task(items[index], index);
      }
    }),
  );
  return results;
}

function reason(
  domain: Domain,
  matrix: EvidenceMatrix,
  request: PlanRequest,
): string {
  const [a, b] = matrix[domain];
  if (!a.entities.length || !b.entities.length)
    return `${domain}: at least one audience returned no recommendations.`;
  const bIds = new Set(b.entities.map((entity) => entity.id));
  const shared = a.entities.filter((entity) => bIds.has(entity.id));
  if (!shared.length)
    return `${domain}: the audiences have no shared entity IDs in the gathered results.`;
  if (
    shared.every((entity) =>
      request.constraints.excludedIds.includes(entity.id),
    )
  )
    return `${domain}: every shared entity was explicitly rejected.`;
  if (domain === "movie") {
    const available = shared.filter(
      (entity) => !request.constraints.excludedIds.includes(entity.id),
    );
    const bById = new Map(b.entities.map((entity) => [entity.id, entity]));
    if (
      available.every((entity) => {
        const other = bById.get(entity.id)!;
        return (
          (entity.duration &&
            other.duration &&
            entity.duration !== other.duration) ||
          (entity.contentRating &&
            other.contentRating &&
            entity.contentRating !== other.contentRating) ||
          (entity.duration !== undefined &&
            entity.duration > request.constraints.maxMovieMinutes) ||
          (other.duration !== undefined &&
            other.duration > request.constraints.maxMovieMinutes) ||
          (entity.contentRating !== undefined &&
            !request.constraints.allowedRatings.includes(
              entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
            )) ||
          (other.contentRating !== undefined &&
            !request.constraints.allowedRatings.includes(
              other.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
            ))
        );
      })
    )
      return "movie: every non-rejected shared film conflicts on metadata or violates a known film or rating rule.";
  }
  return `${domain}: shared entities fail a hard film, total-time, or exclusion rule.`;
}

function appendPage(first: EvidenceSet, second: EvidenceSet): EvidenceSet {
  const seen = new Set(first.entities.map((entity) => entity.id));
  return {
    ...first,
    entities: [
      ...first.entities,
      ...second.entities.filter((entity) => {
        if (seen.has(entity.id)) return false;
        seen.add(entity.id);
        return true;
      }),
    ],
  };
}

export async function runNegotiation(
  request: PlanRequest,
  source: CulturalSource,
  settings: {
    maxSourceCalls?: number;
    concurrency?: number;
    signal?: AbortSignal;
  } = {},
): Promise<PlanResult> {
  const startedAt = performance.now();
  const maxCalls = settings.maxSourceCalls ?? MAX_SOURCE_CALLS;
  const concurrency = settings.concurrency ?? CONCURRENCY;
  const signal = settings.signal;
  throwIfAborted(signal);
  const audit: Action[] = [
    {
      step: "PLAN",
      detail:
        "Resolve named interests, gather separate domain evidence, then check shared IDs and hard constraints.",
    },
  ];
  if (request.constraints.excludedIds.length)
    audit.push({
      step: "REPLAN",
      detail: `${request.constraints.excludedIds.length} rejected component(s) remain excluded from every new query and local check.`,
    });
  let calls = 0;
  let recoveryCalls = 0;
  const reserve = () => {
    throwIfAborted(signal);
    if (calls >= maxCalls)
      throw new AppError("BUDGET", "The source-call budget is exhausted.", 429);
    calls++;
  };
  const interests = request.audiences.flatMap((audience, side) =>
    audience.interests.map((interest) => ({ side, interest })),
  );
  if (interests.length + DOMAINS.length * 2 > maxCalls)
    throw new AppError(
      "BUDGET",
      "The source-call budget cannot cover the baseline plan.",
      429,
    );
  audit.push({
    step: "SELECT TOOLS",
    detail: `Select ${interests.length} Search and six Insights calls; at most ${maxCalls} source calls and ${concurrency} concurrent calls.`,
  });
  const searchResults = await mapBounded(
    interests,
    concurrency,
    async ({ interest }) => {
      reserve();
      // Search is a documented endpoint with take <= 100. Recheck a selected
      // ID against returned name and type even if its result order changed.
      return source.search(interest.name, interest.type, {
        take: interest.id ? 100 : 8,
        signal,
      });
    },
    signal,
  );
  throwIfAborted(signal);
  const resolved: [SearchMatch[], SearchMatch[]] = [[], []];
  interests.forEach(({ side, interest }, index) => {
    const matches = searchResults[index];
    const exact = matches.filter(
      (match) =>
        match.name.toLocaleLowerCase() === interest.name.toLocaleLowerCase() &&
        (!interest.id || match.id === interest.id),
    );
    if (exact.length !== 1)
      throw new AppError(
        matches.length ? "AMBIGUOUS_ENTITY" : "UNRESOLVED_ENTITY",
        `Choose a unique ${interest.type} match for “${interest.name}”.`,
        422,
        { side, interest, matches: matches.slice(0, 6) },
      );
    resolved[side].push(exact[0]);
  });
  const tasks = DOMAINS.flatMap((domain) =>
    [0, 1].map((side) => ({ domain, side })),
  );
  const sets = await mapBounded(
    tasks,
    concurrency,
    async ({ domain, side }) => {
      reserve();
      return source.insights(
        domain,
        resolved[side].map((match) => match.id),
        request.constraints.excludedIds,
        { take: INITIAL_TAKE, page: 1 },
        signal,
      );
    },
    signal,
  );
  throwIfAborted(signal);
  const matrix = {} as EvidenceMatrix;
  DOMAINS.forEach((domain, index) => {
    matrix[domain] = [sets[index * 2], sets[index * 2 + 1]];
  });
  audit.push({
    step: "EXECUTE",
    detail: `${calls} source calls completed. Six Insights requests were scheduled with bounded concurrency.`,
  });
  let eligible = buildCandidates(matrix, request);
  const missing = DOMAINS.filter((domain) => eligible[domain].length === 0);
  for (const domain of missing) {
    const failure = reason(domain, matrix, request);
    const sides = [0, 1].filter(
      (side) => matrix[domain][side].entities.length >= INITIAL_TAKE,
    );
    if (!sides.length) {
      audit.push({
        step: "REPLAN",
        detail: `${failure} No full result page remains to expand; ask the user to revise inputs or supply verified metadata. Hard rules stay intact.`,
      });
      continue;
    }
    if (calls + sides.length > maxCalls) {
      audit.push({
        step: "REPLAN",
        detail: `${failure} Page-two recovery skipped because the source-call budget is exhausted. Hard rules stay intact.`,
      });
      continue;
    }
    audit.push({
      step: "REPLAN",
      detail: `${failure} Select page two for ${sides.map((side) => `audience ${side === 0 ? "A" : "B"}`).join(" and ")} at take=${INITIAL_TAKE}; keep every hard rule.`,
    });
    const pages = await mapBounded(
      sides,
      concurrency,
      async (side) => {
        reserve();
        recoveryCalls++;
        return source.insights(
          domain,
          resolved[side].map((match) => match.id),
          request.constraints.excludedIds,
          { take: INITIAL_TAKE, page: 2 },
          signal,
        );
      },
      signal,
    );
    throwIfAborted(signal);
    sides.forEach((side, index) => {
      matrix[domain][side] = appendPage(matrix[domain][side], pages[index]);
    });
    eligible = buildCandidates(matrix, request);
    audit.push({
      step: "EVALUATE",
      detail: `${domain} page-two recovery ${eligible[domain].length ? "found eligible shared evidence" : "did not find an eligible shared candidate"}.`,
    });
  }
  const sharedEligible = Object.fromEntries(
    DOMAINS.map((domain) => [domain, eligible[domain].length]),
  ) as Record<Domain, number>;
  audit.push({
    step: "EVALUATE",
    detail: `Intersect stable entity IDs; eligible shared candidates: ${DOMAINS.map((domain) => `${domain} ${sharedEligible[domain]}`).join(", ")}. Compare within-request ranks and retain non-dominated ordinal trade-offs.`,
  });
  const options = negotiate(matrix, request);
  throwIfAborted(signal);
  const gaps = DOMAINS.filter((domain) => eligible[domain].length === 0).map(
    (domain) => reason(domain, matrix, request),
  );
  if (options[0]?.scheduleStatus === "conceptual") {
    const missing = [
      ...new Set(options.flatMap((option) => option.unverified)),
    ];
    gaps.push(
      `Scheduling is unverified: obtain independent ${missing.join(" and ")} metadata before applying the film, rating, and total-program gates.`,
    );
  }
  const alternativesNote =
    options.length === 3
      ? "Three distinct non-dominated trade-offs were found."
      : options.length === 1
        ? "One fairness-first path is supported. No distinct non-dominated alternative improves one audience while worsening the other."
        : options.length === 2
          ? "Two distinct non-dominated paths are supported; no evidence-backed third directional trade-off exists."
          : "No three-act path is supported under the current evidence and rules.";
  audit.push({
    step: "VERIFY",
    detail: options.length
      ? options[0].scheduleStatus === "conceptual"
        ? `Found ${options.length} conceptual path(s). Known constraints and exclusions passed; missing film metadata prevents a verified schedule. No hard rule was waived.`
        : `Checked ${options.length} complete path(s) against film, total-program, rating, and exclusion rules; rights and venue remain unverified.`
      : "No complete path satisfies the evidence and hard constraints. No constraint was weakened.",
  });
  return {
    status: options.length
      ? options[0].scheduleStatus === "conceptual"
        ? "conceptual"
        : "ready"
      : "no-solution",
    mode: request.mode,
    options,
    resolved,
    audit,
    gaps,
    alternativesNote,
    metrics: {
      sourceCalls: calls,
      recoveryCalls,
      elapsedMs: Math.round(performance.now() - startedAt),
      sharedEligible,
      ...source.metrics?.(),
    },
    warning:
      request.mode === "synthetic"
        ? "SYNTHETIC / NOT REAL QLOO DATA. Every result and association in this run is a development fixture."
        : undefined,
  };
}
