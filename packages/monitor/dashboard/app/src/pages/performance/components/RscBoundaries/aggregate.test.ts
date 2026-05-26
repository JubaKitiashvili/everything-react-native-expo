import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import {
  aggregateRscBoundaries,
  SLOW_RENDER_P95_MS,
  type RscEventPayload,
} from './aggregate';

let seq = 0;

/** Build a stored flat `type: 'rsc'` event record (defensive fallback shape). */
function rsc(payload: RscEventPayload): EventRecord {
  seq += 1;
  return {
    id: `rsc-${seq}`,
    type: 'rsc',
    severity: 'info',
    sessionId: 's1',
    timestamp: 1_770_000_000_000 + seq,
    receivedAt: 1_770_000_000_000 + seq,
    payload: payload as unknown as Record<string, unknown>,
  };
}

/** Build the REAL stored shape: a `type: 'custom'` envelope `{ name: 'rsc', attributes }`. */
function rscCustom(payload: RscEventPayload): EventRecord {
  seq += 1;
  return {
    id: `rsc-${seq}`,
    type: 'custom',
    severity: 'info',
    sessionId: 's1',
    timestamp: 1_770_000_000_000 + seq,
    receivedAt: 1_770_000_000_000 + seq,
    payload: { name: 'rsc', attributes: payload } as unknown as Record<string, unknown>,
  };
}

describe('aggregateRscBoundaries', () => {
  test('returns an empty summary for no events', () => {
    const summary = aggregateRscBoundaries([]);
    expect(summary.boundaries).toEqual([]);
    expect(summary.routeCount).toBe(0);
    expect(summary.totalRenders).toBe(0);
  });

  test('ignores non-rsc events', () => {
    const events: EventRecord[] = [
      {
        id: 'n1',
        type: 'network',
        severity: 'info',
        sessionId: 's1',
        timestamp: 1,
        receivedAt: 1,
        payload: { kind: 'server-render', routePath: '/home', serverRenderTimeMs: 50 },
      },
    ];
    expect(aggregateRscBoundaries(events).boundaries).toEqual([]);
  });

  test('reads the real custom-envelope shape (type custom, payload.name === rsc)', () => {
    const summary = aggregateRscBoundaries([
      rscCustom({ kind: 'server-render', routePath: '/feed', serverRenderTimeMs: 120 }),
      rscCustom({ kind: 'payload', routePath: '/feed', payloadSizeBytes: 2048 }),
    ]);
    expect(summary.routeCount).toBe(1);
    expect(summary.boundaries[0]?.route).toBe('/feed');
    expect(summary.boundaries[0]?.renders).toBe(1);
    expect(summary.boundaries[0]?.maxPayloadBytes).toBe(2048);
  });

  test('ignores custom events that are not rsc envelopes', () => {
    const event: EventRecord = {
      id: 'c1',
      type: 'custom',
      severity: 'info',
      sessionId: 's1',
      timestamp: 1,
      receivedAt: 1,
      payload: { name: 'other', attributes: { kind: 'server-render', routePath: '/x' } },
    };
    expect(aggregateRscBoundaries([event]).boundaries).toEqual([]);
  });

  test('aggregates server-render events into avg, p95, and render count', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: 100 }),
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: 200 }),
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: 300 }),
    ]);

    expect(summary.routeCount).toBe(1);
    expect(summary.totalRenders).toBe(3);
    const home = summary.boundaries[0]!;
    expect(home.route).toBe('/home');
    expect(home.renders).toBe(3);
    expect(home.avgMs).toBe(200);
    // Linear-interp p95 over [100,200,300] → 290.
    expect(home.p95Ms).toBeCloseTo(290, 5);
  });

  test('groups events per route', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: 50 }),
      rsc({ kind: 'server-render', routePath: '/feed', serverRenderTimeMs: 60 }),
      rsc({ kind: 'server-render', routePath: '/feed', serverRenderTimeMs: 80 }),
    ]);
    expect(summary.routeCount).toBe(2);
    const routes = summary.boundaries.map((b) => b.route).sort();
    expect(routes).toEqual(['/feed', '/home']);
  });

  test('tracks the largest payload size per route', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'payload', routePath: '/details', payloadSizeBytes: 4096 }),
      rsc({ kind: 'payload', routePath: '/details', payloadSizeBytes: 8192 }),
      rsc({ kind: 'payload', routePath: '/details', payloadSizeBytes: 1024 }),
    ]);
    expect(summary.boundaries[0]!.maxPayloadBytes).toBe(8192);
  });

  test('computes the cache hit ratio across cache-status events', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'cache-status', routePath: '/cached', cacheHit: true }),
      rsc({ kind: 'cache-status', routePath: '/cached', cacheHit: true }),
      rsc({ kind: 'cache-status', routePath: '/cached', cacheHit: true }),
      rsc({ kind: 'cache-status', routePath: '/cached', cacheHit: false }),
    ]);
    const cached = summary.boundaries[0]!;
    expect(cached.cacheSamples).toBe(4);
    expect(cached.cacheHitRatio).toBeCloseTo(0.75, 5);
  });

  test('averages reload durations and counts reloads', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'reload', routePath: '/refresh', reloadDurationMs: 200 }),
      rsc({ kind: 'reload', routePath: '/refresh', reloadDurationMs: 400 }),
    ]);
    const refresh = summary.boundaries[0]!;
    expect(refresh.reloads).toBe(2);
    expect(refresh.avgReloadMs).toBe(300);
  });

  test('marks a boundary streaming while chunks are outstanding', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'streaming-chunk', routePath: '/stream', chunkIndex: 1, chunkCount: 5 }),
    ]);
    const stream = summary.boundaries[0]!;
    expect(stream.isStreaming).toBe(true);
    expect(stream.chunksReceived).toBe(2);
    expect(stream.chunkTotal).toBe(5);
    expect(stream.status).toBe('streaming');
  });

  test('clears streaming once the final chunk arrives', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'streaming-chunk', routePath: '/stream', chunkIndex: 0, chunkCount: 3 }),
      rsc({ kind: 'streaming-chunk', routePath: '/stream', chunkIndex: 2, chunkCount: 3 }),
    ]);
    const stream = summary.boundaries[0]!;
    expect(stream.isStreaming).toBe(false);
    expect(stream.chunksReceived).toBe(3);
  });

  test('flags slow boundaries when p95 crosses the threshold', () => {
    const slow = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/slow', serverRenderTimeMs: SLOW_RENDER_P95_MS }),
    ]);
    expect(slow.boundaries[0]!.status).toBe('slow');

    const ok = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/fast', serverRenderTimeMs: 20 }),
    ]);
    expect(ok.boundaries[0]!.status).toBe('ok');
  });

  test('orders boundaries slowest-first then alphabetically', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/b', serverRenderTimeMs: 50 }),
      rsc({ kind: 'server-render', routePath: '/a', serverRenderTimeMs: 50 }),
      rsc({ kind: 'server-render', routePath: '/slow', serverRenderTimeMs: 500 }),
    ]);
    expect(summary.boundaries.map((b) => b.route)).toEqual(['/slow', '/a', '/b']);
  });

  test('merges all event kinds for one route into a single boundary', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: 120 }),
      rsc({ kind: 'payload', routePath: '/home', payloadSizeBytes: 2048 }),
      rsc({ kind: 'cache-status', routePath: '/home', cacheHit: true }),
      rsc({ kind: 'reload', routePath: '/home', reloadDurationMs: 90 }),
      rsc({ kind: 'streaming-chunk', routePath: '/home', chunkIndex: 2, chunkCount: 3 }),
    ]);
    expect(summary.routeCount).toBe(1);
    const home = summary.boundaries[0]!;
    expect(home.renders).toBe(1);
    expect(home.maxPayloadBytes).toBe(2048);
    expect(home.cacheHitRatio).toBe(1);
    expect(home.reloads).toBe(1);
    expect(home.isStreaming).toBe(false);
  });

  test('skips malformed payloads and non-finite values', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: Number.NaN }),
      rsc({ kind: 'server-render', routePath: '/home', serverRenderTimeMs: -5 }),
      rsc({ kind: 'payload', routePath: '/home', payloadSizeBytes: 0 }),
      rsc({ kind: 'cache-status', routePath: '/home' }),
    ]);
    const home = summary.boundaries[0]!;
    expect(home.renders).toBe(0);
    expect(home.avgMs).toBe(0);
    expect(home.maxPayloadBytes).toBe(0);
    expect(home.cacheSamples).toBe(0);
    expect(home.status).toBe('ok');
  });

  test('falls back to (unknown) when routePath is missing', () => {
    const summary = aggregateRscBoundaries([
      rsc({ kind: 'server-render', serverRenderTimeMs: 30 }),
    ]);
    expect(summary.boundaries[0]!.route).toBe('(unknown)');
  });
});
