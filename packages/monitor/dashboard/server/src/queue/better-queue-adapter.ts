// Task 117.5 — `better-queue` adapter.
//
// Thin shim that maps our IQueue contract onto the npm `better-queue`
// package. `better-queue` is listed under `optionalDependencies` so the
// default install footprint stays tiny — operators that actually need
// a persistent / SQLite-backed queue install it explicitly.
//
// The factory pattern (async `createBetterQueueAdapter`) exists because
// `better-queue` is resolved at runtime via `import()`; failing fast with
// a readable error is much nicer than a module-load crash at `import`.

import type {
  EnqueueOptions,
  EnqueueResult,
  IQueue,
  QueueEventMap,
  QueueEventName,
  QueueStats,
  QueueWorker,
} from './IQueue.js';

export interface BetterQueueAdapterOptions {
  /**
   * Max items allowed in the queue before `enqueue()` signals
   * backpressure. Default 10_000. Set to `Infinity` to disable.
   */
  maxSize?: number;
  /** Worker concurrency. Forwarded to better-queue. Default 1. */
  concurrency?: number;
  /**
   * Retry attempts (first attempt + retries). Forwarded to better-queue
   * via `maxRetries = maxAttempts - 1`. Default 3.
   */
  maxAttempts?: number;
  /** Retry backoff in ms forwarded as `retryDelay`. Default 50. */
  retryDelayMs?: number;
  /** Optional custom instantiator — for tests to inject a fake. */
  betterQueueCtor?: unknown;
  /**
   * Extra config merged into the `better-queue` constructor's options
   * bag. Useful for `store: 'sql'` et al.
   */
  extra?: Record<string, unknown>;
}

type ListenerBag<T> = {
  [E in QueueEventName<T>]?: Array<QueueEventMap<T>[E]>;
};

interface BetterQueueLike {
  push: (item: unknown) => { on: (event: string, fn: (...args: unknown[]) => void) => void };
  length?: number;
  getStats?: () => { total?: number; success?: number; failed?: number };
  destroy?: (cb?: () => void) => void;
  pause?: () => void;
  resume?: () => void;
}

interface BetterQueueCtor {
  new (
    worker: (
      task: unknown,
      cb: (err: Error | null | undefined, result?: unknown) => void,
    ) => void,
    options: Record<string, unknown>,
  ): BetterQueueLike;
}

/**
 * Resolve the `better-queue` module lazily. Returns null when the
 * package isn't installed — the factory function throws a helpful
 * error with install instructions in that case.
 */
async function loadBetterQueue(): Promise<BetterQueueCtor | null> {
  try {
    // Use Function to hide the specifier from the static build graph so
    // `tsc` / bundlers don't try to resolve an optional dep at build
    // time. Runtime dynamic import is what we want.
    const importer = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
    const mod = (await importer('better-queue')) as { default?: BetterQueueCtor };
    return mod.default ?? (mod as unknown as BetterQueueCtor);
  } catch {
    return null;
  }
}

/**
 * Build a BetterQueueAdapter. Async because `better-queue` loads via
 * dynamic import. Throws with install hint when the peer is missing.
 */
export async function createBetterQueueAdapter<T>(
  options: BetterQueueAdapterOptions = {},
): Promise<BetterQueueAdapter<T>> {
  const ctor = (options.betterQueueCtor as BetterQueueCtor | undefined) ?? (await loadBetterQueue());
  if (!ctor) {
    throw new Error(
      '[@erne/monitor-dashboard-server] The `better-queue` package is not installed. ' +
        'Either install it (`npm install better-queue`) or switch to the default ' +
        'in-memory queue via `options.queue.type: "in-memory"`.',
    );
  }
  return new BetterQueueAdapter<T>(ctor, options);
}

export class BetterQueueAdapter<T> implements IQueue<T> {
  private readonly ctor: BetterQueueCtor;
  private readonly maxSize: number;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly retryDelayMs: number;
  private readonly extra: Record<string, unknown>;

  private instance: BetterQueueLike | null = null;
  private worker: QueueWorker<T> | null = null;
  private stopping = false;
  private running = false;
  private currentSize = 0;
  private inFlightCount = 0;
  private listeners: ListenerBag<T> = {};

  private stat_enqueued = 0;
  private stat_processed = 0;
  private stat_failed = 0;
  private stat_retried = 0;
  private stat_backpressured = 0;
  private stat_highWaterMark = 0;

  constructor(ctor: BetterQueueCtor, options: BetterQueueAdapterOptions = {}) {
    this.ctor = ctor;
    this.maxSize = options.maxSize ?? 10_000;
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? 3);
    this.retryDelayMs = options.retryDelayMs ?? 50;
    this.extra = options.extra ?? {};
  }

  enqueue(item: T, _options: EnqueueOptions = {}): EnqueueResult {
    void _options;
    if (this.stopping) {
      return { queued: false, reason: 'closed', depth: this.currentSize };
    }
    if (this.currentSize >= this.maxSize) {
      this.stat_backpressured += 1;
      this.emit('backpressure', { depth: this.currentSize, maxSize: this.maxSize });
      return { queued: false, reason: 'backpressure', depth: this.currentSize };
    }
    if (!this.instance) {
      // `start()` hasn't been called — we accept into a pre-queue
      // stored directly in the better-queue instance after start.
      // Defer the push until then.
      this.prebuffered.push(item);
      this.currentSize += 1;
      this.stat_enqueued += 1;
      this.track();
      return { queued: true, depth: this.currentSize };
    }
    this.instance.push(item);
    this.currentSize += 1;
    this.stat_enqueued += 1;
    this.track();
    return { queued: true, depth: this.currentSize };
  }

  private readonly prebuffered: T[] = [];

  start(worker: QueueWorker<T>): void {
    this.worker = worker;
    this.running = true;
    if (this.instance) return;
    this.instance = new this.ctor(
      (task: unknown, cb: (err: Error | null | undefined) => void) => {
        this.inFlightCount += 1;
        let attempt = 0;
        const run = (): void => {
          attempt += 1;
          try {
            const ret = this.worker?.(task as T);
            if (ret && typeof (ret as Promise<void>).then === 'function') {
              (ret as Promise<void>).then(
                () => this.finishOk(cb),
                (err) => this.handleError(err, task as T, attempt, run, cb),
              );
            } else {
              this.finishOk(cb);
            }
          } catch (err) {
            this.handleError(err, task as T, attempt, run, cb);
          }
        };
        run();
      },
      {
        concurrent: this.concurrency,
        maxRetries: this.maxAttempts - 1,
        retryDelay: this.retryDelayMs,
        ...this.extra,
      },
    );
    // Flush anything enqueued before start().
    while (this.prebuffered.length > 0) {
      const item = this.prebuffered.shift();
      this.instance.push(item);
    }
  }

  async stop(drainTimeoutMs?: number): Promise<void> {
    this.stopping = true;
    this.running = false;
    if (!this.instance) return;
    const inst = this.instance;
    return await new Promise<void>((resolve) => {
      const timer =
        drainTimeoutMs !== undefined && Number.isFinite(drainTimeoutMs)
          ? setTimeout(() => resolve(), drainTimeoutMs)
          : null;
      if (typeof inst.destroy === 'function') {
        inst.destroy(() => {
          if (timer) clearTimeout(timer);
          resolve();
        });
      } else {
        if (timer) clearTimeout(timer);
        resolve();
      }
    });
  }

  size(): number {
    return this.currentSize;
  }

  stats(): QueueStats {
    return {
      enqueued: this.stat_enqueued,
      processed: this.stat_processed,
      failed: this.stat_failed,
      retried: this.stat_retried,
      backpressured: this.stat_backpressured,
      currentSize: this.currentSize,
      inFlight: this.inFlightCount,
      highWaterMark: this.stat_highWaterMark,
    };
  }

  isRunning(): boolean {
    return this.running && !this.stopping;
  }

  on<E extends QueueEventName<T>>(event: E, listener: QueueEventMap<T>[E]): () => void {
    const bag = (this.listeners[event] ??= []) as Array<QueueEventMap<T>[E]>;
    bag.push(listener);
    return () => {
      const idx = bag.indexOf(listener);
      if (idx >= 0) bag.splice(idx, 1);
    };
  }

  private emit<E extends QueueEventName<T>>(
    event: E,
    ...args: Parameters<QueueEventMap<T>[E]>
  ): void {
    const bag = this.listeners[event];
    if (!bag) return;
    for (const fn of bag.slice()) {
      try {
        (fn as (...a: Parameters<QueueEventMap<T>[E]>) => void)(...args);
      } catch {
        // swallow
      }
    }
  }

  private track(): void {
    if (this.currentSize > this.stat_highWaterMark) {
      this.stat_highWaterMark = this.currentSize;
    }
  }

  private finishOk(cb: (err?: Error | null) => void): void {
    this.stat_processed += 1;
    this.currentSize = Math.max(0, this.currentSize - 1);
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    if (this.currentSize === 0 && this.inFlightCount === 0) {
      this.emit('drained');
    }
    cb(null);
  }

  private handleError(
    err: unknown,
    item: T,
    attempt: number,
    retryFn: () => void,
    cb: (err: Error | null | undefined) => void,
  ): void {
    const error = err instanceof Error ? err : new Error(String(err));
    if (attempt < this.maxAttempts && !this.stopping) {
      this.stat_retried += 1;
      const nextDelayMs = Math.min(
        5_000,
        this.retryDelayMs * 2 ** (attempt - 1),
      );
      this.emit('retry', { item, error, attempt, nextDelayMs });
      setTimeout(retryFn, nextDelayMs);
      return;
    }
    this.stat_failed += 1;
    this.currentSize = Math.max(0, this.currentSize - 1);
    this.inFlightCount = Math.max(0, this.inFlightCount - 1);
    this.emit('failed', { item, error, attempts: attempt });
    if (this.currentSize === 0 && this.inFlightCount === 0) {
      this.emit('drained');
    }
    cb(error);
  }
}
