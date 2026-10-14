import { expect, test } from "@playwright/test";
import { type PlanRequest } from "../src/lib/model";
import { mockPlan } from "./fixtures";

test("incomplete live presentation preserves bounded partial receipts and states unknown causes", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) =>
    route.fulfill({
      json: await mockPlan(route.request().postDataJSON() as PlanRequest, {
        emptyBooks: true,
      }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Live Qloo" }).click();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(
    page.getByRole("heading", {
      name: "No complete path in the retrieved evidence.",
    }),
  ).toBeVisible();
  const film = page.locator(".diagnostic-card").filter({ hasText: "Film ·" });
  await expect(film).toContainText(
    "Mock Film 1 (mock-movie-1) · Qloo · #1 / #1",
  );
  await expect(film).toContainText(
    "Partial evidence only · not a complete schedule",
  );
  await expect(film).toContainText("Film runtime and both duration limits");
  await expect(film).toContainText("Screening rights, availability, and venue");
  await expect(film).toContainText("Limitations: Rank positions are ordinal");
  const books = page.locator(".diagnostic-card").filter({ hasText: "Books ·" });
  await expect(books).toContainText("blocks the full plan");
  await expect(books).toContainText("does not establish the cause");
  await expect(page.locator(".act")).toHaveCount(0);
  await expect(page.locator(".source-warning")).toHaveCount(0);
});

test("conceptual rejection names a valid replacement with evidence and pending conditions", async ({
  page,
}) => {
  const exclusions: string[][] = [];
  await page.route("**/api/plan", async (route) => {
    const input = route.request().postDataJSON() as PlanRequest;
    exclusions.push(input.constraints.excludedIds);
    await route.fulfill({ json: await mockPlan(input) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Live Qloo" }).click();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await page.getByTitle("Reject Mock Film 1", { exact: true }).click();
  await expect(page.locator(".change-log")).toContainText(
    "Rejected Mock Film 1 (mock-movie-1) → Mock Film 2 (mock-movie-2). Status: conceptual path.",
  );
  await expect(page.locator(".change-log")).toContainText(
    "Replacement evidence: Qloo positions #2 / #2",
  );
  await expect(page.locator(".change-log")).toContainText(
    "Film runtime and both duration limits",
  );
  await expect(page.locator(".act h4").nth(1)).toHaveText("Mock Film 2");
  expect(exclusions).toEqual([[], ["mock-movie-1"]]);
});

test("rejection with no observed replacement remains unresolved without guessing why results emptied", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) =>
    route.fulfill({
      json: await mockPlan(route.request().postDataJSON() as PlanRequest, {
        films: 1,
        emptyFilmsAfterReject: true,
      }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await page.getByTitle("Reject Mock Film 1", { exact: true }).click();
  await expect(page.locator(".change-log")).toContainText(
    "Rejected Mock Film 1 (mock-movie-1). No eligible replacement was observed in the retrieved pool. Status: unresolved; no complete plan.",
  );
  await expect(page.locator(".no-solution")).toContainText(
    "The cause is not established",
  );
  await expect(page.locator(".no-solution")).not.toContainText(
    "every shared entity was explicitly rejected",
  );
  await expect(page.getByText(/Partial evidence only/).first()).toBeVisible();
  await expect(page.locator(".act")).toHaveCount(0);
});

test("a blocked full plan does not hide a valid partial alternative for the rejected domain", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) =>
    route.fulfill({
      json: await mockPlan(route.request().postDataJSON() as PlanRequest, {
        emptyBooksAfterReject: true,
      }),
    }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await page.getByTitle("Reject Mock Film 1", { exact: true }).click();
  await expect(page.locator(".change-log")).toContainText(
    "Partial alternative: Mock Film 2 (mock-movie-2)",
  );
  await expect(page.locator(".change-log")).toContainText(
    "another domain blocks the plan",
  );
  await expect(page.locator(".change-log")).not.toContainText(
    "No eligible replacement was observed",
  );
  await expect(page.locator(".act")).toHaveCount(0);
});

test("a failed repair keeps the rejection active and reports failure without a success state", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) => {
    const input = route.request().postDataJSON() as PlanRequest;
    if (input.constraints.excludedIds.length)
      await route.fulfill({
        status: 503,
        json: {
          error: "QLOO_UPSTREAM",
          message: "Provider temporarily unavailable.",
        },
      });
    else await route.fulfill({ json: await mockPlan(input) });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await page.getByTitle("Reject Mock Film 1", { exact: true }).click();
  await expect(page.locator(".error-box")).toContainText(
    "Replanning after rejecting “Mock Film 1” failed",
  );
  await expect(page.locator(".error-box")).toContainText(
    "The rejection remains active",
  );
  await expect(
    page.getByRole("button", { name: /Clear 1 rejection/ }),
  ).toBeVisible();
  await expect(page.locator(".change-log")).toHaveCount(0);
});

test("a malformed successful planner response is an honest error state", async ({
  page,
}) => {
  await page.route("**/api/plan", async (route) =>
    route.fulfill({ json: { status: "ready", options: [] } }),
  );
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.locator(".error-box")).toContainText(
    "invalid or inconsistent result",
  );
  await expect(page.locator(".option-picker")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Find the shared ground" }),
  ).toBeEnabled();
});
