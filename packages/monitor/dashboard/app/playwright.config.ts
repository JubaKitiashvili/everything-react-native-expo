import { defineConfig, devices } from '@playwright/test';

// One-terminal e2e runner:
//   1. `node e2e/fixtures/start-server.mjs` boots the dashboard server
//      with a seeded in-memory-ish SQLite DB + the built app as its
//      public dir, on PORT (default 4173).
//   2. Playwright waits for that URL, then drives the 17 panel specs.
//
// CI runs the same command with FRESH_BUILD=1 so the built app bundle
// is always rebuilt before the suite.

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4173);

export default defineConfig({
  testDir: './e2e/specs',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `node e2e/fixtures/start-server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
    stdout: 'pipe',
    stderr: 'pipe',
  },
});
