import { expect, test } from "@playwright/test";

test("same-origin planning reaches the real production route without provider credentials", async ({
  page,
}) => {
  await page.goto("/");

  const syntheticResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/plan" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  const synthetic = await syntheticResponse;
  expect(synthetic.status()).toBe(200);
  expect((await synthetic.json()).mode).toBe("synthetic");
  await page.getByRole("tab", { name: "Evidence" }).click();
  await expect(
    page.getByText("Synthetic fixture evidence").first(),
  ).toBeVisible();

  await page.getByRole("button", { name: "Live Qloo" }).click();
  const liveResponse = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/plan" &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Find the shared ground" }).click();
  const live = await liveResponse;
  expect(live.status()).toBe(503);
  expect((await live.json()).error).toBe("MISSING_KEY");
});

test("production route rejects cross-site and missing origins before planning", async ({
  request,
}) => {
  const crossSite = await request.post("/api/plan", {
    headers: {
      Origin: "https://other.example",
      "Sec-Fetch-Site": "cross-site",
      Host: "127.0.0.1:3100",
      "X-Forwarded-Host": "127.0.0.1:3100",
    },
    data: {},
  });
  expect(crossSite.status()).toBe(403);
  expect((await crossSite.json()).error).toBe("ORIGIN");

  const missing = await request.post("/api/plan", { data: {} });
  expect(missing.status()).toBe(403);
  expect((await missing.json()).error).toBe("ORIGIN");
});
