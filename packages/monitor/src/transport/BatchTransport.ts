import type { MonitorEvent } from '../types';
import type { RetryQueue } from './RetryQueue';

/**
 * Task 54 — BatchTransport
 *
 * Client-side transport that batches events and handles offline/online
 * transitions with retry logic. Critical events (crashes) bypass the
 * batch timer and flush immediately.
 */

export interface TransportHealth {
  readonly pending: number;
  readonly failed: number;
  readonly lastFlushTime: number | null;
}

export interface NetInfoLike {
  addEventListener(
    listener: (state: { isConnected: boolean | null }) => void,
  ): { remove(): void };
}

export interface BatchTransportDeps {
  /** Endpoint URL for event ingestion. */
  endpoint: string;
  /** API key for authentication. */
  apiKey: string;
  /** Retry queue for failed batches. */
  retryQueue: RetryQueue;
  /** Batch interval in ms. Default 30000. */
  batchIntervalMs?: number;
  /** Max events per batch. Default 50. */
  maxBatchSize?: number;
  /** NetInfo for connectivity detection. Omit for always-online. */
  netInfo?: NetInfoLike;
  /** Fetch implementation. Default: globalThis.fetch. */
  fetchImpl?: typeof fetch;
  /** Clock. Default: Date.now. */
  now?: () => number;
  /** UUID generator. Default: crypto.randomUUID. */
  generateId?: () => string;
  /** Consent checker — only transmit consented events. */
  isConsented?: (event: MonitorEvent) => boolean;
}

export class BatchTransport {
  private readonly deps: BatchTransportDeps;
  private readonly batchIntervalMs: number;
  private readonly maxBatchSize: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly generateId: () => string;

  private buffer: MonitorEvent[] = [];
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private netInfoSub: { remove(): void } | null = null;
  private online = true;
  private running = false;
  private lastFlushTime: number | null = null;
  private failedCount = 0;

  constructor(deps: BatchTransportDeps) {
    this.deps = deps;
    this.batchIntervalMs = deps.batchIntervalMs ?? 30_000;
    this.maxBatchSize = deps.maxBatchSize ?? 50;
    this.fetchImpl = deps.fetchImpl ?? globalThis.fetch?.bind(globalThis);
    this.now = deps.now ?? Date.now;
    this.generateId =
      deps.generateId ??
      (() => `${this.now()}-${Math.random().toString(36).slice(2, 8)}`);
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    // Network connectivity listener
    if (this.deps.netInfo) {
      this.netInfoSub = this.deps.netInfo.addEventListener((state) => {
        const wasOffline = !this.online;
        this.online = state.isConnected !== false;
        if (wasOffline && this.online) {
          // Reconnected — flush retry queue + buffer
          void this.flushRetryQueue();
          void this.flush();
        }
      });
    }

    // Periodic flush timer
    this.flushTimer = setInterval(() => {
      void this.flush();
    }, this.batchIntervalMs);
  }

  stop(): void {
    this.running = false;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    this.netInfoSub?.remove();
    this.netInfoSub = null;
  }

  /** Enqueue an event for batched sending. Crashes flush immediately. */
  send(event: MonitorEvent): void {
    if (!this.running) return;

    // Consent check
    if (this.deps.isConsented && !this.deps.isConsented(event)) return;

    this.buffer.push(event);

    // Critical events (crashes) flush immediately
    if (event.type === 'crash') {
      void this.flush();
      return;
    }

    // Flush if batch is full
    if (this.buffer.length >= this.maxBatchSize) {
      void this.flush();
    }
  }

  /** Force flush the current buffer. */
  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    if (!this.online) return; // stay queued until reconnect

    const batch = this.buffer.splice(0, this.maxBatchSize);
    const id = this.generateId();
    const payload = JSON.stringify({ id, events: batch, sentAt: this.now() });

    try {
      const response = await this.fetchImpl(this.deps.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ERNE-Key': this.deps.apiKey,
        },
        body: payload,
      });

      if (response.ok || response.status === 202) {
        this.lastFlushTime = this.now();
      } else if (response.status >= 500 || response.status === 429) {
        // Server error or rate limited — retry
        await this.deps.retryQueue.enqueue(id, payload);
        this.failedCount++;
      }
      // 4xx (except 429) = client error, don't retry
    } catch {
      // Network error — enqueue for retry
      await this.deps.retryQueue.enqueue(id, payload);
      this.failedCount++;
    }
  }

  /** Flush the retry queue (oldest first). */
  async flushRetryQueue(): Promise<void> {
    if (!this.online) return;
    const ready = await this.deps.retryQueue.getReady(this.now());
    for (const entry of ready) {
      try {
        const response = await this.fetchImpl(this.deps.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-ERNE-Key': this.deps.apiKey,
          },
          body: entry.payload,
        });
        if (response.ok || response.status === 202) {
          await this.deps.retryQueue.acknowledge(entry.id);
          this.failedCount = Math.max(0, this.failedCount - 1);
        } else {
          const shouldRetry = await this.deps.retryQueue.fail(entry.id);
          if (!shouldRetry) this.failedCount = Math.max(0, this.failedCount - 1);
        }
      } catch {
        await this.deps.retryQueue.fail(entry.id);
      }
    }
  }

  getHealth(): TransportHealth {
    return {
      pending: this.buffer.length,
      failed: this.failedCount,
      lastFlushTime: this.lastFlushTime,
    };
  }

  isOnline(): boolean {
    return this.online;
  }
}
