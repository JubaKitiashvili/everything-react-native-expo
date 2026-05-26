// Boots a seeded dashboard server serving the built dashboard app, so
// Playwright (and ad-hoc smoke checks) have a warm, deterministic target.
//
// Plain ESM so `node ./e2e/fixtures/start-server.mjs 4174` just works.

import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const APP_ROOT = resolve(here, '..', '..');
const SERVER_ROOT = resolve(APP_ROOT, '..', 'server');
const PUBLIC_DIR = resolve(APP_ROOT, '..', 'public');

const port = Number(process.argv[2] ?? 4174);

function ensureBuilt() {
  if (process.env.FRESH_BUILD === '1' || !existsSync(join(PUBLIC_DIR, 'index.html'))) {
    console.log('[e2e] building dashboard app…');
    execSync('npm run build', { cwd: APP_ROOT, stdio: 'inherit' });
  }
}

async function start() {
  ensureBuilt();

  const tmpRoot = mkdtempSync(join(tmpdir(), 'erne-monitor-next-e2e-'));
  const dbPath = join(tmpRoot, 'dashboard.db');
  mkdirSync(dirname(dbPath), { recursive: true });

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
  console.log(`[e2e] dashboard-next listening on ${url}`);
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
