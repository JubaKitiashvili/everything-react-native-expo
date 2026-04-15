/**
 * LRU cache for parsed source maps with size tracking.
 * Evicts least-recently-used entries when capacity is exceeded.
 */

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface CacheEntry<T> {
  readonly key: string;
  readonly value: T;
  readonly sizeBytes: number;
}

export interface CacheStats {
  readonly entries: number;
  readonly totalSizeBytes: number;
  readonly maxEntries: number;
  readonly maxSizeBytes: number;
  readonly hits: number;
  readonly misses: number;
}

export interface LRUCacheConfig {
  /** Maximum number of entries. Default: 100. */
  readonly maxEntries: number;
  /** Maximum total size in bytes. Default: 500MB. */
  readonly maxSizeBytes: number;
}

const DEFAULT_CONFIG: LRUCacheConfig = {
  maxEntries: 100,
  maxSizeBytes: 500 * 1024 * 1024, // 500 MB
};

// ────────────────────────────────────────────────────────────
// LRU Cache implementation
// ────────────────────────────────────────────────────────────

export interface LRUCache<T> {
  get(key: string): T | undefined;
  set(key: string, value: T, sizeBytes: number): void;
  has(key: string): boolean;
  delete(key: string): boolean;
  clear(): void;
  readonly stats: CacheStats;
}

export const createLRUCache = <T>(config?: Partial<LRUCacheConfig>): LRUCache<T> => {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Use a Map for insertion-order iteration (LRU eviction from front)
  const entries = new Map<string, CacheEntry<T>>();
  let totalSizeBytes = 0;
  let hits = 0;
  let misses = 0;

  const evict = (): void => {
    // Evict the least recently used (first in iteration order)
    const firstKey = entries.keys().next().value;
    if (firstKey !== undefined) {
      const entry = entries.get(firstKey);
      if (entry) {
        totalSizeBytes -= entry.sizeBytes;
        entries.delete(firstKey);
      }
    }
  };

  const ensureCapacity = (neededBytes: number): void => {
    // Evict until we have room
    while (
      entries.size > 0 &&
      (entries.size >= cfg.maxEntries || totalSizeBytes + neededBytes > cfg.maxSizeBytes)
    ) {
      evict();
    }
  };

  const get = (key: string): T | undefined => {
    const entry = entries.get(key);
    if (!entry) {
      misses++;
      return undefined;
    }

    hits++;

    // Move to end (most recently used) by re-inserting
    entries.delete(key);
    entries.set(key, entry);

    return entry.value;
  };

  const set = (key: string, value: T, sizeBytes: number): void => {
    // Remove existing entry if present
    const existing = entries.get(key);
    if (existing) {
      totalSizeBytes -= existing.sizeBytes;
      entries.delete(key);
    }

    ensureCapacity(sizeBytes);

    const entry: CacheEntry<T> = { key, value, sizeBytes };
    entries.set(key, entry);
    totalSizeBytes += sizeBytes;
  };

  const has = (key: string): boolean => entries.has(key);

  const del = (key: string): boolean => {
    const entry = entries.get(key);
    if (!entry) return false;
    totalSizeBytes -= entry.sizeBytes;
    entries.delete(key);
    return true;
  };

  const clear = (): void => {
    entries.clear();
    totalSizeBytes = 0;
  };

  return {
    get,
    set,
    has,
    delete: del,
    clear,
    get stats(): CacheStats {
      return {
        entries: entries.size,
        totalSizeBytes,
        maxEntries: cfg.maxEntries,
        maxSizeBytes: cfg.maxSizeBytes,
        hits,
        misses,
      };
    },
  };
};
