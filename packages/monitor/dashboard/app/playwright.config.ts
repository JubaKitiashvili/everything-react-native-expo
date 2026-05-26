import { defineConfig, devices } from '@playwright/test';

// One-terminal e2e runner for dashboard-next:
//   `node e2e/fixtures/start-server.mjs ${PORT}` builds next → next/dist,
//   seeds a temp SQLite DB, and serves it on PORT (default 4174).
// CI sets FRESH_BUILD=1 so the bundle is always rebuilt before the suite.

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 4174);

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
