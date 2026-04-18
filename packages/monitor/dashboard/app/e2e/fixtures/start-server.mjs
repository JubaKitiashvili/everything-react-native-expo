// Starts a seeded dashboard server on the port passed as the first argv,
// so Playwright's webServer hook has a warm, deterministic target.
//
// Responsibilities:
//   1. Locate (or build) the static dashboard app bundle.
//   2. Open a fresh temp SQLite DB.
//   3. Seed the DB with fixture events, sessions, crash groups, bug
//      reports, alert rules, symbols, settings — enough rows to let
//      every panel render non-empty state.
//   4. Start the dashboard server on the requested port.
//
// Kept in plain ESM (.mjs) so `node ./e2e/fixtures/start-server.mjs 4173`
// just works — no extra compile step in CI.

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');
const SERVER_ROOT = resolve(APP_ROOT, '..', 'server');
const PUBLIC_DIR = resolve(APP_ROOT, '..', 'public');

const port = Number(process.argv[2] ?? 4173);

function ensureBuilt() {
  if (process.env.FRESH_BUILD === '1' || !existsSync(join(PUBLIC_DIR, 'index.html'))) {
    console.log('[e2e] building dashboard app…');
    execSync('npm run build', { cwd: APP_ROOT, stdio: 'inherit' });
  }
}

async function start() {
  ensureBuilt();

  // Temp DB lives alongside each run so the specs never see each other's data.
  const tmpRoot = mkdtempSync(join(tmpdir(), 'erne-monitor-e2e-'));
  const dbPath = join(tmpRoot, 'dashboard.db');
  mkdirSync(dirname(dbPath), { recursive: true });

  // The server package is in the sibling workspace — resolve it relative to
  // the dashboard app so this script works whether run from CI or locally.
  const serverEntry = resolve(SERVER_ROOT, 'dist', 'index.js');
  if (!existsSync(serverEntry)) {
    console.log('[e2e] building dashboard server…');
    execSync('npm run build', { cwd: SERVER_ROOT, stdio: 'inherit' });
  }
  const server = await import(serverEntry);

  const store = new server.DashboardStore({ dbPath });
  const seed = await import('./seed.mjs');
  seed.seedFixtures(store, Date.now());

  const handle = await server.startDashboardServer({
    port,
    host: '127.0.0.1',
    publicDir: PUBLIC_DIR,
    store,
  });

  const url = `http://127.0.0.1:${handle.port}`;
  console.log(`[e2e] dashboard listening on ${url}`);
  console.log(`[e2e] seeded DB at ${dbPath}`);

  const shutdown = async () => {
    try {
      await handle.close();
    } finally {
      rmSync(tmpRoot, { recursive: true, force: true });
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  console.error('[e2e] failed to start:', err);
  process.exit(1);
});
