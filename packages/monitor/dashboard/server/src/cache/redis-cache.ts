// Task 117.51 — `ioredis` cache adapter.
//
// Thin shim that maps the ICache contract onto a Redis client via the
// `ioredis` package. `ioredis` is listed under `optionalDependencies` so
// the default install footprint stays tiny — operators who want a cache
// shared across processes / instances install it explicitly.
//
// Mirrors `createBetterQueueAdapter`: the async `createRedisCache` factory
// resolves `ioredis` at runtime via a dynamic `import()` and fails fast
// with a readable install hint when the peer is missing, rather than a
// module-load crash at static `import`.
//
// Values are JSON-serialised on `set` and parsed on `get`. TTL is enforced
// by Redis itself (`PX` / `pexpire`), so there is no lazy-reap path here.

import type { CacheStats, ICache } from './ICache.js';

/**
 * Subset of the `ioredis` client surface we depend on. Keeps the adapter
 * testable with a hand-rolled fake (see redis-cache.test.ts) and decoupled
 * from `ioredis`' full typings.
 */
export interface RedisClientLike {
  /** GET key → value or null. */
  get(key: string): Promise<string | null>;
  /** SET key value PX ttlMs — set with a millisecond expiry. */
  set(key: string, value: string, mode: 'PX', ttlMs: number): Promise<unknown>;
  /** DEL key → number of keys removed. */
  del(key: string): Promise<number>;
  /** Remove keys matching a glob pattern under the adapter's namespace. */
  keys(pattern: string): Promise<string[]>;
  /** Close the connection. */
  quit(): Promise<unknown>;
}

/** Constructor shape of `ioredis`' default export (`new Redis(url)`). */
export interface RedisCtor {
  new (connection?: string | Record<string, unknown>): RedisClientLike;
}

export interface RedisCacheOptions {
  /**
   * Redis connection string (e.g. `redis://localhost:6379`) or an options
   * object forwarded to the `ioredis` constructor. Ignored when `client`
   * is supplied.
   */
  connection?: string | Record<string, unknown>;
  /**
   * Pre-built client. When provided, the dynamic `ioredis` import is
   * skipped entirely — lets consumers manage their own connection.
   */
  client?: RedisClientLike;
  /** Override the dynamic `ioredis` import — used by tests to inject a stub. */
  redisCtor?: RedisCtor;
  /**
   * Key namespace prefix so the dashboard's keys don't collide with other
   * tenants of a shared Redis. Default `erne:dash:`.
   */
  keyPrefix?: string;
  /** Default TTL in ms applied when `set` omits `ttlMs`. Default 5_000. */
  defaultTtlMs?: number;
}

const DEFAULT_KEY_PREFIX = 'erne:dash:';
const DEFAULT_TTL_MS = 5_000;

/**
 * Resolve the `ioredis` module lazily. Returns null when the package isn't
 * installed — the factory throws a helpful error in that case.
 */
async function loadIoredis(): Promise<RedisCtor | null> {
  try {
    // Hide the specifier from the static build graph (same trick as the
    // better-queue adapter) so `tsc` / bundlers don't try to resolve an
    // optional dep at build time. Runtime dynamic import is what we want.
    const importer = new Function('s', 'return import(s)') as (s: string) => Promise<unknown>;
    const mod = (await importer('ioredis')) as { default?: RedisCtor } & RedisCtor;
    return mod.default ?? (mod as unknown as RedisCtor);
  } catch {
    return null;
  }
}

/**
 * Build a RedisCacheAdapter. Async because `ioredis` loads via dynamic
 * import. Throws with an install hint when the peer is missing — exactly
 * like `createBetterQueueAdapter`.
 */
export async function createRedisCache(options: RedisCacheOptions = {}): Promise<RedisCacheAdapter> {
  if (options.client) {
    return new RedisCacheAdapter(options.client, options);
  }
  const ctor = options.redisCtor ?? (await loadIoredis());
  if (!ctor) {
    throw new Error(
      '[@erne/monitor-dashboard-server] The `ioredis` package is not installed. ' +
        'Either install it (`npm install ioredis`) or use the default in-memory ' +
        'cache via `options.cache` (or `cache: false` to disable caching).',
    );
  }
  const client = new ctor(options.connection);
  return new RedisCacheAdapter(client, options);
}

export class RedisCacheAdapter implements ICache {
  private readonly client: RedisClientLike;
  private readonly keyPrefix: string;
  private readonly defaultTtlMs: number;

  private stat_hits = 0;
  private stat_misses = 0;
  private stat_sets = 0;
  private stat_deletes = 0;

  constructor(client: RedisClientLike, options: RedisCacheOptions = {}) {
    this.client = client;
    this.keyPrefix = options.keyPrefix ?? DEFAULT_KEY_PREFIX;
    this.defaultTtlMs = options.defaultTtlMs ?? DEFAULT_TTL_MS;
  }

  async get<T = unknown>(key: string): Promise<T | undefined> {
    const raw = await this.client.get(this.namespaced(key));
    if (raw === null || raw === undefined) {
      this.stat_misses += 1;
      return undefined;
    }
    this.stat_hits += 1;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // A corrupt / non-JSON value is treated as a miss rather than
      // throwing into the request path.
      this.stat_misses += 1;
      return undefined;
    }
  }

  async set<T = unknown>(key: string, value: T, ttlMs?: number): Promise<void> {
    const ttl = ttlMs ?? this.defaultTtlMs;
    this.stat_sets += 1;
    if (ttl <= 0) {
      // Non-positive TTL → don't store; clear any prior value.
      await this.client.del(this.namespaced(key));
      return;
    }
    await this.client.set(this.namespaced(key), JSON.stringify(value), 'PX', ttl);
  }

  async del(key: string): Promise<boolean> {
    const removed = await this.client.del(this.namespaced(key));
    if (removed > 0) this.stat_deletes += 1;
    return removed > 0;
  }

  async clear(): Promise<void> {
    // `keys` returns already-namespaced keys, so delete via the raw
    // client (not our del(), which would re-namespace and double-prefix).
    const keys = await this.client.keys(`${this.keyPrefix}*`);
    for (const k of keys) {
      await this.client.del(k);
    }
  }

  stats(): CacheStats {
    return {
      hits: this.stat_hits,
      misses: this.stat_misses,
      sets: this.stat_sets,
      deletes: this.stat_deletes,
      // Eviction / expiry are managed by Redis, not observable here.
      evictions: 0,
      expirations: 0,
      // Best-effort: a remote count would require an extra round trip on
      // every stats() call, which isn't worth it for an observability read.
      size: -1,
    };
  }

  async close(): Promise<void> {
    await this.client.quit();
  }

  private namespaced(key: string): string {
    return `${this.keyPrefix}${key}`;
  }
}
