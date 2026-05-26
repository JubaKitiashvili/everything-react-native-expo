// Task 117.51 + 117.69 — server wiring for the read cache + request log.

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createDashboardServer, type DashboardServerHandle } from './server.js';
import { DashboardStore } from './storage/sqliteStore.js';
import { InMemoryCache } from './cache/in-memory-cache.js';
import { createLogger, type LogStream } from './logging/logger.js';
import type { CrashGroupRecord } from './storage/types.js';

function makeCapture(): { stream: LogStream; records: () => Array<Record<string, unknown>> } {
  const lines: string[] = [];
  const stream: LogStream = { write: (chunk) => void lines.push(chunk) };
  const records = (): Array<Record<string, unknown>> =>
    lines
      .map((l) => l.trimEnd())
      .filter((l) => l.length > 0)
      .map((l) => JSON.parse(l) as Record<string, unknown>);
  return { stream, records };
}

function seedGroup(store: DashboardStore, fingerprint: string, status: CrashGroupRecord['status']): void {
  store.upsertCrashGroup({
    fingerprint,
    message: 'boom',
    firstSeen: 1,
    lastSeen: 2,
    eventCount: 1,
    sessionCount: 1,
    status,
  });
}

describe('GET /api/crash-groups caching', () => {
  let store: DashboardStore;
  let cache: InMemoryCache;
  let ctx: DashboardServerHandle & { url: string };

  beforeEach(async () => {
    store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    cache = new InMemoryCache();
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      cache,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    ctx = { ...handle, port, url: `http://127.0.0.1:${port}` };
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('second GET is served from cache; mutating status invalidates it', async () => {
    seedGroup(store, 'fp1', 'new');

    // First read populates the cache (a miss → store scan).
    const first = (await (await fetch(`${ctx.url}/api/crash-groups`)).json()) as {
      groups: CrashGroupRecord[];
    };
    expect(first.groups).toHaveLength(1);
    expect(first.groups[0]?.status).toBe('new');
    expect(cache.stats().sets).toBe(1);

    // Mutate the store directly behind the cache's back to prove the next
    // GET serves the *cached* (stale-to-store) body — a cache hit.
    store.setCrashGroupStatus('fp1', 'resolved');
    const second = (await (await fetch(`${ctx.url}/api/crash-groups`)).json()) as {
      groups: CrashGroupRecord[];
    };
    expect(second.groups[0]?.status).toBe('new'); // still cached
    expect(cache.stats().hits).toBeGreaterThanOrEqual(1);

    // The status endpoint invalidates the cache → next GET rebuilds.
    const statusRes = await fetch(`${ctx.url}/api/crash-groups/fp1/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'investigating' }),
    });
    expect(statusRes.status).toBe(200);

    const third = (await (await fetch(`${ctx.url}/api/crash-groups`)).json()) as {
      groups: CrashGroupRecord[];
    };
    expect(third.groups[0]?.status).toBe('investigating');
  });
});

describe('request logging', () => {
  test('a request emits start + finish with a stable requestId', async () => {
    const cap = makeCapture();
    const logger = createLogger({ stream: cap.stream, level: 'info', now: () => 1_000 });
    const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
    const handle = createDashboardServer({
      host: '127.0.0.1',
      port: 0,
      store,
      enableWebsocket: false,
      publicDir: '/tmp/erne-monitor-nonexistent',
      logger,
      generateRequestId: () => 'req_fixed',
      cache: false,
    });
    await new Promise<void>((resolve) => handle.server.listen(0, '127.0.0.1', () => resolve()));
    const address = handle.server.address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;

    const res = await fetch(`http://127.0.0.1:${port}/api/health`);
    expect(res.status).toBe(200);
    await res.text();

    // Wait for the 'finish' event to flush.
    await new Promise<void>((r) => setTimeout(r, 20));

    const recs = cap.records().filter((r) => r.requestId === 'req_fixed');
    const start = recs.find((r) => r.msg === 'request.start');
    const finish = recs.find((r) => r.msg === 'request.finish');
    expect(start).toMatchObject({ requestId: 'req_fixed', method: 'GET', path: '/api/health' });
    expect(finish).toMatchObject({
      requestId: 'req_fixed',
      method: 'GET',
      path: '/api/health',
      status: 200,
    });
    expect(typeof finish?.durationMs).toBe('number');

    await handle.close();
  });
});
