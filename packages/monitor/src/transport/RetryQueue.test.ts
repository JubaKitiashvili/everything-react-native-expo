import { RetryQueue, MemoryRetryQueueStorage } from './RetryQueue';

function makeQueue(opts?: { maxSize?: number; maxAttempts?: number; baseDelayMs?: number; maxDelayMs?: number }) {
  const storage = new MemoryRetryQueueStorage();
  const queue = new RetryQueue({
    storage,
    maxSize: opts?.maxSize ?? 100,
    maxAttempts: opts?.maxAttempts ?? 10,
    baseDelayMs: opts?.baseDelayMs ?? 1000,
    maxDelayMs: opts?.maxDelayMs ?? 60_000,
  });
  return { queue, storage };
}

describe('RetryQueue', () => {
  test('enqueue and getReady returns entries past their retry time', async () => {
    const { queue } = makeQueue({ baseDelayMs: 100 });
    await queue.enqueue('batch-1', '{"events":[]}');
    const now = Date.now() + 200;
    const ready = await queue.getReady(now);
    expect(ready).toHaveLength(1);
    expect(ready[0]!.id).toBe('batch-1');
  });

  test('getReady does not return entries before their retry time', async () => {
    const { queue } = makeQueue({ baseDelayMs: 10_000 });
    await queue.enqueue('batch-1', 'data');
    const ready = await queue.getReady(Date.now());
    expect(ready).toHaveLength(0);
  });

  test('acknowledge removes entry', async () => {
    const { queue } = makeQueue({ baseDelayMs: 0 });
    await queue.enqueue('batch-1', 'data');
    await queue.acknowledge('batch-1');
    expect(await queue.size()).toBe(0);
  });

  test('fail increments attempt and computes exponential backoff', async () => {
    const { queue, storage } = makeQueue({ baseDelayMs: 1000, maxDelayMs: 60_000 });
    await queue.enqueue('batch-1', 'data');
    const shouldRetry = await queue.fail('batch-1');
    expect(shouldRetry).toBe(true);

    const entries = await storage.getAll();
    expect(entries[0]!.attempt).toBe(1);
    // backoff: 1000 * 2^1 = 2000ms
    expect(entries[0]!.nextRetryAt).toBeGreaterThan(Date.now());
  });

  test('fail returns false (dead letter) after max attempts', async () => {
    const { queue } = makeQueue({ maxAttempts: 3, baseDelayMs: 0 });
    await queue.enqueue('batch-1', 'data');
    await queue.fail('batch-1'); // attempt 1
    await queue.fail('batch-1'); // attempt 2
    const shouldRetry = await queue.fail('batch-1'); // attempt 3 = dead letter
    expect(shouldRetry).toBe(false);
    expect(await queue.size()).toBe(0); // removed
  });

  test('drops oldest when maxSize exceeded', async () => {
    const { queue } = makeQueue({ maxSize: 2, baseDelayMs: 0 });
    await queue.enqueue('batch-1', 'a');
    await queue.enqueue('batch-2', 'b');
    await queue.enqueue('batch-3', 'c'); // should drop batch-1
    expect(await queue.size()).toBe(2);
    const entries = await queue.getReady(Date.now() + 10_000);
    expect(entries.map((e) => e.id)).toEqual(['batch-2', 'batch-3']);
  });

  test('clear removes all entries', async () => {
    const { queue } = makeQueue({ baseDelayMs: 0 });
    await queue.enqueue('a', '1');
    await queue.enqueue('b', '2');
    await queue.clear();
    expect(await queue.size()).toBe(0);
  });

  test('backoff is capped at maxDelayMs', async () => {
    const { queue, storage } = makeQueue({ baseDelayMs: 1000, maxDelayMs: 5000, maxAttempts: 20 });
    await queue.enqueue('batch-1', 'data');
    // Fail multiple times to ramp up backoff
    for (let i = 0; i < 5; i++) {
      await queue.fail('batch-1');
    }
    const entries = await storage.getAll();
    // After 5 failures: 1000 * 2^5 = 32000, but capped at 5000
    const delay = entries[0]!.nextRetryAt - Date.now();
    expect(delay).toBeLessThanOrEqual(5100); // allow small timing drift
  });

  test('entries returned oldest first', async () => {
    const { queue } = makeQueue({ baseDelayMs: 0 });
    await queue.enqueue('c', '3');
    await queue.enqueue('a', '1');
    await queue.enqueue('b', '2');
    const ready = await queue.getReady(Date.now() + 10_000);
    // Order by createdAt
    expect(ready[0]!.id).toBe('c');
  });
});
