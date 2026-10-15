import { AppError } from "./errors";
import {
  DOMAINS,
  type Candidate,
  type CulturalSource,
  type PlanRequest,
  type PlanResult,
} from "./model";
import {
  buildCandidates,
  DEFAULT_MAX_PROGRAM_MINUTES,
  PROGRAM_OVERHEAD_MINUTES,
  type EvidenceMatrix,
} from "./negotiation";
import { runNegotiation } from "./orchestrator";

type Outcome =
  | "verified-schedule"
  | "complete-conceptual"
  | "partial-agreement"
  | "no-observed-solution"
  | "request-failure";
type Pools = ReturnType<typeof buildCandidates>;
export type Comparison = "win" | "tie" | "loss" | "not-comparable";
const label = "SYNTHETIC OFFLINE FIXTURE — NOT QLOO PERFORMANCE";

// Both strategies consume the same post-recovery matrix, known-rule filter,
// and verified-film preference. The A-first baseline makes no extra API call.
function simpleBaseline(pools: Pools): Candidate[] {
  if (DOMAINS.some((domain) => pools[domain].length === 0)) return [];
  const firstForA = (items: Candidate[]) =>
    [...items].sort(
      (a, b) =>
        a.ranks[0] - b.ranks[0] ||
        a.ranks[1] - b.ranks[1] ||
        a.entity.id.localeCompare(b.entity.id),
    )[0];
  const verified = pools.movie.filter(
    ({ entity }) =>
      entity.duration !== undefined && entity.contentRating !== undefined,
  );
  return [
    firstForA(pools.artist),
    firstForA(verified.length ? verified : pools.movie),
    firstForA(pools.book),
  ];
}

function summarize(
  paths: Candidate[][],
  matrix?: EvidenceMatrix,
  request?: PlanRequest,
  pools?: Pools,
) {
  const first = paths[0] ?? [];
  const complete = first.length === 3;
  const partialDomains = pools
    ? DOMAINS.filter((domain) => pools[domain].length > 0).length
    : 0;
  const displayed = paths.length
    ? paths.flat()
    : pools
      ? DOMAINS.flatMap((domain) => pools[domain].slice(0, 2))
      : [];
  const hardViolations = request
    ? displayed.filter(
        ({ entity }) =>
          request.constraints.excludedIds.includes(entity.id) ||
          (entity.domain === "movie" &&
            ((entity.duration !== undefined &&
              (!Number.isInteger(entity.duration) ||
                entity.duration <= 0 ||
                entity.duration > request.constraints.maxMovieMinutes ||
                entity.duration + PROGRAM_OVERHEAD_MINUTES >
                  (request.constraints.maxProgramMinutes ??
                    DEFAULT_MAX_PROGRAM_MINUTES))) ||
              (entity.contentRating !== undefined &&
                !request.constraints.allowedRatings.includes(
                  entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
                )))),
      ).length
    : null;
  const film = first.find((item) => item.entity.domain === "movie")?.entity;
  const verifiedSchedule =
    complete &&
    film?.duration !== undefined &&
    film.contentRating !== undefined &&
    hardViolations === 0;
  const outcome: Outcome = !matrix
    ? "request-failure"
    : complete
      ? verifiedSchedule
        ? "verified-schedule"
        : "complete-conceptual"
      : partialDomains
        ? "partial-agreement"
        : "no-observed-solution";
  const audienceRanks = complete
    ? [0, 1].map((side) =>
        first.reduce((sum, item) => sum + item.ranks[side], 0),
      )
    : null;
  return {
    outcome,
    complete,
    verifiedSchedule,
    partialDomains,
    worstAudienceRank: audienceRanks ? Math.max(...audienceRanks) : null,
    audienceARank: audienceRanks?.[0] ?? null,
    audienceBRank: audienceRanks?.[1] ?? null,
    candidateDiversity: new Set(displayed.map((item) => item.entity.id)).size,
    alternativeDiversity: paths.length,
    hardViolations,
    provenanceComplete:
      displayed.length && matrix
        ? displayed.every(
            (item) =>
              item.receipt.checked.length > 0 &&
              matrix[item.entity.domain].every(
                (set, side) =>
                  set.source === item.source &&
                  set.entities.some(
                    (entity, index) =>
                      entity.id === item.entity.id &&
                      (entity.retrievedRank ?? index + 1) === item.ranks[side],
                  ),
              ),
          )
        : null,
  };
}
const lower = (a: number | null, b: number | null): Comparison =>
  a === null || b === null
    ? "not-comparable"
    : a < b
      ? "win"
      : a > b
        ? "loss"
        : "tie";
const safeCode = (error: unknown) =>
  error instanceof AppError ? error.code : "INTERNAL";
const noRepair = () => ({
  attempted: false,
  rejectedAbsent: null as boolean | null,
  replacementFound: null as boolean | null,
  status: null as string | null,
  errorCode: null as string | null,
  product: null as ReturnType<typeof summarize> | null,
  baseline: null as ReturnType<typeof summarize> | null,
  sourceCalls: 0,
  elapsedMs: 0,
});
const comparisons = (
  product: ReturnType<typeof summarize>,
  baseline: ReturnType<typeof summarize>,
) => ({
  worstAudienceRank: lower(
    product.worstAudienceRank,
    baseline.worstAudienceRank,
  ),
  audienceARank: lower(product.audienceARank, baseline.audienceARank),
  audienceBRank: lower(product.audienceBRank, baseline.audienceBRank),
});
const coverage = (
  product: ReturnType<typeof summarize>,
  baseline: ReturnType<typeof summarize>,
) => ({
  complete: { product: product.complete, baseline: baseline.complete },
  verifiedSchedule: {
    product: product.verifiedSchedule,
    baseline: baseline.verifiedSchedule,
  },
});

export async function evaluateSyntheticScenario(
  request: PlanRequest,
  source: CulturalSource,
  settings: { maxSourceCalls?: number } = {},
) {
  if (request.mode !== "synthetic")
    throw new Error("Offline evaluation accepts synthetic mode only.");
  let calls = 0;
  const counted: CulturalSource = {
    search: (...args) => {
      calls++;
      return source.search(...args);
    },
    insights: async (...args) => {
      calls++;
      const set = await source.insights(...args);
      if (set.source !== "synthetic")
        throw new AppError(
          "OFFLINE_SOURCE",
          "The offline evaluator requires synthetic evidence.",
          400,
        );
      return set;
    },
    metrics: source.metrics ? () => source.metrics!() : undefined,
  };
  const started = performance.now();
  let matrix: EvidenceMatrix | undefined;
  let result: PlanResult;
  try {
    result = await runNegotiation(request, counted, {
      ...settings,
      onEvidence: (value) => {
        matrix = value;
      },
    });
  } catch (error) {
    const failed = summarize([]);
    return {
      label,
      errorCode: safeCode(error),
      product: failed,
      baseline: failed,
      comparison: comparisons(failed, failed),
      coverage: coverage(failed, failed),
      repair: noRepair(),
      sourceCalls: calls,
      elapsedMs: Math.round(performance.now() - started),
      retrievalLimited: true,
      boundedRetrieval: true,
    };
  }
  if (!matrix)
    throw new Error("The planner did not produce an evidence matrix.");
  const pools = buildCandidates(matrix, request);
  const baselinePicks = simpleBaseline(pools);
  const product = summarize(
    result.options.map((option) => option.candidates),
    matrix,
    request,
    pools,
  );
  const baseline = summarize(
    baselinePicks.length ? [baselinePicks] : [],
    matrix,
    request,
    pools,
  );
  const initialCalls = calls;
  const rejectedId = result.options[0]?.candidates[1]?.entity.id;
  const repair = noRepair();
  if (rejectedId) {
    const revised = structuredClone(request);
    revised.constraints.excludedIds = [
      ...new Set([...revised.constraints.excludedIds, rejectedId]),
    ];
    const repairStarted = performance.now();
    repair.attempted = true;
    try {
      let repairMatrix: EvidenceMatrix | undefined;
      const rerun = await runNegotiation(revised, counted, {
        ...settings,
        onEvidence: (value) => {
          repairMatrix = value;
        },
      });
      if (!repairMatrix) throw new Error("No repair evidence matrix.");
      const repairPools = buildCandidates(repairMatrix, revised);
      const simple = simpleBaseline(repairPools);
      repair.product = summarize(
        rerun.options.map((option) => option.candidates),
        repairMatrix,
        revised,
        repairPools,
      );
      repair.baseline = summarize(
        simple.length ? [simple] : [],
        repairMatrix,
        revised,
        repairPools,
      );
      repair.rejectedAbsent = [
        ...rerun.options.flatMap((option) => option.candidates),
        ...rerun.diagnostics.flatMap((item) => item.partial),
      ].every((item) => item.entity.id !== rejectedId);
      repair.replacementFound =
        rerun.options.length > 0 && repair.rejectedAbsent;
      repair.status = rerun.status;
    } catch (error) {
      repair.status = "request-failure";
      repair.errorCode = safeCode(error);
    }
    repair.sourceCalls = calls - initialCalls;
    repair.elapsedMs = Math.round(performance.now() - repairStarted);
  }
  return {
    label,
    errorCode: null,
    product,
    baseline,
    comparison: comparisons(product, baseline),
    coverage: coverage(product, baseline),
    repair,
    sourceCalls: initialCalls,
    elapsedMs: result.metrics.elapsedMs,
    retrievalLimited: result.diagnostics.some((item) =>
      item.retrieval.some((status) => status !== "short-page"),
    ),
    boundedRetrieval: true,
  };
}

export function aggregateComparisons(
  reports: Awaited<ReturnType<typeof evaluateSyntheticScenario>>[],
) {
  const counts = () => ({ win: 0, tie: 0, loss: 0, "not-comparable": 0 });
  const totals = {
    worstAudienceRank: counts(),
    audienceARank: counts(),
    audienceBRank: counts(),
  };
  for (const report of reports)
    for (const metric of Object.keys(totals) as (keyof typeof totals)[])
      totals[metric][report.comparison[metric]]++;
  return totals;
}
