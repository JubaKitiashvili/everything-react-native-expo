import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { DashboardStore } from '../storage/sqliteStore.js';
import type { EventRecord } from '../storage/types.js';
import { INGEST_PATH, IngestWebSocketHandler, SUBSCRIBE_PATH } from './wsHandler.js';
import type { RateLimiterConfig } from './rateLimiter.js';

async function openServerWithHandler(options: Parameters<typeof makeHandler>[1] = {}): Promise<{
  httpServer: Server;
  handler: IngestWebSocketHandler;
  store: DashboardStore;
  port: number;
  close: () => Promise<void>;
}> {
  const store = new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
  const handler = makeHandler(store, options);
  const httpServer = createServer();
  handler.attach(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, '127.0.0.1', () => resolve()));
  const address = httpServer.address() as AddressInfo;
  return {
    httpServer,
    handler,
    store,
    port: address.port,
    close: async () => {
      handler.close();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
      store.close();
    },
  };
}

function makeHandler(
  store: DashboardStore,
  options: {
    now?: () => number;
    maxEventsPerWindow?: number;
    rateWindowMs?: number;
    maxMessageBytes?: number;
    apiKey?: string | null;
    tenantRateLimit?: RateLimiterConfig | false;
  } = {},
): IngestWebSocketHandler {
  return new IngestWebSocketHandler({
    store,
    onError: () => {
      /* swallow in tests */
    },
    ...options,
  });
}

function waitOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', reject);
  });
}

/**
 * Drain-style reader that attaches once and buffers every message so
 * tests can `await queue.next()` without caring whether the message
 * arrived before or after the call. Without this, `.once('message')`
 * would lose frames that landed during the small async gap between
 * "send" and "listen".
 */
interface MessageQueue {
  next(timeoutMs?: number): Promise<string>;
  collect(count: number, timeoutMs?: number): Promise<string[]>;
  stop(): void;
}

function openMessageQueue(ws: WebSocket): MessageQueue {
  const buffer: string[] = [];
  const waiters: Array<(value: string) => void> = [];
  const onMessage = (data: Buffer): void => {
    const text = data.toString();
    const waiter = waiters.shift();
    if (waiter) waiter(text);
    else buffer.push(text);
  };
  ws.on('message', onMessage);
  const next = (timeoutMs = 1000): Promise<string> =>
    new Promise<string>((resolve, reject) => {
      const pending = buffer.shift();
      if (pending) {
        resolve(pending);
        return;
      }
      const timer = setTimeout(() => {
        const idx = waiters.indexOf(resolve);
        if (idx !== -1) waiters.splice(idx, 1);
        reject(new Error(`no message within ${timeoutMs}ms`));
      }, timeoutMs);
      waiters.push((msg) => {
        clearTimeout(timer);
        resolve(msg);
      });
    });
  const collect = async (count: number, timeoutMs = 1000): Promise<string[]> => {
    const out: string[] = [];
    for (let i = 0; i < count; i++) out.push(await next(timeoutMs));
    return out;
  };
  return { next, collect, stop: () => ws.off('message', onMessage) };
}

describe('IngestWebSocketHandler', () => {
  let ctx: Awaited<ReturnType<typeof openServerWithHandler>>;

  beforeEach(async () => {
    ctx = await openServerWithHandler({ now: () => 1_770_000_000_000 });
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('hello persists a session and acks with a hello message back', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    await waitOpen(ws);
    const queue = openMessageQueue(ws);
    ws.send(
      JSON.stringify({
        kind: 'hello',
        session: {
          id: 'session-a',
          startedAt: 100,
          platform: 'ios',
          appVersion: '1.2.3',
        },
      }),
    );
    const ack = JSON.parse(await queue.next()) as { kind: string };
    expect(ack.kind).toBe('hello');

    const session = ctx.store.getSession('session-a');
    expect(session?.platform).toBe('ios');
    expect(session?.appVersion).toBe('1.2.3');
    queue.stop();
    ws.close();
  });

  test('event kind persists the event, bumps session counters, broadcasts to subscribers', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await sdkQueue.next();

    const dash = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`);
    const dashQueue = openMessageQueue(dash);
    await waitOpen(dash);
    await dashQueue.next(); // hello

    sdk.send(
      JSON.stringify({
        kind: 'event',
        event: {
          id: 'e1',
          type: 'custom',
          severity: 'info',
          sessionId: 'session-a',
          timestamp: 1_770_000_000_000,
          payload: { value: 1 },
        },
      }),
    );

    const frame = JSON.parse(await dashQueue.next()) as { kind: string; event: { id: string } };
    expect(frame.kind).toBe('event');
    expect(frame.event.id).toBe('e1');
    expect(ctx.store.countEvents()).toBe(1);
    expect(ctx.store.getSession('session-a')?.eventCount).toBe(1);

    sdkQueue.stop();
    dashQueue.stop();
    sdk.close();
    dash.close();
  });

  test('batch persists every valid event and skips invalid ones', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const queue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await queue.next();

    sdk.send(
      JSON.stringify({
        kind: 'batch',
        events: [
          { id: 'e1', type: 'custom', severity: 'info', sessionId: 'session-a', timestamp: 1 },
          { type: 'custom' }, // missing sessionId → dropped
          {
            id: 'e2',
            type: 'network',
            severity: 'warning',
            sessionId: 'session-a',
            timestamp: 2,
          },
        ],
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ctx.store.countEvents()).toBe(2);
    expect(ctx.handler.stats.rejected).toBe(1);
    queue.stop();
    sdk.close();
  });

  test('crash without fingerprint gets a fallback hash and upserts a crash_group row', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await sdkQueue.next();

    const dash = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`);
    const dashQueue = openMessageQueue(dash);
    await waitOpen(dash);
    await dashQueue.next(); // hello

    sdk.send(
      JSON.stringify({
        kind: 'event',
        event: {
          id: 'crash-1',
          type: 'crash',
          severity: 'critical',
          sessionId: 'session-a',
          timestamp: 1_770_000_000_000,
          payload: { message: 'TypeError: boom', stack: 'at A\n    at B' },
        },
      }),
    );

    const messages = await dashQueue.collect(2);
    const kinds = messages.map((m) => (JSON.parse(m) as { kind: string }).kind).sort();
    expect(kinds).toEqual(['crash-group-update', 'event']);

    const groups = ctx.store.listCrashGroups();
    expect(groups).toHaveLength(1);
    expect(groups[0]?.eventCount).toBe(1);
    expect(groups[0]?.fingerprint).toMatch(/^[a-z0-9]+$/);
    sdkQueue.stop();
    dashQueue.stop();
    sdk.close();
    dash.close();
  });

  test('crash with an SDK-provided fingerprint is trusted verbatim', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const queue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await queue.next();

    sdk.send(
      JSON.stringify({
        kind: 'event',
        event: {
          id: 'crash-2',
          type: 'crash',
          severity: 'critical',
          sessionId: 'session-a',
          fingerprint: 'fixed-by-sdk',
          timestamp: 1,
          payload: { message: 'boom' },
        },
      }),
    );

    await new Promise((resolve) => setTimeout(resolve, 50));
    const [group] = ctx.store.listCrashGroups();
    expect(group?.fingerprint).toBe('fixed-by-sdk');
    queue.stop();
    sdk.close();
  });

  test('invalid JSON sends an error frame and does not crash the handler', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const queue = openMessageQueue(sdk);
    await waitOpen(sdk);

    sdk.send('not-json-at-all');
    const frame = JSON.parse(await queue.next()) as { kind: string; message: string };
    expect(frame.kind).toBe('error');
    expect(frame.message).toMatch(/invalid JSON/i);

    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    const ack = JSON.parse(await queue.next()) as { kind: string };
    expect(ack.kind).toBe('hello');

    expect(ctx.handler.stats.rejected).toBe(1);
    queue.stop();
    sdk.close();
  });

  test('session-end sets endedAt on the stored session', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const queue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await queue.next();

    sdk.send(JSON.stringify({ kind: 'session-end', sessionId: 'session-a', endedAt: 9_999 }));
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(ctx.store.getSession('session-a')?.endedAt).toBe(9_999);
    queue.stop();
    sdk.close();
  });

  test('rate limiter rejects events beyond maxEventsPerWindow within a window', async () => {
    await ctx.close();
    ctx = await openServerWithHandler({ maxEventsPerWindow: 2, rateWindowMs: 60_000 });

    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const queue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await queue.next();

    for (let i = 0; i < 5; i++) {
      sdk.send(
        JSON.stringify({
          kind: 'event',
          event: {
            id: `e${i}`,
            type: 'custom',
            severity: 'info',
            sessionId: 'session-a',
            timestamp: i,
          },
        }),
      );
    }

    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(ctx.store.countEvents()).toBe(2);
    expect(ctx.handler.stats.rejected).toBeGreaterThanOrEqual(3);
    queue.stop();
    sdk.close();
  });

  test('messages over maxMessageBytes are rejected with a size error', async () => {
    await ctx.close();
    ctx = await openServerWithHandler({ maxMessageBytes: 200 });

    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const queue = openMessageQueue(sdk);
    await waitOpen(sdk);

    const huge = JSON.stringify({
      kind: 'event',
      event: { type: 'custom', severity: 'info', sessionId: 's', payload: { x: 'x'.repeat(500) } },
    });
    sdk.send(huge);
    const frame = JSON.parse(await queue.next()) as { kind: string; message: string };
    expect(frame.kind).toBe('error');
    expect(frame.message).toMatch(/too large/);
    queue.stop();
    sdk.close();
  });
});

describe('subscribe API-key gate (Task 117.101)', () => {
  function awaitHttpReject(ws: WebSocket): Promise<number> {
    return new Promise((resolve, reject) => {
      ws.once('unexpected-response', (_req, res) => {
        resolve(res.statusCode ?? 0);
      });
      ws.once('open', () => reject(new Error('expected reject, got open')));
      ws.once('error', () => {
        /* ignore — unexpected-response already resolved */
      });
    });
  }

  test('no apiKey configured → subscribers connect freely (dev default)', async () => {
    const ctx = await openServerWithHandler();
    try {
      const sub = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`);
      await waitOpen(sub);
      sub.close();
    } finally {
      await ctx.close();
    }
  });

  test('apiKey configured + no token → upgrade rejected with 401', async () => {
    const ctx = await openServerWithHandler({ apiKey: 'secret-xyz' });
    try {
      const sub = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`);
      const status = await awaitHttpReject(sub);
      expect(status).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  test('apiKey configured + wrong key → upgrade rejected with 401', async () => {
    const ctx = await openServerWithHandler({ apiKey: 'secret-xyz' });
    try {
      const sub = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}?apiKey=wrong`);
      const status = await awaitHttpReject(sub);
      expect(status).toBe(401);
    } finally {
      await ctx.close();
    }
  });

  test('apiKey configured + correct query param → connects successfully', async () => {
    const ctx = await openServerWithHandler({ apiKey: 'secret-xyz' });
    try {
      const sub = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}?apiKey=secret-xyz`);
      await waitOpen(sub);
      sub.close();
    } finally {
      await ctx.close();
    }
  });

  test('apiKey configured + correct Bearer header → connects successfully', async () => {
    const ctx = await openServerWithHandler({ apiKey: 'secret-xyz' });
    try {
      const sub = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`, {
        headers: { authorization: 'Bearer secret-xyz' },
      });
      await waitOpen(sub);
      sub.close();
    } finally {
      await ctx.close();
    }
  });

  test('apiKey gate does NOT apply to /ws/ingest (SDKs have no dashboard key)', async () => {
    const ctx = await openServerWithHandler({ apiKey: 'secret-xyz' });
    try {
      const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
      await waitOpen(sdk);
      sdk.close();
    } finally {
      await ctx.close();
    }
  });
});

describe('ingest dedup (Task 117.49)', () => {
  let ctx: Awaited<ReturnType<typeof openServerWithHandler>>;

  beforeEach(async () => {
    ctx = await openServerWithHandler({ now: () => 1_770_000_000_000 });
  });

  afterEach(async () => {
    await ctx.close();
  });

  test('retry of the same event id collapses: one row, one broadcast, dedup counter bumped', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await sdkQueue.next();

    const dash = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`);
    const dashQueue = openMessageQueue(dash);
    await waitOpen(dash);
    await dashQueue.next(); // hello

    const eventFrame = {
      kind: 'event',
      event: {
        id: 'ev-stable-123',
        type: 'custom',
        severity: 'info',
        sessionId: 'session-a',
        timestamp: 1_770_000_000_100,
        payload: { step: 'click' },
      },
    };
    // Send the same event three times — simulating a reconnect-and-replay.
    sdk.send(JSON.stringify(eventFrame));
    sdk.send(JSON.stringify(eventFrame));
    sdk.send(JSON.stringify(eventFrame));

    // Only one broadcast should fan out to subscribers.
    const first = JSON.parse(await dashQueue.next()) as { kind: string };
    expect(first.kind).toBe('event');
    await expect(dashQueue.next(100)).rejects.toThrow(/no message/);

    expect(ctx.store.countEvents()).toBe(1);
    expect(ctx.store.getSession('session-a')?.eventCount).toBe(1);
    expect(ctx.handler.stats.ingested).toBe(1);
    expect(ctx.handler.stats.deduplicated).toBe(2);

    sdkQueue.stop();
    dashQueue.stop();
    sdk.close();
    dash.close();
  });

  test('events with auto-generated ids dedup by deterministic content hash', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await sdkQueue.next();

    // No explicit id — the server derives one from sessionId/type/timestamp/payload.
    // Sending the same content twice should collapse.
    const frame = {
      kind: 'event',
      event: {
        type: 'network',
        severity: 'info',
        sessionId: 'session-a',
        timestamp: 1_770_000_000_100,
        payload: { url: '/api/test', statusCode: 200 },
      },
    };
    sdk.send(JSON.stringify(frame));
    sdk.send(JSON.stringify(frame));
    // Drain any error frames that might arrive; none expected here.
    await new Promise((r) => setTimeout(r, 50));

    expect(ctx.store.countEvents()).toBe(1);
    expect(ctx.handler.stats.ingested).toBe(1);
    expect(ctx.handler.stats.deduplicated).toBe(1);

    sdkQueue.stop();
    sdk.close();
  });

  test('batch replay produces zero duplicates at the storage layer', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await sdkQueue.next();

    const batch = {
      kind: 'batch',
      events: Array.from({ length: 10 }).map((_, i) => ({
        id: `ev-batch-${i}`,
        type: 'custom',
        severity: 'info',
        sessionId: 'session-a',
        timestamp: 1_770_000_000_100 + i,
        payload: { i },
      })),
    };
    sdk.send(JSON.stringify(batch));
    sdk.send(JSON.stringify(batch)); // retry flood
    await new Promise((r) => setTimeout(r, 50));

    expect(ctx.store.countEvents()).toBe(10);
    expect(ctx.handler.stats.ingested).toBe(10);
    expect(ctx.handler.stats.deduplicated).toBe(10);

    sdkQueue.stop();
    sdk.close();
  });

  test('store.hasEventId returns true for inserted rows, false for unknown ids', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-a' } }));
    await sdkQueue.next();

    sdk.send(
      JSON.stringify({
        kind: 'event',
        event: {
          id: 'ev-probe-1',
          type: 'custom',
          severity: 'info',
          sessionId: 'session-a',
          timestamp: 1_770_000_000_200,
          payload: {},
        },
      }),
    );
    await new Promise((r) => setTimeout(r, 30));
    expect(ctx.store.hasEventId('ev-probe-1')).toBe(true);
    expect(ctx.store.hasEventId('ev-unseen')).toBe(false);

    sdkQueue.stop();
    sdk.close();
  });
});

describe('ingest queue integration (Task 117.5)', () => {
  let ctx: Awaited<ReturnType<typeof openServerWithHandler>>;

  beforeEach(async () => {
    ctx = await openServerWithHandler({ now: () => 1_770_000_000_000 });
  });
  afterEach(async () => {
    await ctx.close();
  });

  test('ingest enqueue returns immediately even with a 1 MB replay payload', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'replay-session' } }));
    await sdkQueue.next();

    const dash = new WebSocket(`ws://127.0.0.1:${ctx.port}${SUBSCRIBE_PATH}`);
    const dashQueue = openMessageQueue(dash);
    await waitOpen(dash);
    await dashQueue.next();

    const bigFrames = 'x'.repeat(1 << 20); // 1 MiB of string payload
    // Raise the handler's per-message cap for the one-off test.
    ctx.handler['maxMessageBytes'] = 4 * 1024 * 1024;

    const start = Date.now();
    sdk.send(
      JSON.stringify({
        kind: 'event',
        event: {
          id: 'replay-big',
          type: 'replay',
          severity: 'info',
          sessionId: 'replay-session',
          timestamp: 1_770_000_000_000,
          payload: { frames: bigFrames },
        },
      }),
    );
    const enqueueLatency = Date.now() - start;
    // The WS send completed quickly — ingest is non-blocking by contract.
    expect(enqueueLatency).toBeLessThan(500);

    // The broadcast still reaches subscribers after the queue worker runs.
    const broadcast = JSON.parse(await dashQueue.next(2_000)) as {
      kind: string;
      event: { id: string };
    };
    expect(broadcast.kind).toBe('event');
    expect(broadcast.event.id).toBe('replay-big');
    expect(ctx.store.hasEventId('replay-big')).toBe(true);

    sdkQueue.stop();
    dashQueue.stop();
    sdk.close();
    dash.close();
  });

  test('queueStats() exposes ingested counts once drained', async () => {
    const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'stats-session' } }));
    await sdkQueue.next();

    for (let i = 0; i < 5; i++) {
      sdk.send(
        JSON.stringify({
          kind: 'event',
          event: {
            id: `stat-${i}`,
            type: 'custom',
            severity: 'info',
            sessionId: 'stats-session',
            timestamp: 1_770_000_000_000 + i,
            payload: { i },
          },
        }),
      );
    }

    // Poll until the WS frames have landed and the queue has caught up
    // — `flush()` on its own only drains what's already enqueued, not
    // frames still in the socket buffer.
    const deadline = Date.now() + 2_000;
    while (ctx.handler.queueStats().enqueued < 5 && Date.now() < deadline) {
      await new Promise<void>((r) => setTimeout(r, 10));
    }
    await ctx.handler.flush();
    const stats = ctx.handler.queueStats();
    expect(stats.enqueued).toBeGreaterThanOrEqual(5);
    expect(stats.processed).toBeGreaterThanOrEqual(5);
    expect(stats.currentSize).toBe(0);
    expect(stats.inFlight).toBe(0);

    sdkQueue.stop();
    sdk.close();
  });

  test('backpressure is reported when the queue is saturated', async () => {
    // Rebuild the handler with a tiny queue so the test can overflow it
    // without sending thousands of events.
    await ctx.close();
    const { InMemoryQueue } = await import('../queue/in-memory-adapter.js');
    const store = new (await import('../storage/sqliteStore.js')).DashboardStore({
      dbPath: ':memory:',
      skipProductionPragmas: true,
    });
    // Park the worker so depth actually grows past maxSize.
    let release: (() => void) | null = null;
    const parker = new Promise<void>((r) => {
      release = r;
    });
    const queueImpl = new InMemoryQueue<EventRecord>({
      maxSize: 2,
    });
    // Override: don't let the handler start its own worker — we install
    // one that blocks indefinitely so the waiting list fills up.
    const origStart = queueImpl.start.bind(queueImpl);
    queueImpl.start = (): void => {
      origStart(async () => {
        await parker;
      });
    };
    const handler = new (await import('./wsHandler.js')).IngestWebSocketHandler({
      store,
      onError: () => {},
      queue: queueImpl,
    });
    const httpServer = (await import('node:http')).createServer();
    handler.attach(httpServer);
    await new Promise<void>((resolve) =>
      httpServer.listen(0, '127.0.0.1', () => resolve()),
    );
    const address = httpServer.address() as AddressInfo;
    const port = address.port;

    const sdk = new WebSocket(`ws://127.0.0.1:${port}${INGEST_PATH}`);
    const sdkQueue = openMessageQueue(sdk);
    await waitOpen(sdk);
    sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'bp-session' } }));
    await sdkQueue.next();

    for (let i = 0; i < 10; i++) {
      sdk.send(
        JSON.stringify({
          kind: 'event',
          event: {
            id: `bp-${i}`,
            type: 'custom',
            severity: 'info',
            sessionId: 'bp-session',
            timestamp: 1_770_000_000_000 + i,
            payload: { i },
          },
        }),
      );
    }
    // Give the WS frames time to flow through the handler before
    // asserting on the counter.
    await new Promise<void>((r) => setTimeout(r, 50));
    expect(handler.stats.backpressured).toBeGreaterThan(0);
    expect(handler.queueStats().backpressured).toBeGreaterThan(0);

    release?.();
    sdkQueue.stop();
    sdk.close();
    // Close manually — we built this handler outside `openServerWithHandler`.
    await handler.closeAsync(200);
    await new Promise<void>((r) => httpServer.close(() => r()));
    store.close();
  });
});

describe('per-tenant ingest rate limiting (Task 117.64)', () => {
  // A frozen clock so refill never kicks in during the test — every event
  // lands at the same instant, exercising the burst-capacity boundary
  // deterministically with no real timers.
  const FROZEN = 1_770_000_000_000;

  async function sendEvents(
    sdk: WebSocket,
    sessionId: string,
    count: number,
    idPrefix: string,
  ): Promise<void> {
    for (let i = 0; i < count; i++) {
      sdk.send(
        JSON.stringify({
          kind: 'event',
          event: {
            id: `${idPrefix}-${i}`,
            type: 'custom',
            severity: 'info',
            sessionId,
            timestamp: FROZEN + i,
            payload: { i },
          },
        }),
      );
    }
  }

  test('an over-limit tenant is rejected while another tenant is unaffected', async () => {
    // capacity=3, no refill within the frozen window → each tenant gets at
    // most 3 accepted events.
    const ctx = await openServerWithHandler({
      now: () => FROZEN,
      tenantRateLimit: { capacity: 3, refillPerSec: 1 },
    });
    try {
      // Tenant A and tenant B distinguished by their SDK key on the ingest URL.
      const sdkA = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=tenant-A`);
      const sdkB = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=tenant-B`);
      const queueA = openMessageQueue(sdkA);
      const queueB = openMessageQueue(sdkB);
      await Promise.all([waitOpen(sdkA), waitOpen(sdkB)]);

      sdkA.send(JSON.stringify({ kind: 'hello', session: { id: 'session-A' } }));
      sdkB.send(JSON.stringify({ kind: 'hello', session: { id: 'session-B' } }));
      await Promise.all([queueA.next(), queueB.next()]);

      // Tenant A floods 10 events — only 3 should be accepted, 7 rate-limited.
      await sendEvents(sdkA, 'session-A', 10, 'a');
      // Tenant B sends 3 — all within its own fresh bucket.
      await sendEvents(sdkB, 'session-B', 3, 'b');

      // Let the WS frames flow + the queue drain.
      await new Promise((r) => setTimeout(r, 80));
      await ctx.handler.flush();

      // Tenant B's events all landed; tenant A capped at the burst capacity.
      expect(ctx.store.getSession('session-B')?.eventCount).toBe(3);
      expect(ctx.store.getSession('session-A')?.eventCount).toBe(3);
      // 7 of A's events tripped the per-tenant limiter.
      expect(ctx.handler.stats.tenantRateLimited).toBe(7);
      expect(ctx.handler.stats.rejected).toBeGreaterThanOrEqual(7);

      // The first rate-limited frame back to A carries the structured reason.
      const frames: string[] = [];
      // Drain whatever A buffered — among them at least one rate-limit error.
      for (let i = 0; i < 7; i++) {
        try {
          frames.push(await queueA.next(200));
        } catch {
          break;
        }
      }
      const rateLimited = frames
        .map((f) => JSON.parse(f) as { kind: string; reason?: string; retryAfterMs?: number })
        .find((m) => m.kind === 'error' && m.reason === 'rate-limited');
      expect(rateLimited).toBeDefined();
      expect(rateLimited?.retryAfterMs).toBeGreaterThan(0);

      queueA.stop();
      queueB.stop();
      sdkA.close();
      sdkB.close();
    } finally {
      await ctx.close();
    }
  });

  test('tokens refill over time so a throttled tenant recovers (injected clock)', async () => {
    let clock = FROZEN;
    const ctx = await openServerWithHandler({
      now: () => clock,
      // capacity 2, 10/sec → one token every 100ms.
      tenantRateLimit: { capacity: 2, refillPerSec: 10 },
    });
    try {
      const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=tenant-C`);
      const queue = openMessageQueue(sdk);
      await waitOpen(sdk);
      sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-C' } }));
      await queue.next();

      // Drain the burst.
      await sendEvents(sdk, 'session-C', 5, 'c1');
      await new Promise((r) => setTimeout(r, 50));
      await ctx.handler.flush();
      expect(ctx.store.getSession('session-C')?.eventCount).toBe(2);
      expect(ctx.handler.stats.tenantRateLimited).toBe(3);

      // Advance the injected clock by 200ms → two tokens refilled.
      clock = FROZEN + 200;
      await sendEvents(sdk, 'session-C', 5, 'c2');
      await new Promise((r) => setTimeout(r, 50));
      await ctx.handler.flush();
      // Two more accepted after refill; the rest rejected again.
      expect(ctx.store.getSession('session-C')?.eventCount).toBe(4);
      expect(ctx.handler.stats.tenantRateLimited).toBe(6);

      queue.stop();
      sdk.close();
    } finally {
      await ctx.close();
    }
  });

  test('tenantRateLimit: false disables per-tenant limiting (connection guard still applies)', async () => {
    const ctx = await openServerWithHandler({
      now: () => FROZEN,
      tenantRateLimit: false,
      // Large per-connection window so nothing else throttles here.
      maxEventsPerWindow: 1_000,
      rateWindowMs: 60_000,
    });
    try {
      const sdk = new WebSocket(`ws://127.0.0.1:${ctx.port}${INGEST_PATH}?apiKey=tenant-D`);
      const queue = openMessageQueue(sdk);
      await waitOpen(sdk);
      sdk.send(JSON.stringify({ kind: 'hello', session: { id: 'session-D' } }));
      await queue.next();

      await sendEvents(sdk, 'session-D', 50, 'd');
      await new Promise((r) => setTimeout(r, 80));
      await ctx.handler.flush();

      expect(ctx.store.getSession('session-D')?.eventCount).toBe(50);
      expect(ctx.handler.stats.tenantRateLimited).toBe(0);

      queue.stop();
      sdk.close();
    } finally {
      await ctx.close();
    }
  });
});
