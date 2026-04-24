// Task 117.5 — BetterQueueAdapter tests.
//
// `better-queue` is an optional peer. Rather than install it in the
// dashboard-server devDependencies, we inject a fake constructor that
// mimics the API surface the adapter depends on (`push`, `destroy`).

import { describe, expect, test } from 'vitest';
import {
  BetterQueueAdapter,
  createBetterQueueAdapter,
} from './better-queue-adapter.js';

interface Task<T> {
  item: T;
  cb: (err: Error | null) => void;
}

function makeFakeBetterQueue<T = unknown>() {
  const ctorCalls: Array<{ options: Record<string, unknown> }> = [];
  const pending: Task<T>[] = [];
  let worker:
    | ((t: unknown, cb: (err: Error | null | undefined) => void) => void)
    | null = null;
  const FakeBQ = class {
    length = 0;
    constructor(
      w: (t: unknown, cb: (err: Error | null | undefined) => void) => void,
      options: Record<string, unknown>,
    ) {
      worker = w;
      ctorCalls.push({ options });
    }
    push(item: unknown): { on: (event: string, fn: (...args: unknown[]) => void) => void } {
      const task: Task<T> = {
        item: item as T,
        cb: () => {
          /* no-op */
        },
      };
      pending.push(task);
      // Defer worker call to a microtask so `enqueue()` returns first.
      queueMicrotask(() => {
        worker?.(task.item, (err) => task.cb(err ?? null));
      });
      return { on: () => {} };
    }
    destroy(cb?: () => void): void {
      cb?.();
    }
  };
  return { FakeBQ, ctorCalls, pending };
}

describe('BetterQueueAdapter', () => {
  test('createBetterQueueAdapter throws with install hint when peer missing', async () => {
    // Force loadBetterQueue to fail by passing an explicit null via
    // injected ctor. We reach the throw by not passing betterQueueCtor
    // and simulating the missing package with a stubbed importer —
    // since we can't easily patch dynamic import, assert the error
    // shape via the factory directly with an explicit null ctor.
    await expect(
      createBetterQueueAdapter({ betterQueueCtor: null as unknown as undefined }),
    ).rejects.toThrow(/better-queue/);
  });

  test('enqueue + worker round-trip happens via the fake ctor', async () => {
    const { FakeBQ } = makeFakeBetterQueue<number>();
    const adapter = new BetterQueueAdapter<number>(FakeBQ as never);
    const processed: number[] = [];
    adapter.start(async (n) => {
      processed.push(n);
    });
    adapter.enqueue(1);
    adapter.enqueue(2);
    adapter.enqueue(3);
    // Let microtasks drain.
    await new Promise<void>((r) => setImmediate(r));
    expect(processed).toEqual([1, 2, 3]);
    expect(adapter.stats().processed).toBe(3);
    expect(adapter.stats().enqueued).toBe(3);
  });

  test('backpressure rejects past maxSize', () => {
    const { FakeBQ } = makeFakeBetterQueue<number>();
    const adapter = new BetterQueueAdapter<number>(FakeBQ as never, { maxSize: 2 });
    adapter.start(() => new Promise(() => {})); // worker never returns
    // First two are accepted into the fake BQ synchronously —
    // currentSize bumps to 2.
    expect(adapter.enqueue(1).queued).toBe(true);
    expect(adapter.enqueue(2).queued).toBe(true);
    const third = adapter.enqueue(3);
    expect(third.queued).toBe(false);
    expect(third.reason).toBe('backpressure');
  });

  test('prebuffers when enqueue is called before start()', async () => {
    const { FakeBQ } = makeFakeBetterQueue<number>();
    const adapter = new BetterQueueAdapter<number>(FakeBQ as never);
    adapter.enqueue(10);
    adapter.enqueue(20);
    const processed: number[] = [];
    adapter.start(async (n) => {
      processed.push(n);
    });
    await new Promise<void>((r) => setImmediate(r));
    await new Promise<void>((r) => setImmediate(r));
    expect(processed.sort()).toEqual([10, 20]);
  });

  test('forwards concurrency + retries into better-queue options', () => {
    const { FakeBQ, ctorCalls } = makeFakeBetterQueue<number>();
    const adapter = new BetterQueueAdapter<number>(FakeBQ as never, {
      concurrency: 4,
      maxAttempts: 5,
      retryDelayMs: 200,
    });
    adapter.start(() => {});
    expect(ctorCalls).toHaveLength(1);
    expect(ctorCalls[0]?.options).toMatchObject({
      concurrent: 4,
      maxRetries: 4,
      retryDelay: 200,
    });
  });

  test('stop() resolves via destroy callback', async () => {
    const { FakeBQ } = makeFakeBetterQueue<number>();
    const adapter = new BetterQueueAdapter<number>(FakeBQ as never);
    adapter.start(() => {});
    const start = Date.now();
    await adapter.stop();
    expect(Date.now() - start).toBeLessThan(500);
  });
});
