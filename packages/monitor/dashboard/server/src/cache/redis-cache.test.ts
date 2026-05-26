// Task 117.51 — RedisCacheAdapter tests.
//
// `ioredis` is an optional peer. Rather than install it, we inject a fake
// client / ctor that mimics the API surface the adapter depends on
// (get / set PX / del / keys / quit) — exactly the pattern the
// BetterQueueAdapter tests use for `better-queue`.

import { describe, expect, test } from 'vitest';
import {
  RedisCacheAdapter,
  createRedisCache,
  type RedisClientLike,
  type RedisCtor,
} from './redis-cache.js';

function makeFakeRedis(): {
  client: RedisClientLike;
  store: Map<string, string>;
  Ctor: RedisCtor;
  ctorCalls: Array<string | Record<string, unknown> | undefined>;
} {
  const store = new Map<string, string>();
  const ctorCalls: Array<string | Record<string, unknown> | undefined> = [];
  const client: RedisClientLike = {
    async get(key) {
      return store.has(key) ? (store.get(key) as string) : null;
    },
    async set(key, value) {
      store.set(key, value);
      return 'OK';
    },
    async del(key) {
      return store.delete(key) ? 1 : 0;
    },
    async keys(pattern) {
      const prefix = pattern.replace(/\*$/, '');
      return [...store.keys()].filter((k) => k.startsWith(prefix));
    },
    async quit() {
      return 'OK';
    },
  };
  const Ctor = class {
    constructor(connection?: string | Record<string, unknown>) {
      ctorCalls.push(connection);
      return client as unknown as InstanceType<RedisCtor>;
    }
  } as unknown as RedisCtor;
  return { client, store, Ctor, ctorCalls };
}

describe('createRedisCache — optional peer', () => {
  test('throws a helpful install hint when ioredis is missing', async () => {
    // Passing an explicit-undefined ctor + no client forces the factory
    // down the "peer missing" path (loadIoredis returns null in test env
    // because ioredis is not installed).
    await expect(createRedisCache({ redisCtor: undefined })).rejects.toThrow(/ioredis/);
  });

  test('uses a provided client without importing ioredis', async () => {
    const { client, store } = makeFakeRedis();
    const cache = await createRedisCache({ client });
    await cache.set('k', { x: 1 });
    expect(store.size).toBe(1);
    expect(await cache.get('k')).toEqual({ x: 1 });
  });

  test('constructs via injected ctor with the connection string', async () => {
    const { Ctor, ctorCalls } = makeFakeRedis();
    const cache = await createRedisCache({ redisCtor: Ctor, connection: 'redis://host:6379' });
    expect(ctorCalls).toEqual(['redis://host:6379']);
    await cache.set('k', 1);
    expect(await cache.get('k')).toBe(1);
  });
});

describe('RedisCacheAdapter — operations', () => {
  test('namespaces keys under the prefix', async () => {
    const { client, store } = makeFakeRedis();
    const cache = new RedisCacheAdapter(client, { keyPrefix: 'p:' });
    await cache.set('groups', [1, 2]);
    expect([...store.keys()]).toEqual(['p:groups']);
    expect(await cache.get('groups')).toEqual([1, 2]);
  });

  test('get of a missing key resolves undefined + counts a miss', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisCacheAdapter(client);
    expect(await cache.get('nope')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
  });

  test('del removes a present key', async () => {
    const { client } = makeFakeRedis();
    const cache = new RedisCacheAdapter(client);
    await cache.set('k', 'v');
    expect(await cache.del('k')).toBe(true);
    expect(await cache.del('k')).toBe(false);
  });

  test('clear drops every namespaced key', async () => {
    const { client, store } = makeFakeRedis();
    const cache = new RedisCacheAdapter(client, { keyPrefix: 'erne:dash:' });
    store.set('other:keep', 'x'); // outside the namespace — must survive
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();
    expect([...store.keys()]).toEqual(['other:keep']);
  });

  test('corrupt JSON value reads as a miss', async () => {
    const { client, store } = makeFakeRedis();
    const cache = new RedisCacheAdapter(client, { keyPrefix: 'erne:dash:' });
    store.set('erne:dash:bad', '{not json');
    expect(await cache.get('bad')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
  });

  test('close calls quit', async () => {
    let quit = 0;
    const { client } = makeFakeRedis();
    const wrapped: RedisClientLike = { ...client, quit: async () => void (quit += 1) };
    const cache = new RedisCacheAdapter(wrapped);
    await cache.close();
    expect(quit).toBe(1);
  });
});
