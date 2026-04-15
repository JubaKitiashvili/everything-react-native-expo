/**
 * Tests for symbolication service, source map resolver, and LRU cache.
 */

import { createLRUCache } from './cache';
import { createSourceMapResolver, type SourceMapConsumer, type SourceMapConsumerFactory, type SourceMapStorage } from './sourceMapResolver';
import { createSymbolicationService, parseStackTrace, type SymbolicationRequest } from './service';
import type { DatabaseClient } from '../db/schema';

// ────────────────────────────────────────────────────────────
// LRU Cache tests
// ────────────────────────────────────────────────────────────

describe('LRUCache', () => {
  test('stores and retrieves values', () => {
    const cache = createLRUCache<string>({ maxEntries: 10, maxSizeBytes: 1024 });
    cache.set('a', 'value-a', 10);
    expect(cache.get('a')).toBe('value-a');
  });

  test('returns undefined for missing keys', () => {
    const cache = createLRUCache<string>();
    expect(cache.get('missing')).toBeUndefined();
  });

  test('tracks hits and misses', () => {
    const cache = createLRUCache<string>();
    cache.set('a', 'val', 10);
    cache.get('a'); // hit
    cache.get('b'); // miss

    expect(cache.stats.hits).toBe(1);
    expect(cache.stats.misses).toBe(1);
  });

  test('evicts LRU entry when maxEntries exceeded', () => {
    const cache = createLRUCache<string>({ maxEntries: 2, maxSizeBytes: 1024 * 1024 });
    cache.set('a', '1', 10);
    cache.set('b', '2', 10);
    cache.set('c', '3', 10); // should evict 'a'

    expect(cache.has('a')).toBe(false);
    expect(cache.has('b')).toBe(true);
    expect(cache.has('c')).toBe(true);
    expect(cache.stats.entries).toBe(2);
  });

  test('evicts LRU entry when maxSizeBytes exceeded', () => {
    const cache = createLRUCache<string>({ maxEntries: 100, maxSizeBytes: 25 });
    cache.set('a', '1', 10);
    cache.set('b', '2', 10);
    // Total is 20, adding 10 more would be 30 > 25, so evict 'a'
    cache.set('c', '3', 10);

    expect(cache.has('a')).toBe(false);
    expect(cache.stats.totalSizeBytes).toBeLessThanOrEqual(25);
  });

  test('get promotes entry to most-recently-used', () => {
    const cache = createLRUCache<string>({ maxEntries: 2, maxSizeBytes: 1024 * 1024 });
    cache.set('a', '1', 10);
    cache.set('b', '2', 10);
    cache.get('a'); // promote 'a' — now 'b' is LRU
    cache.set('c', '3', 10); // should evict 'b', not 'a'

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  test('updates existing entry in place', () => {
    const cache = createLRUCache<string>({ maxEntries: 10, maxSizeBytes: 1024 });
    cache.set('a', 'v1', 100);
    cache.set('a', 'v2', 50);

    expect(cache.get('a')).toBe('v2');
    expect(cache.stats.totalSizeBytes).toBe(50);
    expect(cache.stats.entries).toBe(1);
  });

  test('delete removes entry and adjusts size', () => {
    const cache = createLRUCache<string>();
    cache.set('a', 'val', 100);
    expect(cache.delete('a')).toBe(true);
    expect(cache.has('a')).toBe(false);
    expect(cache.stats.totalSizeBytes).toBe(0);
  });

  test('delete returns false for missing key', () => {
    const cache = createLRUCache<string>();
    expect(cache.delete('missing')).toBe(false);
  });

  test('clear removes all entries', () => {
    const cache = createLRUCache<string>();
    cache.set('a', '1', 10);
    cache.set('b', '2', 10);
    cache.clear();

    expect(cache.stats.entries).toBe(0);
    expect(cache.stats.totalSizeBytes).toBe(0);
  });
});

// ────────────────────────────────────────────────────────────
// Source Map Resolver tests
// ────────────────────────────────────────────────────────────

describe('SourceMapResolver', () => {
  const fakeConsumer: SourceMapConsumer = {
    originalPositionFor: ({ line, column }) => ({
      source: 'src/HomeScreen.tsx',
      line,
      column,
      name: 'render',
    }),
    destroy: () => {},
  };

  const fakeFactory: SourceMapConsumerFactory = {
    create: async () => fakeConsumer,
    estimateSize: (raw) => raw.length * 2,
  };

  const fakeStorage: SourceMapStorage = {
    fetch: async (url) => {
      if (url === 'https://maps.example.com/bundle.js.map') {
        return '{"version":3,"sources":["src/HomeScreen.tsx"]}';
      }
      return null;
    },
  };

  test('resolves a valid position through source map', async () => {
    const resolver = createSourceMapResolver({
      consumerFactory: fakeFactory,
      storage: fakeStorage,
    });

    const result = await resolver.resolve(
      'https://maps.example.com/bundle.js.map',
      { file: 'bundle.js', line: 42, column: 10 },
    );

    expect(result).not.toBeNull();
    expect(result!.source).toBe('src/HomeScreen.tsx');
    expect(result!.line).toBe(42);
  });

  test('returns null when source map not found', async () => {
    const resolver = createSourceMapResolver({
      consumerFactory: fakeFactory,
      storage: fakeStorage,
    });

    const result = await resolver.resolve(
      'https://maps.example.com/nonexistent.map',
      { file: 'bundle.js', line: 1, column: 0 },
    );

    expect(result).toBeNull();
  });

  test('caches parsed source maps', async () => {
    let fetchCount = 0;
    const countingStorage: SourceMapStorage = {
      fetch: async (url) => {
        fetchCount++;
        return fakeStorage.fetch(url);
      },
    };

    const resolver = createSourceMapResolver({
      consumerFactory: fakeFactory,
      storage: countingStorage,
    });

    const url = 'https://maps.example.com/bundle.js.map';

    await resolver.resolve(url, { file: 'a.js', line: 1, column: 0 });
    await resolver.resolve(url, { file: 'a.js', line: 2, column: 0 });

    // Storage should only be fetched once
    expect(fetchCount).toBe(1);
  });
});

// ────────────────────────────────────────────────────────────
// parseStackTrace tests
// ────────────────────────────────────────────────────────────

describe('parseStackTrace', () => {
  test('parses "at Function (file:line:col)" format', () => {
    const frames = parseStackTrace(
      'Error\n  at HomeScreen.render (bundle.js:42:10)\n  at App (bundle.js:1:0)',
    );
    expect(frames).toHaveLength(2);
    expect(frames[0]!.methodName).toBe('HomeScreen.render');
    expect(frames[0]!.file).toBe('bundle.js');
    expect(frames[0]!.line).toBe(42);
    expect(frames[0]!.column).toBe(10);
  });

  test('parses "at file:line:col" format', () => {
    const frames = parseStackTrace('at bundle.js:100:5');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.methodName).toBeUndefined();
    expect(frames[0]!.file).toBe('bundle.js');
  });

  test('parses bare "file:line:col" format', () => {
    const frames = parseStackTrace('bundle.js:10:20');
    expect(frames).toHaveLength(1);
    expect(frames[0]!.file).toBe('bundle.js');
    expect(frames[0]!.line).toBe(10);
    expect(frames[0]!.column).toBe(20);
  });

  test('ignores non-frame lines', () => {
    const frames = parseStackTrace('Error: something went wrong\n  at foo (bar.js:1:1)');
    expect(frames).toHaveLength(1);
  });

  test('handles empty string', () => {
    const frames = parseStackTrace('');
    expect(frames).toHaveLength(0);
  });
});

// ────────────────────────────────────────────────────────────
// Symbolication Service tests
// ────────────────────────────────────────────────────────────

describe('SymbolicationService', () => {
  const createFakeDb = (mapUrl: string | null): DatabaseClient => ({
    query: async <T>(): Promise<readonly T[]> => {
      if (mapUrl) {
        return [{ map_url: mapUrl }] as unknown as readonly T[];
      }
      return [];
    },
    execute: async () => ({ rowCount: 0 }),
    transaction: async <T>(fn: (c: DatabaseClient) => Promise<T>) => {
      const self: DatabaseClient = {
        query: async <U>(): Promise<readonly U[]> => [],
        execute: async () => ({ rowCount: 0 }),
        transaction: async <U>(inner: (c: DatabaseClient) => Promise<U>) => inner(self),
      };
      return fn(self);
    },
  });

  const fakeResolver = {
    resolve: async (_mapUrl: string, pos: { file: string; line: number; column: number }) => ({
      source: `src/${pos.file}`,
      line: pos.line,
      column: pos.column,
      name: 'originalFn',
    }),
    get cacheStats() {
      return {
        entries: 0,
        totalSizeBytes: 0,
        maxEntries: 100,
        maxSizeBytes: 500 * 1024 * 1024,
        hits: 0,
        misses: 0,
      };
    },
  };

  test('symbolicates stack frames when source map exists', async () => {
    const service = createSymbolicationService({
      db: createFakeDb('https://maps.example.com/bundle.js.map'),
      resolver: fakeResolver,
    });

    const request: SymbolicationRequest = {
      appId: 'app_1',
      bundleId: 'com.example.app',
      appVersion: '1.0.0',
      buildNumber: '42',
      platform: 'ios',
      stackFrames: [
        { file: 'bundle.js', line: 100, column: 5 },
        { file: 'bundle.js', line: 200, column: 10 },
      ],
    };

    const result = await service.symbolicate(request);

    expect(result.sourceMapUrl).toBe('https://maps.example.com/bundle.js.map');
    expect(result.frames).toHaveLength(2);
    expect(result.frames[0]!.resolved).not.toBeNull();
    expect(result.frames[0]!.resolved!.source).toBe('src/bundle.js');
    expect(result.fullySymbolicated).toBe(true);
  });

  test('returns unresolved frames when no source map found', async () => {
    const service = createSymbolicationService({
      db: createFakeDb(null),
      resolver: fakeResolver,
    });

    const request: SymbolicationRequest = {
      appId: 'app_1',
      bundleId: 'com.example.app',
      appVersion: '1.0.0',
      buildNumber: '42',
      platform: 'ios',
      stackFrames: [{ file: 'bundle.js', line: 100, column: 5 }],
    };

    const result = await service.symbolicate(request);

    expect(result.sourceMapUrl).toBeNull();
    expect(result.fullySymbolicated).toBe(false);
    expect(result.frames[0]!.resolved).toBeNull();
  });

  test('marks partially symbolicated when some frames fail', async () => {
    const partialResolver = {
      ...fakeResolver,
      resolve: async (_mapUrl: string, pos: { file: string; line: number; column: number }) => {
        // Only resolve the first frame
        if (pos.line === 100) {
          return { source: 'src/A.tsx', line: 10, column: 0, name: 'fn' };
        }
        return null;
      },
    };

    const service = createSymbolicationService({
      db: createFakeDb('https://maps.example.com/bundle.js.map'),
      resolver: partialResolver,
    });

    const result = await service.symbolicate({
      appId: 'app_1',
      bundleId: 'com.example.app',
      appVersion: '1.0.0',
      buildNumber: '42',
      platform: 'ios',
      stackFrames: [
        { file: 'bundle.js', line: 100, column: 5 },
        { file: 'bundle.js', line: 200, column: 10 },
      ],
    });

    expect(result.fullySymbolicated).toBe(false);
    expect(result.frames[0]!.resolved).not.toBeNull();
    expect(result.frames[1]!.resolved).toBeNull();
  });
});
