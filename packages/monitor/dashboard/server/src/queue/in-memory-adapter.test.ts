// Task 117.5 — InMemoryQueue tests.

import { describe, expect, test, vi } from 'vitest';
import { InMemoryQueue } from './in-memory-adapter.js';

function flush(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe('InMemoryQueue — basic operation', () => {
  test('processes items in FIFO order at concurrency=1', async () => {
    const queue = new InMemoryQueue<number>({ concurrency: 1 });
    const order: number[] = [];
    queue.start(async (n) => {
      await flush();
      order.push(n);
    });
    for (let i = 0; i < 10; i++) queue.enqueue(i);
    await queue.stop();
    expect(order).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  test('enqueue returns a positive ack with depth', () => {
    const queue = new InMemoryQueue<number>();
    // start with a worker that never consumes — depth grows.
    queue.start(() => new Promise(() => {}));
    const a = queue.enqueue(1);
    const b = queue.enqueue(2);
    expect(a).toEqual({ queued: true, depth: 0 }); // 1 is immediately picked up
    expect(b).toEqual({ queued: true, depth: 1 });
  });

  test('stats reflect lifecycle counters', async () => {
    const queue = new InMemoryQueue<number>({ concurrency: 1 });
    queue.start(async (n) => {
      if (n === 2) throw new Error('bad');
    });
    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    await queue.stop();
    const stats = queue.stats();
    expect(stats.enqueued).toBe(3);
    expect(stats.processed).toBe(2);
    expect(stats.failed).toBe(1);
    expect(stats.retried).toBeGreaterThanOrEqual(2);
    expect(stats.currentSize).toBe(0);
    expect(stats.inFlight).toBe(0);
  });
});

describe('InMemoryQueue — backpressure', () => {
  test('rejects enqueues above maxSize with reason=backpressure', () => {
    const queue = new InMemoryQueue<number>({ maxSize: 2 });
    // Don't start a worker — items stay in the wait list.
    const a = queue.enqueue(1);
    const b = queue.enqueue(2);
    const c = queue.enqueue(3);
    expect(a.queued).toBe(true);
    expect(b.queued).toBe(true);
    expect(c).toEqual({ queued: false, reason: 'backpressure', depth: 2 });
    expect(queue.stats().backpressured).toBe(1);
  });

  test('emits a `backpressure` event when an enqueue is rejected', () => {
    const queue = new InMemoryQueue<number>({ maxSize: 1 });
    const events: Array<{ depth: number; maxSize: number }> = [];
    queue.on('backpressure', (info) => events.push(info));
    queue.enqueue(1);
    queue.enqueue(2);
    expect(events).toEqual([{ depth: 1, maxSize: 1 }]);
  });
});

describe('InMemoryQueue — retry', () => {
  test('retries up to maxAttempts with exponential backoff then fails', async () => {
    const queue = new InMemoryQueue<number>({
      maxAttempts: 3,
      backoffBaseMs: 1,
      backoffMaxMs: 10,
    });
    const retries: number[] = [];
    queue.on('retry', (info) => retries.push(info.attempt));
    const failed: Array<{ attempts: number }> = [];
    queue.on('failed', (info) => failed.push({ attempts: info.attempts }));
    queue.start(() => {
      throw new Error('always-fails');
    });
    queue.enqueue(1);
    await queue.stop();
    expect(retries).toEqual([1, 2]); // 2 retries before the 3rd + final attempt
    expect(failed).toEqual([{ attempts: 3 }]);
    expect(queue.stats().failed).toBe(1);
    expect(queue.stats().retried).toBe(2);
  });

  test('recovers when transient error clears before maxAttempts', async () => {
    let tries = 0;
    const queue = new InMemoryQueue<number>({
      maxAttempts: 5,
      backoffBaseMs: 1,
      backoffMaxMs: 2,
    });
    queue.start(() => {
      tries += 1;
      if (tries < 3) throw new Error('transient');
    });
    queue.enqueue(42);
    await queue.stop();
    expect(tries).toBe(3);
    expect(queue.stats().processed).toBe(1);
    expect(queue.stats().failed).toBe(0);
    expect(queue.stats().retried).toBe(2);
  });

  test('retries=0 via maxAttempts=1 drops item on first failure', async () => {
    const queue = new InMemoryQueue<number>({ maxAttempts: 1 });
    queue.start(() => {
      throw new Error('bad');
    });
    queue.enqueue(1);
    await queue.stop();
    expect(queue.stats().retried).toBe(0);
    expect(queue.stats().failed).toBe(1);
  });
});

describe('InMemoryQueue — stop() semantics', () => {
  test('drain resolves after pending items process', async () => {
    const processed: number[] = [];
    const queue = new InMemoryQueue<number>();
    queue.start(async (n) => {
      await flush();
      processed.push(n);
    });
    for (let i = 0; i < 5; i++) queue.enqueue(i);
    await queue.stop();
    expect(processed).toEqual([0, 1, 2, 3, 4]);
  });

  test('after stop(), enqueue returns closed', async () => {
    const queue = new InMemoryQueue<number>();
    queue.start(() => {});
    await queue.stop();
    expect(queue.enqueue(1)).toEqual({ queued: false, reason: 'closed', depth: 0 });
  });

  test('stop(timeout) returns even when drain stalls', async () => {
    const queue = new InMemoryQueue<number>();
    queue.start(() => new Promise(() => {})); // never resolves
    queue.enqueue(1);
    const start = Date.now();
    await queue.stop(50);
    expect(Date.now() - start).toBeLessThan(500);
  });
});

describe('InMemoryQueue — drained event', () => {
  test('fires once per empty transition', async () => {
    const queue = new InMemoryQueue<number>();
    const drained = vi.fn();
    queue.on('drained', drained);
    queue.start(() => {});
    queue.enqueue(1);
    queue.enqueue(2);
    await flush();
    await flush();
    expect(drained).toHaveBeenCalledTimes(1);
    queue.enqueue(3);
    await flush();
    await flush();
    expect(drained).toHaveBeenCalledTimes(2);
    await queue.stop();
  });
});

describe('InMemoryQueue — unsubscribe', () => {
  test('on() returns an unsubscribe fn', () => {
    const queue = new InMemoryQueue<number>({ maxSize: 1 });
    const listener = vi.fn();
    const off = queue.on('backpressure', listener);
    queue.enqueue(1);
    queue.enqueue(2);
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    queue.enqueue(3);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('InMemoryQueue — high water mark', () => {
  test('tracks max observed depth', async () => {
    const queue = new InMemoryQueue<number>();
    // Worker that parks briefly so depth grows.
    queue.start(() => new Promise((r) => setTimeout(r, 5)));
    for (let i = 0; i < 20; i++) queue.enqueue(i);
    // At this point 1 inflight + 19 waiting = high water 19.
    expect(queue.stats().highWaterMark).toBeGreaterThanOrEqual(19);
    await queue.stop(1000);
  });
});

describe('InMemoryQueue — listener errors are swallowed', () => {
  test('throwing backpressure listener does not propagate into enqueue', () => {
    const queue = new InMemoryQueue<number>({ maxSize: 0 });
    queue.on('backpressure', () => {
      throw new Error('listener-bug');
    });
    // Should not throw despite bad listener.
    expect(() => queue.enqueue(1)).not.toThrow();
  });
});

describe('InMemoryQueue — large payloads', () => {
  test('a 1 MB string payload queues + processes without blocking', async () => {
    const big = 'x'.repeat(1 << 20); // 1 MiB
    const queue = new InMemoryQueue<string>();
    let processedLength = 0;
    queue.start(async (s) => {
      processedLength = s.length;
    });
    const start = Date.now();
    queue.enqueue(big);
    // Enqueue call itself must not have stalled.
    expect(Date.now() - start).toBeLessThan(100);
    await queue.stop();
    expect(processedLength).toBe(big.length);
  });
});
