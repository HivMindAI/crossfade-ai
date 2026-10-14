import { AppError } from "./errors";
import { throwIfAborted } from "./cancellation";
import {
  DOMAINS,
  type Action,
  type CulturalSource,
  type Domain,
  type DomainDiagnostic,
  type EvidenceSet,
  type PlanRequest,
  type PlanResult,
  type RetrievalStatus,
  type SearchMatch,
} from "./model";
import {
  buildCandidates,
  inspectDomain,
  negotiate,
  type EvidenceMatrix,
} from "./negotiation";

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
  let failed = false;
  let failure: unknown;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (!failed && next < items.length) {
        try {
          throwIfAborted(signal);
          const index = next++;
          results[index] = await task(items[index], index);
        } catch (error) {
          if (!failed) failure = error;
          failed = true;
        }
      }
    }),
  );
  if (failed) throw failure;
  return results;
}

function reason(
  domain: Domain,
  matrix: EvidenceMatrix,
  request: PlanRequest,
): string {
  const { issues } = inspectDomain(domain, matrix[domain], request);
  if (issues["no-source-results"])
    return `${domain}: an empty result list was observed for at least one audience. The cause is not established; filters, exclusions, or limited provider evidence may contribute.`;
  if (issues["no-shared-ids"])
    return `${domain}: the audiences have no shared entity IDs in the gathered results.`;
  if (issues.excluded && Object.keys(issues).length === 1)
    return `${domain}: every shared entity was explicitly rejected.`;
  return `${domain}: shared entities in the retrieved pool were excluded or failed known metadata, film, total-time, or rating rules.`;
}

function nextAction(diagnostic: DomainDiagnostic): string {
  const issues = diagnostic.issues;
  if (diagnostic.eligible)
    return "This domain has usable shared evidence in this run. Review these receipts while resolving blocked domains; a new run retrieves evidence again.";
  if (diagnostic.recovery === "budget-limited")
    return "The built-in retrieval cap prevented page two. Revise a named interest, or have engineering review the call budget before another authorized attempt; no extra request was sent.";
  if (issues["no-source-results"])
    return "Review the interests and any exclusions, then retry if appropriate. Search resolved, but the observed empty Insights list does not establish the cause or rule out agreement elsewhere.";
  if (issues["no-shared-ids"])
    return "Try different named interests for one audience. No shared ID was found in the retrieved pool; this does not rule out overlap elsewhere.";
  if (issues.excluded && Object.keys(issues).length === 1)
    return "Review prior rejections if appropriate, or change an interest. Rejected IDs remain excluded until you clear them.";
  const actions: string[] = [];
  if (issues.excluded) actions.push("Review prior rejections if appropriate");
  if (issues["metadata-conflict"] || issues["invalid-runtime"])
    actions.push("verify conflicting or invalid film metadata independently");
  if (issues["film-limit"] || issues["program-limit"] || issues.rating)
    actions.push(
      "review the stated film, total-program, and rating limits or change an interest",
    );
  return `${actions.join("; ") || "Revise an interest or inspect the retrieved evidence"}. No limit was relaxed automatically.`;
}

function appendPage(first: EvidenceSet, second: EvidenceSet): EvidenceSet {
  return {
    ...first,
    entities: [
      ...first.entities,
      ...second.entities.map((entity, index) => ({
        ...entity,
        retrievedRank:
          ((second.page ?? 2) - 1) * (second.take ?? INITIAL_TAKE) + index + 1,
      })),
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
    onEvidence?: (matrix: EvidenceMatrix) => void;
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
  const recovery = Object.fromEntries(
    DOMAINS.map((domain) => [domain, "not-needed"]),
  ) as Record<Domain, DomainDiagnostic["recovery"]>;
  const retrieval = Object.fromEntries(
    DOMAINS.map((domain) => [
      domain,
      matrix[domain].map((set): RetrievalStatus =>
        set.entities.length >= INITIAL_TAKE
          ? "full-page-unexpanded"
          : "short-page",
      ),
    ]),
  ) as Record<Domain, [RetrievalStatus, RetrievalStatus]>;
  const missing = DOMAINS.filter((domain) => eligible[domain].length === 0);
  for (const domain of missing) {
    const failure = reason(domain, matrix, request);
    const sides = matrix[domain].every((set) => set.entities.length > 0)
      ? [0, 1].filter(
          (side) => matrix[domain][side].entities.length >= INITIAL_TAKE,
        )
      : [];
    if (!sides.length) {
      recovery[domain] = matrix[domain].some((set) => !set.entities.length)
        ? "empty-side"
        : "no-full-page";
      audit.push({
        step: "REPLAN",
        detail: `${failure} Page two was not selected: a required side was empty or neither side returned a full page. Retrieval is bounded, not exhaustive; ask the user to revise inputs or supply verified metadata. Hard rules stay intact.`,
      });
      continue;
    }
    if (calls + sides.length > maxCalls) {
      recovery[domain] = "budget-limited";
      audit.push({
        step: "REPLAN",
        detail: `${failure} Page-two recovery skipped because the remaining source-call budget cannot cover it. Hard rules stay intact.`,
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
    recovery[domain] = "attempted";
    throwIfAborted(signal);
    sides.forEach((side, index) => {
      const page = { ...pages[index], page: 2, take: INITIAL_TAKE };
      retrieval[domain][side] =
        page.entities.length >= INITIAL_TAKE
          ? "page-limit-reached"
          : "short-page";
      matrix[domain][side] = appendPage(matrix[domain][side], page);
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
  settings.onEvidence?.(structuredClone(matrix));
  const diagnostics: DomainDiagnostic[] = DOMAINS.map((domain) => {
    const assessed = inspectDomain(domain, matrix[domain], request);
    const diagnostic: DomainDiagnostic = {
      domain,
      returned: [
        matrix[domain][0].entities.length,
        matrix[domain][1].entities.length,
      ],
      shared: assessed.shared,
      eligible: assessed.candidates.length,
      issues: assessed.issues,
      recovery: recovery[domain],
      retrieval: retrieval[domain],
      partial: assessed.candidates.slice(0, 2),
      nextAction: "",
    };
    diagnostic.nextAction = nextAction(diagnostic);
    return diagnostic;
  });
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
        ? "One fairness-first path is supported. No distinct non-dominated alternative in the retrieved pool improves one audience while worsening the other."
        : options.length === 2
          ? "Two distinct non-dominated paths are supported; no third directional trade-off was found in the retrieved pool."
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
    diagnostics,
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
