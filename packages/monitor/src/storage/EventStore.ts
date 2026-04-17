import type { MonitorEvent } from '../types';

export type EventPriority = 'critical' | 'high' | 'normal' | 'low';

const PRIORITY_ORDER: readonly EventPriority[] = [
  'critical',
  'high',
  'normal',
  'low',
];

/**
 * Low-level storage adapter for events. Phase 1a ships an in-memory
 * implementation (below) used by tests and by MonitorClient when expo-
 * sqlite is unavailable. Phase 2 wires a SQLite adapter with the same
 * interface so the higher-level EventStore logic stays unchanged.
 */
export interface EventStoreBackend {
  init(): Promise<void>;
  insert(row: StoredEventRow): Promise<void>;
  insertSync(row: StoredEventRow): void;
  drain(priority: EventPriority, limit: number): Promise<StoredEventRow[]>;
  drainAll(limit: number): Promise<StoredEventRow[]>;
  count(): Promise<number>;
  sizeBytes(): Promise<number>;
  deleteOlderThan(cutoffWallTime: number): Promise<number>;
  evictLRUPreservingCritical(targetBytes: number): Promise<number>;
  /**
   * GDPR support — returns up to `limit` stored events whose enriched
   * context carries the given user identifier. Non-destructive. Returns
   * rows in insertion order (oldest first).
   */
  findByUserId(userId: string, limit: number): Promise<StoredEventRow[]>;
  /**
   * GDPR support — removes every stored event whose enriched context
   * carries the given user identifier. Returns the number of rows
   * deleted. Critical-priority rows are NOT exempt here: a DSAR delete
   * must purge everything attributable to the user.
   */
  deleteByUserId(userId: string): Promise<number>;
  close(): Promise<void>;
}

export interface StoredEventRow {
  id: number;
  priority: EventPriority;
  event: MonitorEvent;
  sizeBytes: number;
  insertedAt: number;
}

export interface EventStoreOptions {
  backend?: EventStoreBackend;
  maxBytes?: number;
  maxAgeMs?: number;
  now?: () => number;
}

const DEFAULT_MAX_BYTES = 50 * 1024 * 1024; // 50 MB
const DEFAULT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function estimateSize(event: MonitorEvent): number {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 256; // fallback — circular or weird data
  }
}

/**
 * High-level event buffer with priority queue, LRU eviction, and age
 * pruning. Delegates actual storage to an EventStoreBackend.
 */
export class EventStore {
  private readonly backend: EventStoreBackend;
  private readonly maxBytes: number;
  private readonly maxAgeMs: number;
  private readonly now: () => number;
  private initialized = false;

  constructor(options: EventStoreOptions = {}) {
    this.backend = options.backend ?? new MemoryEventStoreBackend();
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_AGE_MS;
    this.now = options.now ?? Date.now;
  }

  async init(): Promise<void> {
    if (this.initialized) return;
    await this.backend.init();
    this.initialized = true;
  }

  async insert(event: MonitorEvent, priority: EventPriority): Promise<void> {
    this.assertInit();
    const row = this.makeRow(event, priority);
    await this.backend.insert(row);
    await this.enforceSizeCap();
  }

  /**
   * Synchronous insert used by CrashCollector when the process may die
   * before a microtask runs. Bypasses enforceSizeCap(); a crash must never
   * be dropped due to eviction.
   */
  insertSync(event: MonitorEvent, priority: EventPriority): void {
    this.assertInit();
    const row = this.makeRow(event, priority);
    this.backend.insertSync(row);
  }

  /**
   * Drains events for a specific priority level, oldest first. The drained
   * events are removed from the store.
   */
  async drain(priority: EventPriority, limit: number): Promise<MonitorEvent[]> {
    this.assertInit();
    if (limit <= 0) return [];
    const rows = await this.backend.drain(priority, limit);
    return rows.map((r) => r.event);
  }

  /**
   * Drains events across all priorities, highest priority first, then
   * oldest first within a priority. Removes the drained events.
   */
  async drainAll(limit: number): Promise<MonitorEvent[]> {
    this.assertInit();
    if (limit <= 0) return [];
    const rows = await this.backend.drainAll(limit);
    return rows.map((r) => r.event);
  }

  async count(): Promise<number> {
    this.assertInit();
    return this.backend.count();
  }

  async size(): Promise<number> {
    this.assertInit();
    return this.backend.sizeBytes();
  }

  /**
   * Deletes events older than the configured max age (default 7 days).
   * Returns the number of rows removed.
   */
  async prune(maxAgeMs: number = this.maxAgeMs): Promise<number> {
    this.assertInit();
    const cutoff = this.now() - maxAgeMs;
    return this.backend.deleteOlderThan(cutoff);
  }

  /**
   * Evicts least-recently-inserted non-critical rows until total storage
   * is at or below maxBytes. Critical-priority rows (crashes) are never
   * evicted. Returns the number of rows removed.
   */
  async pruneBySize(maxBytes: number = this.maxBytes): Promise<number> {
    this.assertInit();
    return this.backend.evictLRUPreservingCritical(maxBytes);
  }

  async close(): Promise<void> {
    if (!this.initialized) return;
    await this.backend.close();
    this.initialized = false;
  }

  /**
   * Returns up to `limit` events attributable to the given user. Used
   * by `monitor.exportUserData(id)` — non-destructive, does not remove
   * the events from storage.
   */
  async findByUserId(
    userId: string,
    limit: number = 10_000,
  ): Promise<MonitorEvent[]> {
    this.assertInit();
    if (!userId || limit <= 0) return [];
    const rows = await this.backend.findByUserId(userId, limit);
    return rows.map((r) => r.event);
  }

  /**
   * Purges every stored event whose enriched context carries `userId`.
   * Used by `monitor.deleteUserData(id)` — destructive and permanent.
   * Returns the number of rows removed.
   */
  async deleteByUserId(userId: string): Promise<number> {
    this.assertInit();
    if (!userId) return 0;
    return this.backend.deleteByUserId(userId);
  }

  private async enforceSizeCap(): Promise<void> {
    const current = await this.backend.sizeBytes();
    if (current > this.maxBytes) {
      await this.backend.evictLRUPreservingCritical(this.maxBytes);
    }
  }

  private makeRow(event: MonitorEvent, priority: EventPriority): StoredEventRow {
    return {
      id: 0, // backend assigns
      priority,
      event,
      sizeBytes: estimateSize(event),
      insertedAt: this.now(),
    };
  }

  private assertInit(): void {
    if (!this.initialized) {
      throw new Error('[monitor] EventStore used before init()');
    }
  }
}

/**
 * In-memory EventStoreBackend. Keeps a single array sorted by insertion
 * order. Priority-aware drain walks the array once per call; with the
 * expected buffer size (thousands, not millions) this is fine.
 */
export class MemoryEventStoreBackend implements EventStoreBackend {
  private nextId = 1;
  private rows: StoredEventRow[] = [];
  private totalBytes = 0;

  async init(): Promise<void> {
    // no-op for memory backend
  }

  async insert(row: StoredEventRow): Promise<void> {
    this.insertInternal(row);
  }

  insertSync(row: StoredEventRow): void {
    this.insertInternal(row);
  }

  async drain(priority: EventPriority, limit: number): Promise<StoredEventRow[]> {
    const out: StoredEventRow[] = [];
    const remaining: StoredEventRow[] = [];
    for (const row of this.rows) {
      if (out.length < limit && row.priority === priority) {
        out.push(row);
        this.totalBytes -= row.sizeBytes;
      } else {
        remaining.push(row);
      }
    }
    this.rows = remaining;
    return out;
  }

  async drainAll(limit: number): Promise<StoredEventRow[]> {
    const out: StoredEventRow[] = [];
    // Iterate priorities in order; within a priority, rows are already
    // sorted by insertion (and therefore by insertedAt) because we append.
    for (const priority of PRIORITY_ORDER) {
      if (out.length >= limit) break;
      const remaining: StoredEventRow[] = [];
      for (const row of this.rows) {
        if (out.length < limit && row.priority === priority) {
          out.push(row);
          this.totalBytes -= row.sizeBytes;
        } else {
          remaining.push(row);
        }
      }
      this.rows = remaining;
    }
    return out;
  }

  async count(): Promise<number> {
    return this.rows.length;
  }

  async sizeBytes(): Promise<number> {
    return this.totalBytes;
  }

  async deleteOlderThan(cutoffWallTime: number): Promise<number> {
    const before = this.rows.length;
    const kept: StoredEventRow[] = [];
    for (const row of this.rows) {
      if (row.insertedAt < cutoffWallTime) {
        this.totalBytes -= row.sizeBytes;
      } else {
        kept.push(row);
      }
    }
    this.rows = kept;
    return before - this.rows.length;
  }

  async evictLRUPreservingCritical(targetBytes: number): Promise<number> {
    if (this.totalBytes <= targetBytes) return 0;
    let removed = 0;
    // Walk oldest → newest; skip critical rows.
    const kept: StoredEventRow[] = [];
    for (const row of this.rows) {
      if (this.totalBytes > targetBytes && row.priority !== 'critical') {
        this.totalBytes -= row.sizeBytes;
        removed++;
      } else {
        kept.push(row);
      }
    }
    this.rows = kept;
    return removed;
  }

  async close(): Promise<void> {
    this.rows = [];
    this.totalBytes = 0;
  }

  async findByUserId(
    userId: string,
    limit: number,
  ): Promise<StoredEventRow[]> {
    const out: StoredEventRow[] = [];
    for (const row of this.rows) {
      if (out.length >= limit) break;
      if (extractUserId(row.event) === userId) out.push(row);
    }
    return out;
  }

  async deleteByUserId(userId: string): Promise<number> {
    const before = this.rows.length;
    const kept: StoredEventRow[] = [];
    for (const row of this.rows) {
      if (extractUserId(row.event) === userId) {
        this.totalBytes -= row.sizeBytes;
      } else {
        kept.push(row);
      }
    }
    this.rows = kept;
    return before - this.rows.length;
  }

  private insertInternal(row: StoredEventRow): void {
    const assigned: StoredEventRow = { ...row, id: this.nextId++ };
    this.rows.push(assigned);
    this.totalBytes += assigned.sizeBytes;
  }
}

/**
 * Reads the userId tag attached by Enricher from an event's enriched
 * context. Returns `null` for raw (un-enriched) events and for any
 * anonymous session where no userId was set.
 */
function extractUserId(event: MonitorEvent): string | null {
  const ctx = (event as MonitorEvent & { context?: { userId?: unknown } })
    .context;
  if (!ctx || typeof ctx.userId !== 'string') return null;
  return ctx.userId || null;
}
