import { expect, test } from "@playwright/test";

test("synthetic negotiation, evidence, and live repair", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Different tastes/ }),
  ).toBeVisible();
  await expect(page.getByText("SYNTHETIC DEVELOPMENT PREVIEW")).toBeVisible();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("3 VIABLE PATHS")).toBeVisible();
  const first = page.locator(".act h4").first();
  const original = await first.textContent();
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(
    page.getByText(/Ranks? is within each request/).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Blueprint" }).click();
  await page.locator(".reject-button").first().click();
  await expect(
    page.getByText("The plan was repaired. Review what changed below."),
  ).toBeVisible();
  await expect(page.locator(".act h4").first()).not.toHaveText(original ?? "");
});

test("shows a no-solution state for impossible film rules", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="range"]').fill("60");
  await page.locator(".rating-list label").nth(0).click();
  await page.locator(".rating-list label").nth(1).click();
  await page.locator(".rating-list label").nth(2).click();
  await page.locator(".rating-list label").nth(3).click();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(
    page.getByRole("heading", { name: "No honest bridge under these rules." }),
  ).toBeVisible();
});

test("preserves inputs and explains a server error", async ({ page }) => {
  await page.goto("/");
  await page.route("**/api/plan", async (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({
        error: "QLOO_UPSTREAM",
        message: "Qloo is temporarily unavailable.",
      }),
    }),
  );
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.locator(".error-box")).toContainText(
    "Qloo is temporarily unavailable.",
  );
  await expect(page.getByLabel("Give this group a name").first()).toHaveValue(
    "The improvisers",
  );
});

test("live mode does not silently fall back to fixtures without a key", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Live Qloo" }).click();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.locator(".error-box")).toContainText(
    "Live Qloo mode requires QLOO_API_KEY.",
  );
  await expect(page.getByText("3 VIABLE PATHS")).toHaveCount(0);
});
