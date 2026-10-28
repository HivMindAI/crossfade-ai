import { expect, it } from "vitest";
import { type PlanRequest } from "./model";
import { runNegotiation } from "./orchestrator";
import { parsePlanResponse } from "./plan-response";
import { syntheticSource } from "./synthetic";

const input: PlanRequest = {
  mode: "synthetic",
  audiences: [
    { name: "A", interests: [{ name: "Miles Davis", type: "artist" }] },
    { name: "B", interests: [{ name: "Beyoncé", type: "artist" }] },
  ],
  constraints: {
    maxMovieMinutes: 120,
    allowedRatings: ["PG", "G", "PG-13"],
    excludedIds: [],
  },
};

it("accepts the actual typed server result and rejects malformed or contradictory success payloads", async () => {
  const result = await runNegotiation(input, syntheticSource);
  expect(parsePlanResponse(result, input)).toEqual(result);
  expect(
    parsePlanResponse({ status: "ready", options: [] }, input),
  ).toBeUndefined();
  expect(parsePlanResponse({ ...result, options: [] }, input)).toBeUndefined();
  expect(parsePlanResponse({ ...result, mode: "live" }, input)).toBeUndefined();
  const contradictory = structuredClone(result);
  contradictory.diagnostics[0].eligible = 0;
  expect(parsePlanResponse(contradictory, input)).toBeUndefined();
  const excluded = structuredClone(input);
  excluded.constraints.excludedIds.push(
    result.options[0].candidates[0].entity.id,
  );
  expect(parsePlanResponse(result, excluded)).toBeUndefined();
});

it("refuses a verified-schedule claim when movie runtime is missing", async () => {
  const result = await runNegotiation(input, syntheticSource);
  for (const option of result.options)
    option.candidates[1].entity.duration = undefined;
  expect(parsePlanResponse(result, input)).toBeUndefined();
});
