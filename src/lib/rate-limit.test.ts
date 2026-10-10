import { expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

it("limits a caller and resets in a new window", () => {
  for (let i = 0; i < 15; i++)
    expect(() => checkRateLimit("test-rate", 1000)).not.toThrow();
  expect(() => checkRateLimit("test-rate", 1001)).toThrowError(/Too many/);
  expect(() => checkRateLimit("test-rate", 62000)).not.toThrow();
});
