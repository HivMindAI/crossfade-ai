import { expect, test } from "@playwright/test";
import { mockPlan } from "./fixtures";

test("supports arrow, Home, and End keys in result tabs", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  const fairness = page.getByRole("tab", { name: /Fairness first/ });
  await fairness.focus();
  await fairness.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: /Favors The improvisers/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("End");
  await expect(
    page.getByRole("tab", { name: /Favors The shapeshifters/ }),
  ).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(fairness).toHaveAttribute("aria-selected", "true");
  const blueprint = page.getByRole("tab", { name: "Blueprint" });
  await blueprint.focus();
  await blueprint.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Evidence" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(
    page.getByText("Synthetic fixture evidence").first(),
  ).toBeVisible();
});

test("synthetic negotiation, evidence, and live repair", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /Different tastes/ }),
  ).toBeVisible();
  await expect(page.getByText("SYNTHETIC DEVELOPMENT PREVIEW")).toBeVisible();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toBeVisible();
  await expect(page.getByRole("tab", { name: /Fairness first/ })).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Favors The improvisers/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("tab", { name: /Favors The shapeshifters/ }),
  ).toBeVisible();
  await expect(page.getByText(/Conceptual program:/)).toBeVisible();
  const first = page.locator(".act h4").first();
  const original = await first.textContent();
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(
    page.getByText("Synthetic fixture evidence").first(),
  ).toBeVisible();
  await expect(page.getByText("Algorithmic score").first()).toBeVisible();
  await expect(page.getByText(/Entity ID:/).first()).toBeVisible();
  await expect(page.getByText(/Checked: Same entity ID/).first()).toBeVisible();
  await expect(page.getByText("Creative interpretation").first()).toBeVisible();
  await expect(
    page.getByText(/positions within separate requests/).first(),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Blueprint" }).click();
  await page.locator(".reject-button").first().click();
  await expect(
    page.getByText(
      /The rejected component was excluded and both audiences were reevaluated/,
    ),
  ).toBeVisible();
  await expect(
    page
      .getByText(/Rejected .* → .*Status: duration-verified complete path/)
      .first(),
  ).toBeVisible();
  await expect(page.locator(".act h4").first()).not.toHaveText(original ?? "");
});

test("shows a no-solution state for impossible film rules", async ({
  page,
}) => {
  await page.goto("/");
  const filmLimit = page.getByRole("slider", { name: /Maximum film length/ });
  await filmLimit.focus();
  await filmLimit.press("Home");
  await expect(page.getByText("Maximum film length 60 min")).toBeVisible();
  await page.locator(".rating-list label").nth(3).click();
  await page.locator(".rating-list label").nth(0).click();
  await page.locator(".rating-list label").nth(1).click();
  await page.locator(".rating-list label").nth(2).click();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(
    page.getByRole("heading", {
      name: "No complete path in the retrieved evidence.",
    }),
  ).toBeVisible();
  await expect(page.locator(".results-meta")).toHaveText("NO COMPLETE PATH");
  await expect(
    page.getByText(/movie: shared entities in the retrieved pool/).first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".diagnostic-card")
      .filter({ hasText: "Film · blocks the full plan" }),
  ).toBeVisible();
  await expect(
    page.getByText(/Partial evidence only · not a complete schedule/).first(),
  ).toBeVisible();
  await page.getByText("Decision and recovery record").click();
  await expect(page.getByText(/Hard rules stay intact/)).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("a total-program limit includes the non-film agenda", async ({ page }) => {
  await page.goto("/");
  const programLimit = page.getByRole("slider", {
    name: /Maximum total program/,
  });
  await programLimit.focus();
  await programLimit.press("Home");
  await expect(programLimit).toHaveValue("120");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(
    page.getByRole("heading", {
      name: "No complete path in the retrieved evidence.",
    }),
  ).toBeVisible();
  await expect(page.getByText(/total-time/).first()).toBeVisible();
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
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toHaveCount(0);
});

test("mock live evidence without runtime is clearly conceptual, not a schedule", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Live Qloo" }).click();
  await page.route("**/api/plan", async (route) =>
    route.fulfill({
      json: await mockPlan(route.request().postDataJSON(), { films: 1 }),
    }),
  );
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("1 CONCEPTUAL PATH")).toBeVisible();
  await expect(page.getByText(/NOT A VERIFIED SCHEDULE/)).toBeVisible();
  await expect(
    page.getByText(/No total duration or screening schedule is claimed/),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(
    page.getByText(/Unverified: Film runtime and both duration limits/),
  ).toBeVisible();
  await expect(page.getByText("Qloo-returned evidence").first()).toBeVisible();
});
test("editing a constraint clears the prior plan until it is reevaluated", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toBeVisible();
  await page.getByRole("slider", { name: /Maximum film length/ }).fill("90");
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toHaveCount(0);
  await expect(
    page.getByText(/Your shared experience begins here/),
  ).toBeVisible();
});

test("the last film rating stays selected for mouse and keyboard without clearing a successful result", async ({
  page,
}) => {
  await page.goto("/");
  const ratings = page.getByRole("group", { name: "Allowed film ratings" });
  await ratings.getByRole("checkbox", { name: "G", exact: true }).uncheck();
  await ratings.getByRole("checkbox", { name: "PG", exact: true }).uncheck();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.locator(".results-meta")).toContainText("DURATION-CHECKED");
  const priorResult = await page.locator(".results-meta").textContent();
  const last = ratings.getByRole("checkbox", { name: "PG-13" });
  await last.click();
  await expect(last).toBeChecked();
  await expect(ratings).toContainText(
    "Keep at least one film rating selected.",
  );
  await expect(page.locator(".results-meta")).toHaveText(priorResult ?? "");
  await last.focus();
  await last.press("Space");
  await expect(last).toBeChecked();
  await expect(page.locator(".results-meta")).toHaveText(priorResult ?? "");
  await ratings.getByRole("checkbox", { name: "R", exact: true }).check();
  await expect(ratings).toContainText("Choose at least one film rating.");
  await last.focus();
  await last.press("Space");
  await expect(last).not.toBeChecked();
  await expect(
    page.getByText(/Your shared experience begins here/),
  ).toBeVisible();
});

test("rerunning the same inputs does not claim a rejection", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toBeVisible();
  await page.getByRole("button", { name: "Run again" }).click();
  await expect(
    page.getByText("Evidence gathered and alternatives evaluated."),
  ).toBeVisible();
  await expect(page.getByText(/rejected component was excluded/)).toHaveCount(
    0,
  );
});

test("mobile layout keeps the planning journey readable without horizontal overflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toBeVisible();
  await expect(page.getByRole("tab", { name: "Evidence" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test("an in-flight plan cannot overwrite a newly edited constraint", async ({
  page,
}) => {
  await page.goto("/");
  let requests = 0;
  let finishFirst: () => void = () => {};
  const firstFinished = new Promise<void>((resolve) => {
    finishFirst = resolve;
  });
  await page.route("**/api/plan", async (route) => {
    if (++requests === 1) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      try {
        await route.continue();
      } catch {
        // The edited input aborts this obsolete request.
      } finally {
        finishFirst();
      }
    } else {
      await route.continue();
    }
  });
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.getByText("Comparing both audiences.")).toBeVisible();
  await page.getByRole("slider", { name: /Maximum film length/ }).fill("90");
  await expect(
    page.getByRole("button", { name: "Find the shared ground" }),
  ).toBeEnabled();
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toHaveCount(0);
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(page.locator(".act h4").nth(1)).toHaveText(
    "After the Last Train",
  );
  await firstFinished;
  await expect(page.locator(".act h4").nth(1)).toHaveText(
    "After the Last Train",
  );
});

test("a slow synthetic plan explains the wait and still uses the real API", async ({
  page,
}) => {
  await page.goto("/");
  await page.route("**/api/plan", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 5_200));
    await route.continue();
  });
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(
    page.getByText("Still checking the available evidence.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByText("3 DURATION-CHECKED PATHS")).toBeVisible();
});
