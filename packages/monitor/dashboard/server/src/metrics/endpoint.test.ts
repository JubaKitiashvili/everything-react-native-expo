// Task 117.68 — /metrics endpoint integration tests.

import { afterEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from '../server.js';
import { DashboardStore } from '../storage/sqliteStore.js';
import { PROMETHEUS_CONTENT_TYPE } from './prometheus.js';
import type { EventRecord } from '../storage/types.js';

function makeEvent(id: string): EventRecord {
  return {
    id,
    type: 'crash',
    severity: 'critical',
    sessionId: 'sess-1',
    timestamp: 1_000,
    receivedAt: 1_000,
    payload: { message: 'boom' },
  };
}

describe('GET /metrics', () => {
  let store: DashboardStore;
  let handle: DashboardServerHandle;
  let url: string;

  async function start(options: Parameters<typeof createDashboardServer>[0] = {}): Promise<void> {
    store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      enableWebsocket: true,
      publicDir: '/tmp/erne-monitor-nonexistent',
      ...options,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    url = `http://127.0.0.1:${port}`;
  }

  afterEach(async () => {
    await handle.close();
  });

  test('serves Prometheus text format with the right content type', async () => {
    await start();
    const res = await fetch(`${url}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe(PROMETHEUS_CONTENT_TYPE);
    // Base security headers ride along on /metrics too.
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    const body = await res.text();
    expect(body).toContain('# TYPE erne_events_total counter');
    expect(body).toContain('# TYPE erne_uptime_seconds gauge');
    expect(body).toContain('# TYPE erne_migrations_applied gauge');
  });

  test('reflects the real stored event count', async () => {
    await start();
    store.insertEvent(makeEvent('e1'));
    store.insertEvent(makeEvent('e2'));
    const body = await (await fetch(`${url}/metrics`)).text();
    expect(body).toContain('erne_events_total 2');
  });

  test('surfaces ingest queue depth + stats when the WS handler is attached', async () => {
    await start();
    const body = await (await fetch(`${url}/metrics`)).text();
    expect(body).toContain('# TYPE erne_ingest_queue_depth gauge');
    expect(body).toContain('erne_ingest_queue_depth 0');
    expect(body).toContain('# TYPE erne_ingest_queue_enqueued_total counter');
    expect(body).toContain('erne_subscribers 0');
  });

  test('migrations_applied + erne_ready reflect a healthy store', async () => {
    await start();
    const body = await (await fetch(`${url}/metrics`)).text();
    expect(body).toMatch(/erne_migrations_applied [1-9][0-9]*/);
    expect(body).toContain('erne_ready 1');
  });

  test('omits queue metrics when the WS handler is disabled', async () => {
    await start({ enableWebsocket: false });
    const body = await (await fetch(`${url}/metrics`)).text();
    expect(body).toContain('erne_events_total');
    expect(body).not.toContain('erne_ingest_queue_depth');
  });

  test('returns 404 when metrics are disabled', async () => {
    await start({ metrics: false });
    const res = await fetch(`${url}/metrics`);
    expect(res.status).toBe(404);
  });

  test('is gated by the API key by default', async () => {
    await start({ apiKey: 'secret-key' });
    const unauth = await fetch(`${url}/metrics`);
    expect(unauth.status).toBe(401);

    const authed = await fetch(`${url}/metrics`, {
      headers: { authorization: 'Bearer secret-key' },
    });
    expect(authed.status).toBe(200);
  });

  test('metrics.public bypasses the API-key gate', async () => {
    await start({ apiKey: 'secret-key', metrics: { public: true } });
    const res = await fetch(`${url}/metrics`);
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('erne_events_total');
  });
});
