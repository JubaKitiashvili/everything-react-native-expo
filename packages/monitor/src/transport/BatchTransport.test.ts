import { BatchTransport } from './BatchTransport';
import { RetryQueue, MemoryRetryQueueStorage } from './RetryQueue';
import type { MonitorEvent } from '../types';

function makeEvent(overrides: Partial<MonitorEvent> = {}): MonitorEvent {
  return {
    type: 'custom',
    timestamp: Date.now(),
    wallTime: Date.now(),
    sessionId: 'sess-1',
    data: { name: 'test' },
    ...overrides,
  };
}

function makeTransport(opts?: {
  fetchImpl?: typeof fetch;
  batchIntervalMs?: number;
  maxBatchSize?: number;
  isConsented?: (e: MonitorEvent) => boolean;
}) {
  const storage = new MemoryRetryQueueStorage();
  const retryQueue = new RetryQueue({ storage, baseDelayMs: 0 });
  const fetchCalls: Array<{ url: string; body: string }> = [];
  const fetchImpl = (opts?.fetchImpl ??
    (async (url: string, init: RequestInit) => {
      fetchCalls.push({ url: url as string, body: init?.body as string });
      return { ok: true, status: 202 } as Response;
    })) as typeof fetch;

  const transport = new BatchTransport({
    endpoint: 'https://api.erne.dev/v1/events',
    apiKey: 'test-key',
    retryQueue,
    fetchImpl,
    batchIntervalMs: opts?.batchIntervalMs ?? 60_000, // long to avoid auto-flush
    maxBatchSize: opts?.maxBatchSize ?? 50,
    isConsented: opts?.isConsented,
  });

  return { transport, retryQueue, fetchCalls, storage };
}

describe('BatchTransport', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  test('batches events and flushes on manual flush', async () => {
    const { transport, fetchCalls } = makeTransport();
    transport.start();
    transport.send(makeEvent());
    transport.send(makeEvent());
    await transport.flush();
    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0]!.body);
    expect(body.events).toHaveLength(2);
  });

  test('crash events trigger immediate flush', async () => {
    const { transport, fetchCalls } = makeTransport();
    transport.start();
    transport.send(makeEvent({ type: 'crash' }));
    // Allow microtask to resolve
    await Promise.resolve();
    expect(fetchCalls).toHaveLength(1);
  });

  test('flushes when maxBatchSize reached', async () => {
    const { transport, fetchCalls } = makeTransport({ maxBatchSize: 3 });
    transport.start();
    transport.send(makeEvent());
    transport.send(makeEvent());
    transport.send(makeEvent()); // triggers flush
    await Promise.resolve();
    expect(fetchCalls).toHaveLength(1);
  });

  test('enqueues to retry on network error', async () => {
    const failFetch = async () => {
      throw new Error('Network error');
    };
    const { transport, retryQueue } = makeTransport({
      fetchImpl: failFetch as unknown as typeof fetch,
    });
    transport.start();
    transport.send(makeEvent());
    await transport.flush();
    expect(await retryQueue.size()).toBe(1);
    expect(transport.getHealth().failed).toBe(1);
  });

  test('enqueues to retry on 500 server error', async () => {
    const serverError = async () =>
      ({ ok: false, status: 500 }) as Response;
    const { transport, retryQueue } = makeTransport({
      fetchImpl: serverError as unknown as typeof fetch,
    });
    transport.start();
    transport.send(makeEvent());
    await transport.flush();
    expect(await retryQueue.size()).toBe(1);
  });

  test('does not retry on 400 client error', async () => {
    const clientError = async () =>
      ({ ok: false, status: 400 }) as Response;
    const { transport, retryQueue } = makeTransport({
      fetchImpl: clientError as unknown as typeof fetch,
    });
    transport.start();
    transport.send(makeEvent());
    await transport.flush();
    expect(await retryQueue.size()).toBe(0);
  });

  test('retries on 429 rate limit', async () => {
    const rateLimited = async () =>
      ({ ok: false, status: 429 }) as Response;
    const { transport, retryQueue } = makeTransport({
      fetchImpl: rateLimited as unknown as typeof fetch,
    });
    transport.start();
    transport.send(makeEvent());
    await transport.flush();
    expect(await retryQueue.size()).toBe(1);
  });

  test('flushRetryQueue sends ready entries', async () => {
    const calls: string[] = [];
    let callCount = 0;
    const fetchImpl = async (_url: string, init: RequestInit) => {
      callCount++;
      calls.push(init?.body as string);
      return { ok: true, status: 202 } as Response;
    };
    const storage = new MemoryRetryQueueStorage();
    const retryQueue = new RetryQueue({ storage, baseDelayMs: 0 });
    await retryQueue.enqueue('r1', '{"retry":1}');
    await retryQueue.enqueue('r2', '{"retry":2}');

    const transport = new BatchTransport({
      endpoint: 'https://api.erne.dev/v1/events',
      apiKey: 'key',
      retryQueue,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    transport.start();
    await transport.flushRetryQueue();
    expect(callCount).toBe(2);
    expect(await retryQueue.size()).toBe(0);
  });

  test('respects consent — drops non-consented events', async () => {
    const { transport, fetchCalls } = makeTransport({
      isConsented: (e) => e.type !== 'render',
    });
    transport.start();
    transport.send(makeEvent({ type: 'render' })); // blocked
    transport.send(makeEvent({ type: 'crash' })); // allowed
    await transport.flush();
    const body = JSON.parse(fetchCalls[0]!.body);
    expect(body.events).toHaveLength(1);
  });

  test('does not send when stopped', async () => {
    const { transport, fetchCalls } = makeTransport();
    transport.start();
    transport.stop();
    transport.send(makeEvent());
    await transport.flush();
    expect(fetchCalls).toHaveLength(0);
  });

  test('getHealth reports correct state', async () => {
    const { transport } = makeTransport();
    transport.start();
    transport.send(makeEvent());
    const health = transport.getHealth();
    expect(health.pending).toBe(1);
    expect(health.failed).toBe(0);
    expect(health.lastFlushTime).toBeNull();
    await transport.flush();
    const after = transport.getHealth();
    expect(after.pending).toBe(0);
    expect(after.lastFlushTime).not.toBeNull();
  });

  test('includes API key header in requests', async () => {
    let capturedHeaders: Record<string, string> = {};
    const fetchImpl = async (_url: string, init: RequestInit) => {
      capturedHeaders = Object.fromEntries(
        Object.entries(init?.headers ?? {}),
      );
      return { ok: true, status: 202 } as Response;
    };
    const storage = new MemoryRetryQueueStorage();
    const retryQueue = new RetryQueue({ storage });
    const transport = new BatchTransport({
      endpoint: 'https://api.erne.dev/v1/events',
      apiKey: 'my-secret-key',
      retryQueue,
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    transport.start();
    transport.send(makeEvent());
    await transport.flush();
    expect(capturedHeaders['X-ERNE-Key']).toBe('my-secret-key');
  });
});
