/**
 * Task 54 — RetryQueue
 *
 * Persistent retry queue for failed event batches. Stores batches in
 * order with exponential backoff metadata. On reconnect, flushes
 * oldest-first.
 *
 * The queue is backed by an abstract storage interface so it can use
 * EventStore, AsyncStorage, or in-memory for tests.
 */

export interface RetryEntry {
  readonly id: string;
  readonly payload: string; // gzip-compressed JSON
  readonly attempt: number;
  readonly nextRetryAt: number; // ms since epoch
  readonly createdAt: number;
}

export interface RetryQueueStorage {
  getAll(): Promise<readonly RetryEntry[]>;
  add(entry: RetryEntry): Promise<void>;
  remove(id: string): Promise<void>;
  update(id: string, updates: Partial<Pick<RetryEntry, 'attempt' | 'nextRetryAt'>>): Promise<void>;
  clear(): Promise<void>;
}

export interface RetryQueueOptions {
  storage: RetryQueueStorage;
  /** Max entries in the queue. Oldest dropped when exceeded. Default 100. */
  maxSize?: number;
  /** Base backoff delay in ms. Default 1000. */
  baseDelayMs?: number;
  /** Max backoff delay in ms. Default 60000. */
  maxDelayMs?: number;
  /** Max retry attempts before moving to dead letter. Default 10. */
  maxAttempts?: number;
}

/**
 * In-memory implementation of RetryQueueStorage for tests and
 * lightweight usage (e.g., when no persistent storage is configured).
 */
export class MemoryRetryQueueStorage implements RetryQueueStorage {
  private entries: RetryEntry[] = [];

  async getAll(): Promise<readonly RetryEntry[]> {
    return [...this.entries].sort((a, b) => a.createdAt - b.createdAt);
  }

  async add(entry: RetryEntry): Promise<void> {
    this.entries.push(entry);
  }

  async remove(id: string): Promise<void> {
    this.entries = this.entries.filter((e) => e.id !== id);
  }

  async update(
    id: string,
    updates: Partial<Pick<RetryEntry, 'attempt' | 'nextRetryAt'>>,
  ): Promise<void> {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) {
      const idx = this.entries.indexOf(entry);
      this.entries[idx] = { ...entry, ...updates };
    }
  }

  async clear(): Promise<void> {
    this.entries = [];
  }
}

export class RetryQueue {
  private readonly storage: RetryQueueStorage;
  private readonly maxSize: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;

  constructor(options: RetryQueueOptions) {
    this.storage = options.storage;
    this.maxSize = options.maxSize ?? 100;
    this.baseDelayMs = options.baseDelayMs ?? 1000;
    this.maxDelayMs = options.maxDelayMs ?? 60_000;
    this.maxAttempts = options.maxAttempts ?? 10;
  }

  /** Enqueue a failed batch for retry. */
  async enqueue(id: string, payload: string): Promise<void> {
    const entries = await this.storage.getAll();
    // Drop oldest if at capacity
    if (entries.length >= this.maxSize) {
      await this.storage.remove(entries[0]!.id);
    }
    const entry: RetryEntry = {
      id,
      payload,
      attempt: 0,
      nextRetryAt: Date.now() + this.baseDelayMs,
      createdAt: Date.now(),
    };
    await this.storage.add(entry);
  }

  /** Get entries that are ready for retry (nextRetryAt <= now). */
  async getReady(now: number = Date.now()): Promise<readonly RetryEntry[]> {
    const entries = await this.storage.getAll();
    return entries.filter((e) => e.nextRetryAt <= now);
  }

  /** Mark an entry as successfully sent — removes it. */
  async acknowledge(id: string): Promise<void> {
    await this.storage.remove(id);
  }

  /**
   * Mark an entry as failed — increment attempt, compute next backoff.
   * Returns true if the entry should be retried, false if max attempts
   * exceeded (dead letter).
   */
  async fail(id: string): Promise<boolean> {
    const entries = await this.storage.getAll();
    const entry = entries.find((e) => e.id === id);
    if (!entry) return false;

    const nextAttempt = entry.attempt + 1;
    if (nextAttempt >= this.maxAttempts) {
      await this.storage.remove(id);
      return false; // dead letter
    }

    const delay = Math.min(
      this.baseDelayMs * Math.pow(2, nextAttempt),
      this.maxDelayMs,
    );
    await this.storage.update(id, {
      attempt: nextAttempt,
      nextRetryAt: Date.now() + delay,
    });
    return true;
  }

  /** Get total pending entries. */
  async size(): Promise<number> {
    const entries = await this.storage.getAll();
    return entries.length;
  }

  /** Clear all entries. */
  async clear(): Promise<void> {
    await this.storage.clear();
  }
}
