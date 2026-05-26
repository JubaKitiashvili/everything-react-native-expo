// Task 117.51 — in-memory cache adapter.
//
// Zero-dependency default. TTL is enforced lazily (an entry is reaped on
// the first `get` after it expires) plus a hard size cap with FIFO
// eviction so the cache can't grow without bound under a key explosion.
// Lazy expiry keeps the hot `get` path O(1) and avoids a background timer
// — important because this sits in front of HTTP reads, not the WS path.
//
// `Map` preserves insertion order, which gives us FIFO eviction for free:
// the first key in iteration order is the oldest insert.

import type { CacheStats, ICache } from './ICache.js';

export interface InMemoryCacheOptions {
  /**
   * Max live entries before a `set` evicts the oldest (FIFO). Default
   * 1_000. Set to `Infinity` to disable the cap.
   */
  maxEntries?: number;
  /**
   * Default TTL in ms applied when `set` is called without an explicit
   * `ttlMs`. Default 5_000 (5s). A non-positive default means entries
   * never persist unless a positive `ttlMs` is passed.
   */
  defaultTtlMs?: number;
  /** Clock injection for tests. Default `Date.now`. */
  now?: () => number;
}

interface Entry<T = unknown> {
  value: T;
  /** Absolute expiry timestamp (ms). */
  expiresAt: number;
}

const DEFAULT_MAX_ENTRIES = 1_000;
const DEFAULT_TTL_MS = 5_000;

export class InMemoryCache implements ICache {
  private readonly maxEntries: number;
  private readonly defaultTtlMs: number;
  private readonly now: () => number;
  private readonly store = new Map<string, Entry>();

  private stat_hits = 0;
  private stat_misses = 0;
  private stat_sets = 0;
  private stat_deletes = 0;
  private stat_evictions = 0;
  private stat_expirations = 0;

  constructor(options: InMemoryCacheOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  // The `async` keyword satisfies the Promise-returning ICache contract
  // without paying for a microtask hop on the synchronous in-memory path
  // beyond what `async` itself adds — keeping call sites uniform with the
  // remote adapter.
  async get<T = unknown>(key: string): Promise<T | undefined> {
    const entry = this.store.get(key);
    if (!entry) {
      this.stat_misses += 1;
      return undefined;
    }
    if (entry.expiresAt <= this.now()) {
      // Lazy expiry — reap on access. Counts as both an expiration and a
      // miss (the caller observes "nothing live here").
      this.store.delete(key);
      this.stat_expirations += 1;
      this.stat_misses += 1;
      return undefined;
    }
    this.stat_hits += 1;
    return entry.value as T;
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.stat_sets += 1;
    if (ttl <= 0) {
      // A non-positive TTL means "don't store" — also clear any prior
      // value so a stale entry can't outlive an explicit no-op write.
      this.store.delete(key);
      return;
    }
    // Re-insert semantics: delete first so an overwrite moves the key to
    // the newest position (FIFO fairness — a freshly written key is the
    // youngest, not still aged by its original insert time).
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: this.now() + ttl });
    this.evictIfNeeded();
  }

  async del(key: string): Promise<boolean> {
    const had = this.store.delete(key);
    if (had) this.stat_deletes += 1;
    return had;
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  stats(): CacheStats {
    return {
      hits: this.stat_hits,
      misses: this.stat_misses,
      sets: this.stat_sets,
      deletes: this.stat_deletes,
      evictions: this.stat_evictions,
      expirations: this.stat_expirations,
      size: this.store.size,
    };
  }

  async close(): Promise<void> {
    // Nothing to release — included for ICache symmetry with remote
    // adapters that hold a socket.
    this.store.clear();
  }

  private evictIfNeeded(): void {
    if (!Number.isFinite(this.maxEntries)) return;
    while (this.store.size > this.maxEntries) {
      // Map iteration order is insertion order; the first key is oldest.
      const oldest = this.store.keys().next().value;
      if (oldest === undefined) break;
      this.store.delete(oldest);
      this.stat_evictions += 1;
    }
  }
}
