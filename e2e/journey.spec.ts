import { expect, test } from "@playwright/test";

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
  await expect(page.locator(".act h4").first()).not.toHaveText(original ?? "");
});

test("shows a no-solution state for impossible film rules", async ({
  page,
}) => {
  await page.goto("/");
  await page.locator('input[type="range"]').first().fill("60");
  await page.locator(".rating-list label").nth(0).click();
  await page.locator(".rating-list label").nth(1).click();
  await page.locator(".rating-list label").nth(2).click();
  await page.locator(".rating-list label").nth(3).click();
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  await expect(
    page.getByRole("heading", { name: "No honest bridge under these rules." }),
  ).toBeVisible();
  await expect(page.locator(".results-meta")).toHaveText("NO COMPLETE PATH");
  await expect(
    page.getByText(/movie: every non-rejected shared film/).first(),
  ).toBeVisible();
  await page.getByText("Decision and recovery record").click();
  await expect(page.getByText(/Hard rules stay intact/)).toBeVisible();
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
    page.getByRole("heading", { name: "No honest bridge under these rules." }),
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
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        status: "conceptual",
        mode: "live",
        warning: undefined,
        resolved: [[], []],
        audit: [
          {
            step: "VERIFY",
            detail: "Missing runtime prevents a verified schedule.",
          },
        ],
        gaps: [
          "Scheduling is unverified: obtain independent runtime metadata.",
        ],
        alternativesNote:
          "One fairness-first path is supported. No distinct alternative exists.",
        metrics: { sourceCalls: 8, recoveryCalls: 0, elapsedMs: 1 },
        options: [
          {
            id: "artist~film~book",
            title: "The Shared Exchange",
            path: "fairness",
            balance: [3, 3],
            programMinutes: null,
            scheduleStatus: "conceptual",
            unverified: ["runtime", "content rating"],
            rationale: "A creative sequence; no schedule is verified.",
            candidates: (["artist", "movie", "book"] as const).map(
              (domain, index) => ({
                entity: {
                  id: domain,
                  name: ["Music", "Film", "Book"][index],
                  domain,
                },
                ranks: [1, 1],
                signals: [[], []],
                influences: [[], []],
                source: "qloo",
                explanation: "Mocked shared-ID evidence for UI testing only.",
              }),
            ),
          },
        ],
      }),
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
    page.getByText(/missing values have not passed the hard gates/),
  ).toBeVisible();
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
