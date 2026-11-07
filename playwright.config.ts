import { defineConfig } from "@playwright/test";

/**
 * End-to-end tests against the BUILT Cloudflare Worker (run `pnpm cf:build`
 * first). Playwright starts the local stand-ins for every external service
 * and the Worker preview, and stops them afterwards, so each run gets a fresh
 * worker. Setup: e2e/README.md.
 */
const reuse = !process.env.CI;

export default defineConfig({
  testDir: "e2e/tests",
  testMatch: "*.spec.cjs",
  // The suites share one database and one worker: run them one at a time, in file order.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 15 * 60_000,
  globalSetup: "./e2e/global-setup.cjs",
  outputDir: "e2e/output/test-results",
  reporter: [["list"], ["html", { open: "never", outputFolder: "e2e/report" }]],
  use: {
    baseURL: "http://127.0.0.1:8787",
    trace: "retain-on-failure",
    // @playwright/test defaults to NO action timeout; the suites expect the
    // library's 30s, so a missing element fails fast instead of hanging.
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
  },
  webServer: [
    {
      command: "node e2e/fakes/fake-gemini.cjs",
      stderr: "ignore",
      url: "http://127.0.0.1:9200/__state",
      reuseExistingServer: reuse,
    },
    {
      command: "node e2e/fakes/fake-services.cjs",
      stderr: "ignore",
      url: "http://127.0.0.1:9300/__state",
      reuseExistingServer: reuse,
    },
    {
      command: "node scripts/dev/upstash-shim.mjs",
      stderr: "ignore",
      url: "http://127.0.0.1:8078/",
      reuseExistingServer: reuse,
    },
    {
      command: `${process.env.MOTO_SERVER ?? "moto_server"} -H 127.0.0.1 -p 9100`,
      url: "http://127.0.0.1:9100/",
      stderr: "ignore", // logs every request
      reuseExistingServer: reuse,
    },
    {
      // Serves the existing .open-next build (pnpm cf:build) in workerd.
      command: "pnpm exec opennextjs-cloudflare preview --port 8787 --ip 127.0.0.1",
      url: "http://127.0.0.1:8787/en",
      timeout: 180_000,
      reuseExistingServer: reuse,
    },
  ],
});
