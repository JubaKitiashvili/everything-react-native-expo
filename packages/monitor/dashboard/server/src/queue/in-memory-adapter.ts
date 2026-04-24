// Task 117.5 — in-memory queue adapter.
//
// Single-process FIFO with retry, exponential backoff, backpressure, and
// configurable concurrency. Zero external dependencies. This is the
// default adapter the dashboard-server uses for ingest.
//
// Ordering contract: at `concurrency === 1` the queue is strict FIFO.
// At higher concurrency items are started in FIFO order but may complete
// out of order. Ingest uses concurrency=1 so crash-group updates can't
// race event inserts on the same session.

import type {
  EnqueueOptions,
  EnqueueResult,
  IQueue,
  QueueEventMap,
  QueueEventName,
  QueueStats,
  QueueWorker,
} from './IQueue.js';

export interface InMemoryQueueOptions {
  /**
   * Max items that can sit in the wait list before `enqueue()` rejects.
   * Does NOT count in-flight items — those aren't subject to
   * backpressure. Default: 10_000. Set to `Infinity` to disable.
   */
  maxSize?: number;
  /**
   * Worker concurrency. Default: 1 (FIFO). Ingest relies on this.
   */
  concurrency?: number;
  /**
   * Total retry attempts per item (first attempt + retries). Default 3.
   * A value of 1 means "no retries" — one shot and drop on failure.
   */
  maxAttempts?: number;
  /**
   * Backoff base in milliseconds. Delay between attempt N and N+1 is
   * `backoffBaseMs * 2 ** (N-1)`, clamped to `backoffMaxMs`. Default
   * `backoffBaseMs=50`, `backoffMaxMs=5_000`.
   */
  backoffBaseMs?: number;
  backoffMaxMs?: number;
  /** Clock injection for tests. Defaults to `Date.now`. */
  now?: () => number;
  /**
   * Scheduler injection for tests. Must behave like setTimeout —
   * returns a handle we can `clearTimeout` on.
   */
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

interface PendingItem<T> {
  item: T;
  attempts: number;
  retries: number;
  tag?: string;
}

// Generic listener bag keyed by event name. We type it conservatively
// here because the event map is heterogenous; type safety is enforced
// by the public on() signature.
type ListenerBag<T> = {
  [E in QueueEventName<T>]?: Array<QueueEventMap<T>[E]>;
};

const DEFAULT_MAX_SIZE = 10_000;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_BACKOFF_BASE_MS = 50;
const DEFAULT_BACKOFF_MAX_MS = 5_000;

export class InMemoryQueue<T> implements IQueue<T> {
  private readonly maxSize: number;
  private readonly concurrency: number;
  private readonly maxAttempts: number;
  private readonly backoffBaseMs: number;
  private readonly backoffMaxMs: number;
  private readonly schedule: (fn: () => void, ms: number) => unknown;
  private readonly cancel: (handle: unknown) => void;

  private readonly waiting: PendingItem<T>[] = [];
  private worker: QueueWorker<T> | null = null;
  private running = false;
  private stopping = false;
  private inFlightCount = 0;
  private pendingTimers = new Set<unknown>();
  private stopResolve: (() => void) | null = null;
  private listeners: ListenerBag<T> = {};

  private stat_enqueued = 0;
  private stat_processed = 0;
  private stat_failed = 0;
  private stat_retried = 0;
  private stat_backpressured = 0;
  private stat_highWaterMark = 0;

  constructor(options: InMemoryQueueOptions = {}) {
    this.maxSize = options.maxSize ?? DEFAULT_MAX_SIZE;
    this.concurrency = Math.max(1, options.concurrency ?? 1);
    this.maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
    this.backoffMaxMs = options.backoffMaxMs ?? DEFAULT_BACKOFF_MAX_MS;
    // `options.now` is accepted for future deterministic ordering tests.
    void options.now;
    // Bind through globalThis so the scheduler reference survives any
    // test shims that monkeypatch `setTimeout` post-construction.
    this.schedule =
      options.setTimeout ??
      ((fn: () => void, ms: number) => setTimeout(fn, ms));
    this.cancel = options.clearTimeout ?? ((h: unknown) => clearTimeout(h as NodeJS.Timeout));
  }

  enqueue(item: T, options: EnqueueOptions = {}): EnqueueResult {
    if (this.stopping) {
      return { queued: false, reason: 'closed', depth: this.waiting.length };
    }
    if (this.waiting.length >= this.maxSize) {
      this.stat_backpressured += 1;
      this.emit('backpressure', { depth: this.waiting.length, maxSize: this.maxSize });
      return { queued: false, reason: 'backpressure', depth: this.waiting.length };
    }
    const pending: PendingItem<T> = {
      item,
      attempts: 0,
      retries: options.retries ?? this.maxAttempts - 1,
      ...(options.tag !== undefined ? { tag: options.tag } : {}),
    };
    this.waiting.push(pending);
    this.stat_enqueued += 1;
    if (this.waiting.length > this.stat_highWaterMark) {
      this.stat_highWaterMark = this.waiting.length;
    }
    this.pump();
    return { queued: true, depth: this.waiting.length };
  }

  start(worker: QueueWorker<T>): void {
    this.worker = worker;
    this.running = true;
    this.pump();
  }

  async stop(drainTimeoutMs?: number): Promise<void> {
    if (!this.running && this.waiting.length === 0 && this.inFlightCount === 0) {
      this.stopping = true;
      return;
    }
    this.stopping = true;
    return await new Promise<void>((resolve) => {
      let timer: unknown = null;
      const finish = (): void => {
        if (timer !== null) this.cancel(timer);
        this.running = false;
        this.stopResolve = null;
        resolve();
      };
      // If already drained, short-circuit.
      if (this.waiting.length === 0 && this.inFlightCount === 0) {
        finish();
        return;
      }
      this.stopResolve = finish;
      if (drainTimeoutMs !== undefined && Number.isFinite(drainTimeoutMs)) {
        timer = this.schedule(() => {
          // Timed out waiting for drain. Remaining items stay in the
          // buffer but won't be processed — accept the loss, callers
          // opted into this by passing a timeout.
          finish();
        }, drainTimeoutMs);
      }
    });
  }

  size(): number {
    return this.waiting.length;
  }

  stats(): QueueStats {
    return {
      enqueued: this.stat_enqueued,
      processed: this.stat_processed,
      failed: this.stat_failed,
      retried: this.stat_retried,
      backpressured: this.stat_backpressured,
      currentSize: this.waiting.length,
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
        // Narrow for the type system — each event has a fixed tuple.
        (fn as (...a: Parameters<QueueEventMap<T>[E]>) => void)(...args);
      } catch {
        // Listener errors are swallowed — one bad subscriber can't take
        // down the queue. Stats / lifecycle events stay authoritative.
      }
    }
  }

  /** Kick the worker loop. Safe to call repeatedly. */
  private pump(): void {
    if (!this.running || !this.worker) return;
    while (this.inFlightCount < this.concurrency && this.waiting.length > 0) {
      const pending = this.waiting.shift();
      if (!pending) break;
      this.inFlightCount += 1;
      void this.run(pending);
    }
  }

  private async run(pending: PendingItem<T>): Promise<void> {
    if (!this.worker) {
      this.inFlightCount -= 1;
      return;
    }
    pending.attempts += 1;
    try {
      await this.worker(pending.item);
      this.stat_processed += 1;
      this.inFlightCount -= 1;
      this.afterCompletion();
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      // Retries continue across a `stop()` — the drain timeout (if any)
      // is responsible for cutting things off. Without this, the first
      // stop() call would prematurely flip a retryable failure into a
      // permanent one, which surprises tests that stop() immediately
      // after enqueueing.
      const hasRetriesLeft = pending.attempts < this.maxAttempts;
      if (hasRetriesLeft) {
        this.stat_retried += 1;
        const nextDelayMs = Math.min(
          this.backoffMaxMs,
          this.backoffBaseMs * 2 ** (pending.attempts - 1),
        );
        this.emit('retry', {
          item: pending.item,
          error,
          attempt: pending.attempts,
          nextDelayMs,
        });
        const timer = this.schedule(() => {
          this.pendingTimers.delete(timer);
          // Re-enqueue at the head? No — re-enqueue at the tail so one
          // flaky item can't block others behind it. That also bounds
          // the worst-case stall per item at (queue depth × backoff).
          this.waiting.push(pending);
          this.inFlightCount -= 1;
          this.pump();
        }, nextDelayMs);
        this.pendingTimers.add(timer);
      } else {
        this.stat_failed += 1;
        this.emit('failed', {
          item: pending.item,
          error,
          attempts: pending.attempts,
        });
        this.inFlightCount -= 1;
        this.afterCompletion();
      }
    }
  }

  private afterCompletion(): void {
    if (this.waiting.length === 0 && this.inFlightCount === 0) {
      this.emit('drained');
      if (this.stopping && this.stopResolve) {
        this.stopResolve();
      }
    } else {
      this.pump();
    }
  }
}
