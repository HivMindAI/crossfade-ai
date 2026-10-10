import { AppError } from "./errors";
import {
  DOMAINS,
  type Action,
  type CulturalSource,
  type EvidenceSet,
  type PlanRequest,
  type PlanResult,
  type SearchMatch,
} from "./model";
import { negotiate, type EvidenceMatrix } from "./negotiation";

export async function runNegotiation(
  request: PlanRequest,
  source: CulturalSource,
): Promise<PlanResult> {
  const audit: Action[] = [
    {
      step: "PLAN",
      detail:
        "Resolve each stated interest, then inspect three cross-domain result sets per audience.",
    },
  ];
  if (request.constraints.excludedIds.length)
    audit.push({
      step: "REPLAN",
      detail: `${request.constraints.excludedIds.length} rejected component(s) excluded from this run.`,
    });
  const resolved: [SearchMatch[], SearchMatch[]] = [[], []];
  let calls = 0;
  const budget = 12;
  audit.push({
    step: "SELECT TOOLS",
    detail:
      "Select entity search and cross-domain insights; cap upstream calls at 12.",
  });
  for (let side = 0; side < 2; side++) {
    for (const interest of request.audiences[side].interests) {
      if (++calls > budget)
        throw new AppError(
          "BUDGET",
          "The request exceeds the tool budget.",
          400,
        );
      const matches = await source.search(interest.name, interest.type);
      const exact = interest.id
        ? matches.filter(
            (match) =>
              match.id === interest.id &&
              match.name.toLocaleLowerCase() ===
                interest.name.toLocaleLowerCase(),
          )
        : matches.filter(
            (match) =>
              match.name.toLocaleLowerCase() ===
              interest.name.toLocaleLowerCase(),
          );
      if (exact.length !== 1) {
        throw new AppError(
          matches.length ? "AMBIGUOUS_ENTITY" : "UNRESOLVED_ENTITY",
          `Choose a unique ${interest.type} match for “${interest.name}”.`,
          422,
          { side, interest, matches: matches.slice(0, 6) },
        );
      }
      resolved[side].push(exact[0]);
    }
  }
  audit.push({
    step: "EXECUTE",
    detail: `${calls} entity search(es) resolved. Querying each audience separately for artists, films, and books.`,
  });
  const matrix = {} as EvidenceMatrix;
  for (const domain of DOMAINS) {
    const sets: EvidenceSet[] = [];
    for (let side = 0; side < 2; side++) {
      if (++calls > budget)
        throw new AppError(
          "BUDGET",
          "The request exceeds the tool budget.",
          400,
        );
      sets.push(
        await source.insights(
          domain,
          resolved[side].map((match) => match.id),
          request.constraints.excludedIds,
        ),
      );
    }
    matrix[domain] = sets as [EvidenceSet, EvidenceSet];
  }
  audit.push({
    step: "EVALUATE",
    detail:
      "Intersect Qloo entity IDs across the two audience result sets. Order candidates by within-request ranks and worst-side rank.",
  });
  const options = negotiate(matrix, request);
  audit.push({
    step: "VERIFY",
    detail: options.length
      ? `Verified ${options.length} complete option(s) against exclusions, duration, and content-rating constraints.`
      : "No complete plan satisfies the available overlap and verified hard constraints.",
  });
  return {
    status: options.length ? "ready" : "no-solution",
    mode: request.mode,
    options,
    resolved,
    audit,
    warning:
      request.mode === "synthetic"
        ? "SYNTHETIC / NOT REAL QLOO DATA. Every result and association in this run is a development fixture."
        : undefined,
  };
}
