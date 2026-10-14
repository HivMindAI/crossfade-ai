import { expect, it } from "vitest";
import { AppError } from "./errors";
import { aggregateComparisons, evaluateSyntheticScenario } from "./evaluation";
import {
  type CulturalSource,
  type Domain,
  type Entity,
  type PlanRequest,
} from "./model";

const input = (): PlanRequest => ({
  mode: "synthetic",
  audiences: [
    { name: "A", interests: [{ name: "Seed A", type: "artist" }] },
    { name: "B", interests: [{ name: "Seed B", type: "artist" }] },
  ],
  constraints: {
    maxMovieMinutes: 120,
    maxProgramMinutes: 180,
    allowedRatings: ["PG"],
    excludedIds: [],
  },
});
const item = (id: string, domain: Domain, missing = false): Entity => ({
  id,
  name: id,
  domain,
  ...(domain === "movie"
    ? { duration: missing ? undefined : 90, contentRating: "PG" }
    : {}),
});
function source(kind: string): CulturalSource {
  return {
    async search(name, domain) {
      return [{ id: name, name, domain }];
    },
    async insights(domain, signalIds) {
      if (kind === "upstream" && domain === "artist")
        throw new AppError("QLOO_NETWORK", "private provider detail", 503);
      const side = signalIds[0] === "Seed A" ? "a" : "b";
      let ids = [`${domain}-0`];
      if (kind === "disjoint" || (kind === "incomplete" && domain === "book"))
        ids = Array.from(
          { length: kind === "incomplete" ? 20 : 1 },
          (_, i) => `${side}-${domain}-${i}`,
        );
      if (kind === "empty" && domain === "book") ids = [];
      if (kind === "sparse") ids = [`${side}-${domain}`, `${domain}-0`];
      if (kind === "asymmetric")
        ids =
          side === "a"
            ? [`${domain}-0`, `${domain}-1`, `${domain}-2`]
            : [
                `${domain}-2`,
                `${domain}-1`,
                ...Array.from({ length: 17 }, (_, i) => `noise-${domain}-${i}`),
                `${domain}-0`,
              ];
      if (kind === "duplicates") ids = [`${domain}-0`, `${domain}-0`];
      if (kind === "rejected") ids = [`${domain}-0`, `${domain}-1`];
      return {
        entities: ids.map((id) => item(id, domain, kind === "missing")),
        source: "synthetic",
        signalIds,
      };
    },
  };
}

it("reports outcome denominators and metric wins, ties, losses on nine adversarial synthetic cases", async () => {
  const kinds = [
    "disjoint",
    "empty",
    "sparse",
    "asymmetric",
    "missing",
    "duplicates",
    "rejected",
    "incomplete",
    "upstream",
  ];
  const reports = [];
  for (const kind of kinds) {
    const request = input();
    if (kind === "rejected") request.constraints.excludedIds.push("movie-0");
    reports.push(
      await evaluateSyntheticScenario(
        request,
        source(kind),
        kind === "incomplete" ? { maxSourceCalls: 8 } : {},
      ),
    );
  }
  expect(reports.map((report) => report.product.outcome)).toEqual([
    "no-observed-solution",
    "partial-agreement",
    "verified-schedule",
    "verified-schedule",
    "complete-conceptual",
    "verified-schedule",
    "verified-schedule",
    "partial-agreement",
    "request-failure",
  ]);
  for (const report of reports.filter((report) => report.errorCode === null)) {
    expect(report.product.hardViolations).toBe(0);
    expect(report.baseline.hardViolations).toBe(0);
    expect(report.coverage.complete.product).toBe(
      report.coverage.complete.baseline,
    );
    expect(report.coverage.verifiedSchedule.product).toBe(
      report.coverage.verifiedSchedule.baseline,
    );
  }
  expect(reports[4].coverage).toEqual({
    complete: { product: true, baseline: true },
    verifiedSchedule: { product: false, baseline: false },
  });
  expect(reports[5].product.candidateDiversity).toBe(3);
  expect(reports[6].repair).toMatchObject({
    attempted: true,
    rejectedAbsent: true,
    replacementFound: false,
    status: "no-solution",
  });
  expect(reports[7]).toMatchObject({ retrievalLimited: true, sourceCalls: 8 });
  expect(reports[8]).toMatchObject({ errorCode: "QLOO_NETWORK" });
  expect(JSON.stringify(reports[8])).not.toContain("private provider detail");
  const totals = aggregateComparisons(reports);
  expect(reports.filter((report) => report.repair.attempted)).toHaveLength(5);
  expect(
    reports.filter((report) => report.repair.replacementFound),
  ).toHaveLength(1);
  expect(totals.worstAudienceRank).toEqual({
    win: 1,
    tie: 4,
    loss: 0,
    "not-comparable": 4,
  });
  expect(totals.audienceARank).toEqual({
    win: 0,
    tie: 4,
    loss: 1,
    "not-comparable": 4,
  });
  expect(totals.audienceBRank).toEqual({
    win: 1,
    tie: 4,
    loss: 0,
    "not-comparable": 4,
  });
  console.info(
    `SYNTHETIC adversarial benchmark: ${JSON.stringify({ cases: kinds, outcomes: reports.map((report) => report.product.outcome), totals })}`,
  );
});

it("does not start queued work after the first observed source failure", async () => {
  let calls = 0;
  const transport = source("upstream");
  const counted: CulturalSource = {
    ...transport,
    insights: async (...args) => {
      calls++;
      await Promise.resolve();
      return transport.insights(...args);
    },
  };
  const report = await evaluateSyntheticScenario(input(), counted);
  expect(report.product.outcome).toBe("request-failure");
  expect(calls).toBe(3); // Already in flight; the other three remain undispatched.
  expect(report.sourceCalls).toBe(5); // Two Search + three Insights.
});
