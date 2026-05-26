// Task 117.51 — caching layer abstraction.
//
// Some HTTP read paths (crash-group list, aggregate queries) re-run the
// same SQLite scan on every poll from the dashboard. A short-lived cache
// in front of those reads collapses a burst of identical requests into a
// single store hit while keeping staleness bounded to the TTL.
//
// This is the narrow contract the server uses. Two implementations ship:
//   - `InMemoryCache`      — zero-dep default. Single-node Node.js, lazy
//                            TTL expiry + a size cap with FIFO eviction.
//   - `RedisCacheAdapter`  — wraps `ioredis` as an optional peer for a
//                            shared cache across processes / instances.
//
// Mirrors the queue package's pattern exactly (IQueue + InMemoryQueue +
// BetterQueueAdapter): an interface, a default in-memory impl, and an
// optional-dependency adapter built through an async factory that throws
// a readable install hint when the peer is absent.

export interface CacheStats {
  /** Lookups that returned a live (non-expired) value. */
  hits: number;
  /** Lookups that found nothing or a value past its TTL. */
  misses: number;
  /** Total `set` calls. */
  sets: number;
  /** Total `del` calls that removed a present key. */
  deletes: number;
  /** Entries evicted because the size cap was exceeded. */
  evictions: number;
  /** Entries dropped lazily because their TTL had elapsed. */
  expirations: number;
  /** Current number of live entries (best-effort for remote adapters). */
  size: number;
}

export interface ICache {
  /**
   * Look up a key. Resolves to the stored value or `undefined` when the
   * key is absent or expired. Expired entries are treated as a miss and
   * (for the in-memory impl) reaped lazily on access.
   */
  get<T = unknown>(key: string): Promise<T | undefined>;

  /**
   * Store `value` under `key`. `ttlMs` bounds how long the entry stays
   * live; omit it for the cache's default TTL. A non-positive TTL stores
   * nothing (treated as an immediate expiry / no-op write).
   */
  set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void>;

  /** Remove a single key. Resolves to `true` when a key was present. */
  del(key: string): Promise<boolean>;

  /** Drop every entry. */
  clear(): Promise<void>;

  /** Point-in-time stats snapshot. */
  stats(): CacheStats;

  /**
   * Release any underlying resources (sockets, timers). Idempotent.
   * The in-memory cache has nothing to release; remote adapters close
   * their client connection here.
   */
  close(): Promise<void>;
}
