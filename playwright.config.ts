import { defineConfig } from "@playwright/test";

/**
 * End-to-end: host + two players + a TV in separate browser contexts, against
 * the local full stack (Vite + the Cloudflare plugin run the Worker and the
 * Durable Objects in workerd, same as `wrangler dev`).
 * Uses the locally installed Chrome (channel "chrome"); set PW_CHANNEL to override.
 */
export default defineConfig({
  testDir: "test/e2e",
  timeout: 120_000,
  expect: { timeout: 10_000 },
  workers: 1,
  use: {
    baseURL: "http://localhost:5174",
    channel: process.env.PW_CHANNEL ?? "chrome",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npx vite --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
