import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import {
  aggregateSuspense,
  SLOW_STALL_P95_MS,
  type SuspenseEventPayload,
} from './aggregate';

let seq = 0;

/** Build a canonical `type: 'suspense'` event record (fields flattened into payload). */
function suspense(payload: SuspenseEventPayload): EventRecord {
  seq += 1;
  return {
    id: `suspense-${seq}`,
    type: 'suspense',
    severity: 'info',
    sessionId: 's1',
    timestamp: 1_770_000_000_000 + seq,
    receivedAt: 1_770_000_000_000 + seq,
    payload: payload as unknown as Record<string, unknown>,
  };
}

describe('aggregateSuspense', () => {
  test('returns an empty summary for no events', () => {
    const summary = aggregateSuspense([]);
    expect(summary.boundaries).toEqual([]);
    expect(summary.boundaryCount).toBe(0);
    expect(summary.totalStalls).toBe(0);
  });

  test('ignores non-suspense events', () => {
    const events: EventRecord[] = [
      {
        id: 'n1',
        type: 'network',
        severity: 'info',
        sessionId: 's1',
        timestamp: 1,
        receivedAt: 1,
        payload: { boundaryName: 'Feed', fallbackDurationMs: 500, outcome: 'resolved' },
      },
    ];
    expect(aggregateSuspense(events).boundaries).toEqual([]);
  });

  test('ignores custom envelope events (canonical shape is flattened type suspense)', () => {
    const event: EventRecord = {
      id: 'c1',
      type: 'custom',
      severity: 'info',
      sessionId: 's1',
      timestamp: 1,
      receivedAt: 1,
      payload: {
        name: 'suspense',
        attributes: { boundaryName: 'Feed', fallbackDurationMs: 500, outcome: 'resolved' },
      },
    };
    expect(aggregateSuspense([event]).boundaries).toEqual([]);
  });

  test('reads the canonical flat shape (type suspense, fields on payload)', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 800, depth: 1, outcome: 'resolved' }),
    ]);
    expect(summary.boundaryCount).toBe(1);
    expect(summary.boundaries[0]?.boundary).toBe('Feed');
    expect(summary.boundaries[0]?.stalls).toBe(1);
    expect(summary.boundaries[0]?.maxDepth).toBe(1);
  });

  test('aggregates stall durations into avg, p95, longest, and count', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 100, outcome: 'resolved' }),
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 200, outcome: 'resolved' }),
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 300, outcome: 'resolved' }),
    ]);

    expect(summary.boundaryCount).toBe(1);
    expect(summary.totalStalls).toBe(3);
    const feed = summary.boundaries[0]!;
    expect(feed.boundary).toBe('Feed');
    expect(feed.stalls).toBe(3);
    expect(feed.avgMs).toBe(200);
    expect(feed.longestMs).toBe(300);
    // Linear-interp p95 over [100,200,300] → 290.
    expect(feed.p95Ms).toBeCloseTo(290, 5);
  });

  test('groups stalls per boundary', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Header', fallbackDurationMs: 50, outcome: 'resolved' }),
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 60, outcome: 'resolved' }),
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 80, outcome: 'resolved' }),
    ]);
    expect(summary.boundaryCount).toBe(2);
    const names = summary.boundaries.map((b) => b.boundary).sort();
    expect(names).toEqual(['Feed', 'Header']);
  });

  test('tracks the deepest nesting depth per boundary', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Nested', fallbackDurationMs: 10, depth: 1, outcome: 'resolved' }),
      suspense({ boundaryName: 'Nested', fallbackDurationMs: 10, depth: 4, outcome: 'resolved' }),
      suspense({ boundaryName: 'Nested', fallbackDurationMs: 10, depth: 2, outcome: 'resolved' }),
    ]);
    expect(summary.boundaries[0]!.maxDepth).toBe(4);
  });

  test('counts resolved vs errored outcomes and keeps the last error message', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Profile', fallbackDurationMs: 200, outcome: 'resolved' }),
      suspense({
        boundaryName: 'Profile',
        fallbackDurationMs: 300,
        outcome: 'error',
        errorMessage: 'fetch failed',
      }),
      suspense({
        boundaryName: 'Profile',
        fallbackDurationMs: 400,
        outcome: 'error',
        errorMessage: 'timed out',
      }),
    ]);
    const profile = summary.boundaries[0]!;
    expect(profile.stalls).toBe(3);
    expect(profile.resolved).toBe(1);
    expect(profile.errored).toBe(2);
    expect(profile.lastError).toBe('timed out');
    expect(profile.status).toBe('error');
  });

  test('treats a missing outcome as a resolved stall', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 120 }),
    ]);
    const feed = summary.boundaries[0]!;
    expect(feed.resolved).toBe(1);
    expect(feed.errored).toBe(0);
    expect(feed.status).toBe('ok');
  });

  test('flags slow boundaries when p95 crosses the threshold', () => {
    const slow = aggregateSuspense([
      suspense({ boundaryName: 'Slow', fallbackDurationMs: SLOW_STALL_P95_MS, outcome: 'resolved' }),
    ]);
    expect(slow.boundaries[0]!.status).toBe('slow');

    const ok = aggregateSuspense([
      suspense({ boundaryName: 'Fast', fallbackDurationMs: 120, outcome: 'resolved' }),
    ]);
    expect(ok.boundaries[0]!.status).toBe('ok');
  });

  test('errors outrank slowness in the derived status', () => {
    const summary = aggregateSuspense([
      // A very long stall would normally be "slow", but the error wins.
      suspense({
        boundaryName: 'Broken',
        fallbackDurationMs: SLOW_STALL_P95_MS * 2,
        outcome: 'error',
        errorMessage: 'boom',
      }),
    ]);
    expect(summary.boundaries[0]!.status).toBe('error');
  });

  test('orders errored boundaries first, then slowest, then alphabetically', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Beta', fallbackDurationMs: 50, outcome: 'resolved' }),
      suspense({ boundaryName: 'Alpha', fallbackDurationMs: 50, outcome: 'resolved' }),
      suspense({ boundaryName: 'Slowish', fallbackDurationMs: 5000, outcome: 'resolved' }),
      suspense({ boundaryName: 'Crashed', fallbackDurationMs: 10, outcome: 'error' }),
    ]);
    // Crashed (errored) first, then Slowish (highest p95), then Alpha, Beta.
    expect(summary.boundaries.map((b) => b.boundary)).toEqual([
      'Crashed',
      'Slowish',
      'Alpha',
      'Beta',
    ]);
  });

  test('skips malformed payloads and non-finite duration values', () => {
    const summary = aggregateSuspense([
      suspense({ boundaryName: 'Feed', fallbackDurationMs: Number.NaN, outcome: 'resolved' }),
      suspense({ boundaryName: 'Feed', fallbackDurationMs: -5, outcome: 'resolved' }),
      suspense({ boundaryName: 'Feed', fallbackDurationMs: 0, outcome: 'resolved' }),
    ]);
    const feed = summary.boundaries[0]!;
    // All three are still counted as stalls (outcomes), but none contributes timing.
    expect(feed.stalls).toBe(3);
    expect(feed.avgMs).toBe(0);
    expect(feed.p95Ms).toBe(0);
    expect(feed.longestMs).toBe(0);
    expect(feed.status).toBe('ok');
  });

  test('falls back to (anonymous) when boundaryName is missing or empty', () => {
    const summary = aggregateSuspense([
      suspense({ fallbackDurationMs: 30, outcome: 'resolved' }),
      suspense({ boundaryName: '', fallbackDurationMs: 40, outcome: 'resolved' }),
    ]);
    expect(summary.boundaryCount).toBe(1);
    expect(summary.boundaries[0]!.boundary).toBe('(anonymous)');
    expect(summary.boundaries[0]!.stalls).toBe(2);
  });

  test('is deterministic — same input yields identical output', () => {
    const events = [
      suspense({ boundaryName: 'A', fallbackDurationMs: 100, depth: 2, outcome: 'resolved' }),
      suspense({ boundaryName: 'B', fallbackDurationMs: 4000, outcome: 'resolved' }),
      suspense({ boundaryName: 'C', fallbackDurationMs: 10, outcome: 'error', errorMessage: 'x' }),
    ];
    expect(aggregateSuspense(events)).toEqual(aggregateSuspense(events));
  });
});
