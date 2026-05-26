// Task 117.51 — InMemoryCache tests.

import { describe, expect, test } from 'vitest';
import { InMemoryCache } from './in-memory-cache.js';

describe('InMemoryCache — get/set', () => {
  test('round-trips a value', async () => {
    const cache = new InMemoryCache();
    await cache.set('k', { a: 1 });
    expect(await cache.get('k')).toEqual({ a: 1 });
  });

  test('missing key resolves to undefined and counts a miss', async () => {
    const cache = new InMemoryCache();
    expect(await cache.get('nope')).toBeUndefined();
    expect(cache.stats().misses).toBe(1);
    expect(cache.stats().hits).toBe(0);
  });

  test('overwrite replaces the value', async () => {
    const cache = new InMemoryCache();
    await cache.set('k', 1);
    await cache.set('k', 2);
    expect(await cache.get('k')).toBe(2);
    expect(cache.stats().size).toBe(1);
  });
});

describe('InMemoryCache — TTL expiry', () => {
  test('an entry past its TTL reads as a miss and is reaped', async () => {
    let clock = 1000;
    const cache = new InMemoryCache({ now: () => clock });
    await cache.set('k', 'v', 500);
    clock = 1400; // within TTL
    expect(await cache.get('k')).toBe('v');
    clock = 1600; // past TTL (expiresAt = 1500)
    expect(await cache.get('k')).toBeUndefined();
    expect(cache.stats().expirations).toBe(1);
    expect(cache.stats().size).toBe(0);
  });

  test('default TTL applies when ttlMs omitted', async () => {
    let clock = 0;
    const cache = new InMemoryCache({ now: () => clock, defaultTtlMs: 100 });
    await cache.set('k', 'v');
    clock = 99;
    expect(await cache.get('k')).toBe('v');
    clock = 101;
    expect(await cache.get('k')).toBeUndefined();
  });

  test('non-positive TTL stores nothing and clears any prior value', async () => {
    const cache = new InMemoryCache();
    await cache.set('k', 'old');
    await cache.set('k', 'new', 0);
    expect(await cache.get('k')).toBeUndefined();
    expect(cache.stats().size).toBe(0);
  });
});

describe('InMemoryCache — size cap', () => {
  test('FIFO-evicts the oldest entry past maxEntries', async () => {
    const cache = new InMemoryCache({ maxEntries: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('c', 3); // evicts 'a'
    expect(await cache.get('a')).toBeUndefined();
    expect(await cache.get('b')).toBe(2);
    expect(await cache.get('c')).toBe(3);
    expect(cache.stats().evictions).toBe(1);
  });

  test('overwriting a key refreshes its eviction position', async () => {
    const cache = new InMemoryCache({ maxEntries: 2 });
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.set('a', 11); // a becomes youngest
    await cache.set('c', 3); // evicts 'b' (now oldest), not 'a'
    expect(await cache.get('a')).toBe(11);
    expect(await cache.get('b')).toBeUndefined();
    expect(await cache.get('c')).toBe(3);
  });
});

describe('InMemoryCache — del / clear / stats', () => {
  test('del removes a present key and reports it', async () => {
    const cache = new InMemoryCache();
    await cache.set('k', 'v');
    expect(await cache.del('k')).toBe(true);
    expect(await cache.del('k')).toBe(false);
    expect(cache.stats().deletes).toBe(1);
    expect(await cache.get('k')).toBeUndefined();
  });

  test('clear drops every entry', async () => {
    const cache = new InMemoryCache();
    await cache.set('a', 1);
    await cache.set('b', 2);
    await cache.clear();
    expect(cache.stats().size).toBe(0);
    expect(await cache.get('a')).toBeUndefined();
  });

  test('stats tallies hits, misses, sets', async () => {
    const cache = new InMemoryCache();
    await cache.set('k', 'v');
    await cache.get('k'); // hit
    await cache.get('k'); // hit
    await cache.get('x'); // miss
    const s = cache.stats();
    expect(s.hits).toBe(2);
    expect(s.misses).toBe(1);
    expect(s.sets).toBe(1);
    expect(s.size).toBe(1);
  });
});
