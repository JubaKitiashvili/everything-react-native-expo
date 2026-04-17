import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { WebSocket } from 'ws';
import { DashboardStore } from '../storage/sqliteStore.js';
import { INGEST_PATH, IngestWebSocketHandler, SUBSCRIBE_PATH } from './wsHandler.js';

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
