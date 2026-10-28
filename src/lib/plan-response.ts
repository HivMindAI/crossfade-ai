import { z } from "zod";
import { DOMAINS, type PlanRequest, type PlanResult } from "./model";
import {
  DEFAULT_MAX_PROGRAM_MINUTES,
  PROGRAM_OVERHEAD_MINUTES,
} from "./negotiation";

const text = z.string().min(1);
const count = z.number().int().nonnegative();
const rank = z.number().int().positive();
const pair = <T extends z.ZodType>(item: T) => z.tuple([item, item]);
const influence = z.object({
  signalId: text,
  normalizedInfluence: z.number().min(0).max(1),
});
const entity = z.object({
  id: text,
  name: text,
  domain: z.enum(DOMAINS),
  duration: rank.optional(),
  contentRating: text.optional(),
  explainability: z.enum(["available", "unavailable"]).optional(),
  influence: z.array(influence).max(3).optional(),
  evidenceWarning: text.optional(),
  retrievedRank: rank.optional(),
});
const candidate = z.object({
  entity,
  ranks: pair(rank),
  signals: pair(z.array(text).max(3)),
  source: z.enum(["synthetic", "qloo"]),
  influences: pair(z.array(influence).max(3)),
  explanation: text,
  receipt: z.object({
    checked: z.array(text).min(1).max(20),
    unverified: z.array(text).max(20),
    limitations: z.array(text).min(1).max(20),
  }),
});
const retrieval = z.enum([
  "short-page",
  "full-page-unexpanded",
  "page-limit-reached",
]);
const schema: z.ZodType<PlanResult> = z.object({
  status: z.enum(["ready", "conceptual", "no-solution"]),
  mode: z.enum(["synthetic", "live"]),
  options: z
    .array(
      z.object({
        id: text,
        title: text,
        candidates: z.array(candidate).length(3),
        balance: pair(rank),
        path: z.enum(["fairness", "audience-a", "audience-b"]),
        programMinutes: rank.nullable(),
        scheduleStatus: z.enum(["duration-verified", "conceptual"]),
        unverified: z.array(z.enum(["runtime", "content rating"])).max(2),
        rationale: text,
      }),
    )
    .max(3),
  resolved: pair(
    z.array(entity.pick({ id: true, name: true, domain: true })).max(3),
  ),
  audit: z
    .array(
      z.object({
        step: z.enum([
          "PLAN",
          "SELECT TOOLS",
          "EXECUTE",
          "EVALUATE",
          "VERIFY",
          "REPLAN",
        ]),
        detail: text,
      }),
    )
    .max(20),
  gaps: z.array(text).max(4),
  alternativesNote: text,
  warning: text.optional(),
  diagnostics: z
    .array(
      z.object({
        domain: z.enum(DOMAINS),
        returned: pair(count),
        shared: count,
        eligible: count,
        issues: z.partialRecord(
          z.enum([
            "no-source-results",
            "no-shared-ids",
            "excluded",
            "metadata-conflict",
            "invalid-runtime",
            "film-limit",
            "program-limit",
            "rating",
          ]),
          count,
        ),
        recovery: z.enum([
          "not-needed",
          "no-full-page",
          "empty-side",
          "attempted",
          "budget-limited",
        ]),
        retrieval: pair(retrieval),
        partial: z.array(candidate).max(2),
        nextAction: text,
      }),
    )
    .length(3),
  metrics: z.object({
    sourceCalls: count.max(16),
    recoveryCalls: count.max(6),
    elapsedMs: count,
    sharedEligible: z.object({ artist: count, movie: count, book: count }),
    httpAttempts: count.max(24).optional(),
  }),
});

// Reject malformed or contradictory success responses before rendering or
// claiming that a rejected ID/known hard rule passed. No provider payload logs.
export function parsePlanResponse(
  value: unknown,
  request: PlanRequest,
): PlanResult | undefined {
  const parsed = schema.safeParse(value);
  if (!parsed.success) return undefined;
  const result = parsed.data;
  if (
    result.mode !== request.mode ||
    (result.status === "no-solution") !== (result.options.length === 0)
  )
    return undefined;
  const expectedSource = result.mode === "live" ? "qloo" : "synthetic";
  if (
    result.diagnostics.some(
      (item, index) =>
        item.domain !== DOMAINS[index] ||
        item.shared < item.eligible ||
        item.partial.length !== Math.min(item.eligible, 2) ||
        item.partial.some((pick) => pick.entity.domain !== item.domain) ||
        result.metrics.sharedEligible[item.domain] !== item.eligible,
    )
  )
    return undefined;
  if (
    (result.status === "no-solution") !==
    result.diagnostics.some((item) => item.eligible === 0)
  )
    return undefined;
  const picks = [
    ...result.options.flatMap((option) => option.candidates),
    ...result.diagnostics.flatMap((item) => item.partial),
  ];
  if (
    picks.some(
      ({ entity, source }) =>
        source !== expectedSource ||
        request.constraints.excludedIds.includes(entity.id) ||
        (entity.domain === "movie" &&
          ((entity.duration !== undefined &&
            (entity.duration > request.constraints.maxMovieMinutes ||
              entity.duration + PROGRAM_OVERHEAD_MINUTES >
                (request.constraints.maxProgramMinutes ??
                  DEFAULT_MAX_PROGRAM_MINUTES))) ||
            (entity.contentRating !== undefined &&
              !request.constraints.allowedRatings.includes(
                entity.contentRating as PlanRequest["constraints"]["allowedRatings"][number],
              )))),
    )
  )
    return undefined;
  for (const option of result.options) {
    if (
      option.candidates.some(
        (item, index) => item.entity.domain !== DOMAINS[index],
      )
    )
      return undefined;
    const film = option.candidates[1].entity;
    const unknown =
      film.duration === undefined || film.contentRating === undefined;
    if (
      (result.status === "conceptual") !== unknown ||
      (option.scheduleStatus === "conceptual") !== unknown
    )
      return undefined;
    if (
      option.programMinutes !==
      (film.duration === undefined
        ? null
        : film.duration + PROGRAM_OVERHEAD_MINUTES)
    )
      return undefined;
  }
  return result;
}
