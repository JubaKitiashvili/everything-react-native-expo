#!/usr/bin/env node
// @erne/monitor dashboard — container entrypoint.
//
// The package exports `startDashboardServer` (a library) but the published
// `npx erne-universal dashboard` CLI wrapper (Task 114) is not bundled into
// this server package yet. This thin shim provides the container runtime
// contract until that CLI ships:
//
//   * binds HOST (default 0.0.0.0) so the port is reachable outside the
//     container — the library defaults to 127.0.0.1, which would be
//     unreachable from a published port / k8s Service.
//   * resolves the SQLite path onto the mounted /data volume.
//   * enables the Redis read-cache when REDIS_URL is set (supported today).
//   * surfaces DATABASE_URL as a forward-looking contract: the Postgres
//     store is async (IMonitorStoreAsync) and is not yet wired into the
//     sync HTTP server in this package, so we log + fall back to SQLite
//     rather than silently ignore it. Swap in the async store here once
//     Task 117.x lands without changing the image or compose/helm env.
//   * exposes /metrics publicly inside the container network when
//     ERNE_METRICS_PUBLIC=true (handy for a Prometheus sidecar that can't
//     present the dashboard API key).
//   * handles SIGTERM/SIGINT for graceful orchestrator shutdown.
//
// Env contract (all optional unless noted):
//   HOST                  bind address           (default 0.0.0.0)
//   PORT                  listen port            (default 3333)
//   ERNE_DB_PATH          SQLite file path       (default /data/dashboard.db)
//   ERNE_API_KEY          gate /api/* + /metrics  (default: no auth)
//   ERNE_WEBHOOK_SECRET   HMAC for outbound alert webhooks
//   ERNE_METRICS_PUBLIC   "true" → /metrics ungated
//   REDIS_URL             ioredis connection string for the read cache
//   DATABASE_URL          Postgres DSN (reserved — see note above)

import { startDashboardServer, createRedisCache } from '@erne/monitor-dashboard-server';

const host = process.env.HOST ?? '0.0.0.0';
const port = Number(process.env.PORT ?? 3333);
const dbPath = process.env.ERNE_DB_PATH ?? '/data/dashboard.db';

if (process.env.DATABASE_URL) {
  console.warn(
    '[erne-monitor] DATABASE_URL is set, but the Postgres store is not yet ' +
      'wired into this server build. Falling back to SQLite at ' +
      `${dbPath}. Remove DATABASE_URL to silence this warning.`,
  );
}

const options = {
  host,
  port,
  dbPath,
  apiKey: process.env.ERNE_API_KEY ?? null,
  webhookSigningSecret: process.env.ERNE_WEBHOOK_SECRET ?? null,
  metrics:
    process.env.ERNE_METRICS_PUBLIC === 'true' ? { public: true } : undefined,
};

// Optional Redis read-cache. createRedisCache throws if ioredis is missing;
// we surface that clearly rather than crash-looping silently.
if (process.env.REDIS_URL) {
  try {
    options.cache = await createRedisCache({ connection: process.env.REDIS_URL });
    console.log('[erne-monitor] Redis read-cache enabled.');
  } catch (err) {
    console.error(
      '[erne-monitor] REDIS_URL is set but the Redis cache could not be ' +
        `initialised: ${err instanceof Error ? err.message : String(err)}. ` +
        'Continuing with the in-memory cache.',
    );
  }
}

const handle = await startDashboardServer(options);
console.log(`[erne-monitor] dashboard listening on ${handle.url}`);

let shuttingDown = false;
for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[erne-monitor] received ${signal}, shutting down…`);
    handle
      .close()
      .then(() => process.exit(0))
      .catch((err) => {
        console.error('[erne-monitor] error during shutdown:', err);
        process.exit(1);
      });
  });
}
