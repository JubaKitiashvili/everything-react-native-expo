/**
 * Source map resolver — parses source maps and resolves
 * { file, line, column } to original source locations.
 * Uses an LRU cache to avoid re-parsing frequently accessed maps.
 */

import { createLRUCache, type LRUCache, type LRUCacheConfig } from './cache';

// ────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────

export interface OriginalPosition {
  readonly source: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly name: string | null;
}

export interface GeneratedPosition {
  readonly file: string;
  readonly line: number;
  readonly column: number;
}

/** Abstract source map consumer — matches the `source-map` library interface. */
export interface SourceMapConsumer {
  originalPositionFor(generated: { line: number; column: number }): OriginalPosition;
  destroy(): void;
}

/** Factory to create a source map consumer from raw JSON. */
export interface SourceMapConsumerFactory {
  create(rawSourceMap: string): Promise<SourceMapConsumer>;
  /** Estimate memory size of a parsed source map (bytes). */
  estimateSize(rawSourceMap: string): number;
}

/** Storage for fetching raw source map content. */
export interface SourceMapStorage {
  fetch(mapUrl: string): Promise<string | null>;
}

// ────────────────────────────────────────────────────────────
// Resolver
// ────────────────────────────────────────────────────────────

export interface SourceMapResolver {
  resolve(
    mapUrl: string,
    position: GeneratedPosition,
  ): Promise<OriginalPosition | null>;
  readonly cacheStats: ReturnType<LRUCache<SourceMapConsumer>['stats'] extends infer S ? () => S : never>;
}

export interface SourceMapResolverConfig {
  readonly cache?: Partial<LRUCacheConfig>;
}

export const createSourceMapResolver = (deps: {
  readonly consumerFactory: SourceMapConsumerFactory;
  readonly storage: SourceMapStorage;
  readonly config?: SourceMapResolverConfig;
}): SourceMapResolver => {
  const cache: LRUCache<SourceMapConsumer> = createLRUCache<SourceMapConsumer>(
    deps.config?.cache ?? { maxEntries: 100, maxSizeBytes: 500 * 1024 * 1024 },
  );

  // Track in-flight parses to avoid double-loading
  const inflight = new Map<string, Promise<SourceMapConsumer | null>>();

  const loadConsumer = async (mapUrl: string): Promise<SourceMapConsumer | null> => {
    // Check cache first
    const cached = cache.get(mapUrl);
    if (cached) return cached;

    // Check if already loading
    const existing = inflight.get(mapUrl);
    if (existing) return existing;

    const promise = (async (): Promise<SourceMapConsumer | null> => {
      try {
        const raw = await deps.storage.fetch(mapUrl);
        if (!raw) return null;

        const consumer = await deps.consumerFactory.create(raw);
        const size = deps.consumerFactory.estimateSize(raw);
        cache.set(mapUrl, consumer, size);
        return consumer;
      } finally {
        inflight.delete(mapUrl);
      }
    })();

    inflight.set(mapUrl, promise);
    return promise;
  };

  const resolve = async (
    mapUrl: string,
    position: GeneratedPosition,
  ): Promise<OriginalPosition | null> => {
    const consumer = await loadConsumer(mapUrl);
    if (!consumer) return null;

    const result = consumer.originalPositionFor({
      line: position.line,
      column: position.column,
    });

    // If source-map returns all nulls, the position wasn't found
    if (!result.source && result.line === null && result.column === null) {
      return null;
    }

    return result;
  };

  return {
    resolve,
    get cacheStats() {
      return cache.stats;
    },
  };
};
