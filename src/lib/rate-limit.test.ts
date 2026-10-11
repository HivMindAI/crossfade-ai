import { expect, it } from "vitest";
import { checkRateLimit } from "./rate-limit";

it("limits a caller and resets in a new window", () => {
  for (let i = 0; i < 15; i++)
    expect(() => checkRateLimit("test-rate", 1000)).not.toThrow();
  expect(() => checkRateLimit("test-rate", 1001)).toThrowError(/Too many/);
  expect(() => checkRateLimit("test-rate", 62000)).not.toThrow();
});

it("keeps the synthetic emergency window separate from live", () => {
  for (let i = 0; i < 60; i++) checkRateLimit("mode-synthetic", 1000, 60);
  expect(() => checkRateLimit("mode-synthetic", 1000, 60)).toThrow();
  expect(() => checkRateLimit("mode-live", 1000, 15)).not.toThrow();
  for (let i = 1; i < 15; i++) checkRateLimit("mode-live", 1000, 15);
  expect(() => checkRateLimit("mode-live", 1000, 15)).toThrow();
});
