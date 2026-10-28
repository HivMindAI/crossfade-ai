import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testIgnore: "origin-production.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:3100",
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
  },
  webServer: {
    command:
      "node node_modules/next/dist/bin/next dev --hostname 127.0.0.1 --port 3100",
    url: "http://127.0.0.1:3100",
    // Always own the test server so a user's live-enabled server is never used.
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: { QLOO_API_KEY: "", QLOO_LIVE_ENABLED: "0" },
  },
});
