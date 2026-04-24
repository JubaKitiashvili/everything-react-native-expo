// Task 117.5 — Message queue abstraction.
//
// The ingest pipeline was previously synchronous: every WebSocket frame
// hit the DB + broadcast on the same callback. That pins a 1 MB replay
// event to the network read latency, stalls other WS frames under burst,
// and leaves no observable retry / backpressure for operators.
//
// This interface is the narrow contract the ingest hot path uses. Two
// implementations ship with the server:
//   - `InMemoryQueue<T>`     — zero-dep default. Single-node Node.js.
//   - `BetterQueueAdapter<T>` — wraps the npm `better-queue` package as
//                               an optional peer for persistent / cross-
//                               process queueing.
//
// Both implementations enforce FIFO ordering at `concurrency === 1`.
// Ordering guarantees at higher concurrency are per-implementation and
// documented on each class. Ingest defaults to concurrency=1 so a
// crash_group update can't race an event insert on the same session.

export interface EnqueueOptions {
  /**
   * Per-item retry attempts override. When omitted, the queue's default
   * retry budget applies.
   */
  retries?: number;
  /** Optional label used in error events so operators can trace a drop. */
  tag?: string;
}

export interface EnqueueResult {
  /** True when the item was accepted, false when rejected (backpressure). */
  queued: boolean;
  /**
   * When `queued === false`, this is the reason. Always `backpressure`
   * in the current impls — room for `closed`, `paused`, etc. later.
   */
  reason?: 'backpressure' | 'closed';
  /** Queue depth after the attempt (or when rejected, the depth observed). */
  depth: number;
}

export interface QueueStats {
  /** Total items ever enqueued (accepted). */
  enqueued: number;
  /** Total items that completed their worker callback cleanly. */
  processed: number;
  /** Total items that exhausted retries and were dropped. */
  failed: number;
  /** Retry attempts across all items (cumulative). */
  retried: number;
  /** Backpressure rejections (enqueue calls that returned `queued: false`). */
  backpressured: number;
  /** Current queue depth. */
  currentSize: number;
  /** Items currently being processed by worker callbacks. */
  inFlight: number;
  /** All-time maximum `currentSize`. */
  highWaterMark: number;
}

/** Worker function — returns a promise so async IO is first-class. */
export type QueueWorker<T> = (item: T) => void | Promise<void>;

export interface QueueEventMap<T> {
  /**
   * A worker callback threw — the item will be retried or dropped.
   * Emitted once per retry; `attempt` is 1-indexed.
   */
  retry: (info: { item: T; error: Error; attempt: number; nextDelayMs: number }) => void;
  /**
   * Worker threw on the final attempt. The item is dropped; stats.failed ++.
   */
  failed: (info: { item: T; error: Error; attempts: number }) => void;
  /**
   * Queue depth transitioned from non-zero back to zero AND nothing is
   * inFlight. Fires once per "empty" transition, not on every dequeue.
   */
  drained: () => void;
  /**
   * Enqueue was rejected because depth would exceed `maxSize`. Emitted
   * synchronously from inside `enqueue()`.
   */
  backpressure: (info: { depth: number; maxSize: number }) => void;
}

export type QueueEventName<T> = keyof QueueEventMap<T>;

/**
 * Minimal EventEmitter-like surface — we don't want to subclass Node's
 * EventEmitter because the in-memory adapter stays environment-agnostic
 * and the test shims don't need the full API. Return value is an
 * unsubscribe function for ergonomic cleanup.
 */
export interface QueueEventBus<T> {
  on<E extends QueueEventName<T>>(event: E, listener: QueueEventMap<T>[E]): () => void;
}

export interface IQueue<T> extends QueueEventBus<T> {
  /**
   * Enqueue an item. Synchronous, non-blocking. Returns an ack so the
   * caller can observe backpressure rejection in-line (no out-of-band
   * error handling required). Backpressure also fires the
   * `backpressure` event for centralised observability.
   */
  enqueue(item: T, options?: EnqueueOptions): EnqueueResult;

  /**
   * Register the worker and begin draining the queue. Idempotent — a
   * second call with the same worker is a no-op; a second call with a
   * different worker replaces the current worker but does not restart
   * in-flight items. Typically called once during server boot.
   */
  start(worker: QueueWorker<T>): void;

  /**
   * Stop accepting new items, wait for inflight + enqueued items to
   * drain, then resolve. Subsequent `enqueue()` calls return
   * `{ queued: false, reason: 'closed' }`. A drain timeout (ms) caps
   * how long we'll wait for inflight work — default None (wait forever).
   */
  stop(drainTimeoutMs?: number): Promise<void>;

  /** Current queue depth (items waiting, excluding in-flight). */
  size(): number;

  /** Point-in-time stats snapshot. */
  stats(): QueueStats;

  /** True while `start()` has been called and `stop()` has not completed. */
  isRunning(): boolean;
}
