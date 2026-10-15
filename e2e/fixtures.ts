import { type CulturalSource, type PlanRequest } from "../src/lib/model";
import { runNegotiation } from "../src/lib/orchestrator";

// Invented in-memory evidence for browser contracts. No Qloo transport is used.
export async function mockPlan(
  request: PlanRequest,
  options: {
    films?: number;
    emptyBooks?: boolean;
    emptyFilmsAfterReject?: boolean;
    emptyBooksAfterReject?: boolean;
  } = {},
) {
  const rejected = request.constraints.excludedIds.length > 0;
  const source: CulturalSource = {
    async search(name, domain) {
      return [{ id: `mock-seed-${name}`, name, domain }];
    },
    async insights(domain, signalIds) {
      const count =
        (domain === "book" &&
          (options.emptyBooks ||
            (rejected && options.emptyBooksAfterReject))) ||
        (domain === "movie" && rejected && options.emptyFilmsAfterReject)
          ? 0
          : domain === "movie"
            ? (options.films ?? 2)
            : 1;
      return {
        entities: Array.from({ length: count }, (_, index) => ({
          id: `mock-${domain}-${index + 1}`,
          name:
            domain === "movie"
              ? `Mock Film ${index + 1}`
              : domain === "artist"
                ? "Mock Music"
                : "Mock Book",
          domain,
          ...(domain === "movie" && request.mode === "synthetic"
            ? { duration: 90, contentRating: "PG" }
            : {}),
        })),
        signalIds,
        source: request.mode === "live" ? "qloo" : "synthetic",
      };
    },
  };
  return runNegotiation(request, source);
}
