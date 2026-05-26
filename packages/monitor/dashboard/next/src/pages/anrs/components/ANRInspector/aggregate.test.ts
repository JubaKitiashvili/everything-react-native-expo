import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import {
  bucketByDuration,
  extractAnrInstances,
  extractAnrs,
  findInstance,
  formatDuration,
  groupByFingerprint,
  recurrenceBins,
  topScreens,
} from './aggregate';
import type { AnrInstance } from './aggregate';

function ev(
  type: string,
  timestamp: number,
  payload: Record<string, unknown>,
  screen?: string,
  id = `e-${Math.random().toString(36).slice(2, 8)}`,
): EventRecord {
  return {
    id,
    type,
    severity: 'warning',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
    ...(screen !== undefined ? { screen } : {}),
  };
}

describe('extractAnrs', () => {
  test('keeps anr + native_anr events, drops anything without a positive finite durationMs, orders newest-first', () => {
    const events = [
      ev(
        'anr',
        100,
        { durationMs: 6_000, stack: 'Error\n    at RenderLoop (App.tsx:1:1)' },
        'Home',
        'a',
      ),
      ev('custom', 101, { durationMs: 5_000 }),
      ev('anr', 50, { durationMs: 0 }),
      ev('anr', 200, { durationMs: 'bad' }),
      ev('native_anr', 150, { durationMs: 12_000, stack: '' }, 'Settings', 'b'),
    ];
    const out = extractAnrs(events);
    expect(out.map((r) => r.id)).toEqual(['b', 'a']);
    expect(out[0]?.stackHead).toBe('<native ANR>');
    expect(out[1]?.stackHead).toBe('at RenderLoop (App.tsx:1:1)');
    expect(out[0]?.screen).toBe('Settings');
    expect(out[1]?.screen).toBe('Home');
  });
});

describe('bucketByDuration', () => {
  test('places each ANR into the right frame-budget ladder bucket', () => {
    const records = [
      { id: '1', timestamp: 1, durationMs: 2_500, stackHead: '', screen: null, sessionId: 's1' },
      { id: '2', timestamp: 2, durationMs: 5_000, stackHead: '', screen: null, sessionId: 's1' },
      { id: '3', timestamp: 3, durationMs: 9_999, stackHead: '', screen: null, sessionId: 's1' },
      { id: '4', timestamp: 4, durationMs: 15_000, stackHead: '', screen: null, sessionId: 's1' },
      { id: '5', timestamp: 5, durationMs: 60_000, stackHead: '', screen: null, sessionId: 's1' },
    ];
    const buckets = bucketByDuration(records);
    expect(buckets.map((b) => b.count)).toEqual([1, 2, 1, 1]);
    expect(buckets[0]?.label).toBe('< 5 s');
    expect(buckets[3]?.label).toBe('20 s+');
  });
});

describe('topScreens', () => {
  test('counts ANRs per screen and sorts by count, tie-break by longest duration, caps at `limit`', () => {
    const base = { id: '', timestamp: 0, stackHead: '', sessionId: 's1' };
    const records = [
      { ...base, id: '1', durationMs: 5_000, screen: 'Home' },
      { ...base, id: '2', durationMs: 12_000, screen: 'Home' },
      { ...base, id: '3', durationMs: 3_000, screen: 'Settings' },
      { ...base, id: '4', durationMs: 7_000, screen: 'Settings' },
      { ...base, id: '5', durationMs: 40_000, screen: 'Report' },
      { ...base, id: '6', durationMs: 8_000, screen: null },
    ];
    const top = topScreens(records, 3);
    expect(top).toHaveLength(3);
    expect(top[0]).toEqual({ screen: 'Home', count: 2, longestMs: 12_000 });
    expect(top[1]).toEqual({ screen: 'Settings', count: 2, longestMs: 7_000 });
    expect(top[2]).toEqual({ screen: 'Report', count: 1, longestMs: 40_000 });
  });

  test('never drops unlabelled ANRs silently — they roll up under `<unknown screen>`', () => {
    const record = {
      id: '1',
      timestamp: 1,
      durationMs: 5_000,
      stackHead: '',
      screen: null,
      sessionId: 's1',
    };
    expect(topScreens([record], 5)).toEqual([
      { screen: '<unknown screen>', count: 1, longestMs: 5_000 },
    ]);
  });
});

describe('recurrenceBins', () => {
  test('distributes records across bins; empty input returns a single zero bin', () => {
    const empty = recurrenceBins([]);
    expect(empty).toHaveLength(1);
    expect(empty[0]?.count).toBe(0);

    const records = [
      { id: '1', timestamp: 0, durationMs: 1, stackHead: '', screen: null, sessionId: 's1' },
      { id: '2', timestamp: 100, durationMs: 1, stackHead: '', screen: null, sessionId: 's1' },
      { id: '3', timestamp: 100, durationMs: 1, stackHead: '', screen: null, sessionId: 's1' },
    ];
    const bins = recurrenceBins(records, { binCount: 4, minTs: 0, maxTs: 100 });
    expect(bins).toHaveLength(4);
    expect(bins[0]?.count).toBe(1);
    expect(bins[3]?.count).toBe(2);
  });
});

describe('formatDuration', () => {
  test('renders ms, one-decimal seconds under 10s, and rounded seconds above', () => {
    expect(formatDuration(450)).toBe('450 ms');
    expect(formatDuration(5_500)).toBe('5.5 s');
    expect(formatDuration(42_000)).toBe('42 s');
  });
});

describe('extractAnrInstances', () => {
  test('preserves the ordering + filtering of extractAnrs and adds full stack frames + fingerprint', () => {
    const events = [
      ev(
        'anr',
        100,
        {
          durationMs: 6_000,
          stack:
            'Error: hung\n    at MainThread (App.tsx:1:1)\n    at Renderer (Renderer.tsx:42:7)',
        },
        'Home',
        'a',
      ),
      ev('native_anr', 150, { durationMs: 12_000, stack: '' }, 'Settings', 'b'),
    ];
    const out = extractAnrInstances(events);
    expect(out.map((i) => i.id)).toEqual(['b', 'a']);
    expect(out[0]?.kind).toBe('native_anr');
    expect(out[0]?.stackFrames).toEqual([]);
    expect(out[1]?.kind).toBe('anr');
    expect(out[1]?.stackFrames).toEqual([
      'Error: hung',
      'at MainThread (App.tsx:1:1)',
      'at Renderer (Renderer.tsx:42:7)',
    ]);
    expect(out[1]?.fingerprint.length).toBeGreaterThan(0);
  });

  test('produces stable fingerprints across line+column drift', () => {
    const a = ev('anr', 1, {
      durationMs: 5_000,
      stack:
        'Error\n    at MainThread (App.tsx:1:1)\n    at Renderer (Renderer.tsx:42:7)\n    at Inner (a.tsx:9:9)',
    });
    const b = ev('anr', 2, {
      durationMs: 5_000,
      stack:
        'Error\n    at MainThread (App.tsx:9:1)\n    at Renderer (Renderer.tsx:99:9)\n    at Inner (a.tsx:55:1)',
    });
    const [fa, fb] = [...extractAnrInstances([a, b])].map((i) => i.fingerprint);
    expect(fa).toBe(fb);
  });
});

describe('findInstance', () => {
  test('returns the matching instance or null', () => {
    const a: AnrInstance = {
      id: 'a',
      timestamp: 1,
      durationMs: 5_000,
      stackHead: 'h',
      screen: null,
      sessionId: 's1',
      stackFrames: [],
      fingerprint: 'f',
      kind: 'anr',
    };
    expect(findInstance([a], 'a')).toBe(a);
    expect(findInstance([a], 'missing')).toBeNull();
    expect(findInstance([], 'a')).toBeNull();
  });
});

describe('groupByFingerprint', () => {
  test('clusters instances and orders them by count then longest duration', () => {
    const make = (id: string, fp: string, dur: number, ts: number): AnrInstance => ({
      id,
      timestamp: ts,
      durationMs: dur,
      stackHead: 'head',
      screen: null,
      sessionId: 's1',
      stackFrames: [],
      fingerprint: fp,
      kind: 'anr',
    });
    const instances = [
      make('a1', 'fpA', 5_000, 1),
      make('a2', 'fpA', 8_000, 2),
      make('b1', 'fpB', 30_000, 3),
    ];
    const out = groupByFingerprint(instances);
    expect(out).toHaveLength(2);
    // fpA has 2 occurrences; comes before fpB (1 occurrence) on count.
    expect(out[0]?.fingerprint).toBe('fpA');
    expect(out[0]?.instances.map((i) => i.id)).toEqual(['a2', 'a1']);
    expect(out[1]?.fingerprint).toBe('fpB');
    expect(out[1]?.longestMs).toBe(30_000);
  });
});
