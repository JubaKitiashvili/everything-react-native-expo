/**
 * Task 117.31 — Offline event queue with resumable uploads.
 *
 * A durable-ish outbound buffer for when the dashboard transport is
 * unavailable. Events are enqueued while offline, persisted to an injectable
 * storage, and drained in FIFO order on reconnect.
 *
 * "Resumable" semantics: a `flush(send)` that fails partway through keeps the
 * un-acked tail of the buffer so the next attempt resumes from where it left
 * off rather than re-sending already-delivered events or dropping the rest.
 *
 * The buffer is capped (`maxEvents`, default 1000). When full, the oldest
 * event is dropped (drop-oldest) and a counter is bumped so the host can see
 * how much was lost — the newest data is generally the most useful when a
 * device has been offline a long time.
 *
 * Sits alongside the transport layer; intentionally standalone so it can wrap
 * any `send` function. Integration point: `createMonitorRuntime` could route
 * dispatch through this when `transport.endpoint` is set and the network is
 * down — not force-wired here because the runtime's transport path is
 * synchronous-fire-and-forget and offline detection lives in BatchTransport's
 * NetInfo hook, so the clean hook is to have BatchTransport fall back to an
 * OfflineQueue on send failure (a follow-up wiring task).
 */

/**
 * Injectable persistence backend. Keys map to serialized values.
 *
 * The default ({@link MemoryOfflineStorage}) is in-memory and therefore lost
 * on process death. For real durability across launches, back this with
 * AsyncStorage, MMKV, or expo-file-system. Per security.md, an offline event
 * buffer is NON-SENSITIVE telemetry only — never persist tokens, credentials,
 * or PII here; sanitize/scrub upstream before enqueueing.
 */
export interface OfflineStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

export interface OfflineQueueStats {
  /** Events currently held in the buffer (not yet acknowledged). */
  buffered: number;
  /** Events dropped due to the cap since construction (drop-oldest). */
  dropped: number;
  /** Events successfully sent (acknowledged) since construction. */
  flushed: number;
}

export interface OfflineQueueOptions {
  /** Persistence backend. Defaults to an in-memory store. */
  storage?: OfflineStorage;
  /** Storage key under which the buffer is persisted. Default 'erne.offlineQueue'. */
  storageKey?: string;
  /** Max events retained. Oldest dropped when exceeded. Default 1000. */
  maxEvents?: number;
}

/**
 * The result of attempting to deliver a single event during a flush.
 *  - `true`  → delivered, event is acknowledged and removed.
 *  - `false` → not delivered; flush stops and the event (plus all later
 *    events) is retained for the next attempt. A thrown error is treated the
 *    same as `false` for the offending event.
 */
export type OfflineSend<E> = (event: E) => boolean | Promise<boolean>;

export const OFFLINE_QUEUE_DEFAULTS = Object.freeze({
  maxEvents: 1000,
  storageKey: 'erne.offlineQueue',
});

/** Default in-memory {@link OfflineStorage}. Not durable across launches. */
export class MemoryOfflineStorage implements OfflineStorage {
  private readonly map = new Map<string, string>();

  async get(key: string): Promise<string | null> {
    return this.map.has(key) ? (this.map.get(key) as string) : null;
  }

  async set(key: string, value: string): Promise<void> {
    this.map.set(key, value);
  }

  async remove(key: string): Promise<void> {
    this.map.delete(key);
  }
}

export class OfflineQueue<E = unknown> {
  private readonly storage: OfflineStorage;
  private readonly storageKey: string;
  private readonly maxEvents: number;
  private buffer: E[] = [];
  private dropped = 0;
  private flushed = 0;
  private hydrated = false;

  constructor(options: OfflineQueueOptions = {}) {
    this.storage = options.storage ?? new MemoryOfflineStorage();
    this.storageKey = options.storageKey ?? OFFLINE_QUEUE_DEFAULTS.storageKey;
    this.maxEvents = Math.max(1, options.maxEvents ?? OFFLINE_QUEUE_DEFAULTS.maxEvents);
  }

  /**
   * Loads any previously-persisted buffer from storage. Idempotent — only the
   * first call reads storage. Safe to call before the first enqueue/flush;
   * mutating methods call it implicitly, so explicit hydration is optional.
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    this.hydrated = true;
    const raw = await this.storage.get(this.storageKey);
    if (raw === null) return;
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.buffer = parsed as E[];
        // A persisted buffer larger than the current cap is trimmed oldest-first.
        if (this.buffer.length > this.maxEvents) {
          const overflow = this.buffer.length - this.maxEvents;
          this.buffer.splice(0, overflow);
          this.dropped += overflow;
          await this.persist();
        }
      }
    } catch {
      // Corrupt payload — discard rather than crash the host.
      this.buffer = [];
    }
  }

  /**
   * Appends an event to the tail of the buffer and persists. When the buffer
   * is at capacity, the oldest event is dropped first (drop-oldest) and the
   * `dropped` counter is incremented.
   */
  async enqueue(event: E): Promise<void> {
    await this.hydrate();
    this.buffer.push(event);
    if (this.buffer.length > this.maxEvents) {
      const overflow = this.buffer.length - this.maxEvents;
      this.buffer.splice(0, overflow);
      this.dropped += overflow;
    }
    await this.persist();
  }

  /**
   * Drains the buffer in FIFO order, delivering each event via `send`. Stops
   * at the first event that `send` reports as undelivered (returns false or
   * throws); that event and all later ones are retained for the next attempt
   * (resumable). Returns the number of events acknowledged this call.
   */
  async flush(send: OfflineSend<E>): Promise<number> {
    await this.hydrate();
    let acked = 0;
    while (this.buffer.length > 0) {
      const event = this.buffer[0] as E;
      let ok = false;
      try {
        ok = await send(event);
      } catch {
        ok = false;
      }
      if (!ok) break;
      this.buffer.shift();
      acked += 1;
      this.flushed += 1;
    }
    if (acked > 0) {
      await this.persist();
    }
    return acked;
  }

  /** Current buffered / dropped / flushed counters. */
  stats(): OfflineQueueStats {
    return {
      buffered: this.buffer.length,
      dropped: this.dropped,
      flushed: this.flushed,
    };
  }

  /** Number of events currently buffered. */
  size(): number {
    return this.buffer.length;
  }

  /** Shallow snapshot of buffered events in FIFO order (oldest first). */
  peek(): readonly E[] {
    return [...this.buffer];
  }

  /**
   * Clears the buffer and removes it from storage. Does NOT reset the
   * dropped/flushed lifetime counters — pass `resetStats` to also zero those.
   */
  async clear(resetStats = false): Promise<void> {
    this.buffer = [];
    if (resetStats) {
      this.dropped = 0;
      this.flushed = 0;
    }
    this.hydrated = true;
    await this.storage.remove(this.storageKey);
  }

  private async persist(): Promise<void> {
    try {
      await this.storage.set(this.storageKey, JSON.stringify(this.buffer));
    } catch {
      // Persistence failure must never break the calling path — the in-memory
      // buffer is still authoritative for this session.
    }
  }
}
