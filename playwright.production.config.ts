import { defineConfig } from "@playwright/test";

const port = Number(process.env.CROSSFADE_TEST_PORT ?? "3100");
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("CROSSFADE_TEST_PORT must be an unprivileged TCP port.");
const origin = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "origin-production.spec.ts",
  use: {
    baseURL: origin,
    browserName: "chromium",
    channel: process.env.CI ? undefined : "chrome",
    headless: true,
  },
  webServer: {
    command: `npm run start -- --hostname 127.0.0.1 --port ${port}`,
    url: origin,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "pipe",
    env: {
      CROSSFADE_SITE_ORIGIN: origin,
      QLOO_API_KEY: "",
      QLOO_LIVE_ENABLED: "0",
      UPSTASH_REDIS_REST_URL: "",
      UPSTASH_REDIS_REST_TOKEN: "",
    },
  },
});
