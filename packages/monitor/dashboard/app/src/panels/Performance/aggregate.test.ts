import { describe, expect, test } from 'vitest';
import type { EventRecord } from '../../shared/api/types';
import {
  buildFabricHistogram,
  extractFpsSeries,
  extractResourceSeries,
  extractStartupPhases,
} from './aggregate';

function ev(
  type: string,
  timestamp: number,
  payload: Record<string, unknown>,
  id = `e-${Math.random().toString(36).slice(2, 8)}`,
): EventRecord {
  return {
    id,
    type,
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
  };
}

describe('extractFpsSeries', () => {
  test('keeps only dual_thread_fps events with finite samples, sorted ascending', () => {
    const events = [
      ev('dual_thread_fps', 2, { jsThread: 55, uiThread: 58 }),
      ev('custom', 3, {}),
      ev('dual_thread_fps', 1, { jsThread: 60, uiThread: 60 }),
      ev('dual_thread_fps', 4, { jsThread: Number.NaN, uiThread: 'junk' }),
      ev('dual_thread_fps', 5, { jsThread: 59 }),
    ];
    const series = extractFpsSeries(events);
    expect(series.timestamps).toEqual([1, 2, 5]);
    expect(series.jsThread).toEqual([60, 55, 59]);
    expect(series.uiThread).toEqual([60, 58, 0]);
  });
});

describe('extractResourceSeries', () => {
  test('converts memory bytes to MB and keeps only native_metrics samples', () => {
    const events = [
      ev('native_metrics', 100, {
        cpuUsagePercent: 18,
        memoryUsedBytes: 300 * 1024 * 1024,
      }),
      ev('native_metrics', 50, {
        cpuUsagePercent: 12,
        memoryUsedBytes: 200 * 1024 * 1024,
      }),
      ev('native_metrics', 25, { cpuUsagePercent: null, memoryUsedBytes: null }),
      ev('dual_thread_fps', 60, { jsThread: 60, uiThread: 60 }),
    ];
    const series = extractResourceSeries(events);
    expect(series.timestamps).toEqual([50, 100]);
    expect(series.cpuPercent).toEqual([12, 18]);
    expect(series.memoryMb).toEqual([200, 300]);
  });
});

describe('buildFabricHistogram', () => {
  test('bucketises commit durations into the standard frame-budget ranges', () => {
    const events = [
      ev('fabric_commit', 1, { durationMs: 4 }),
      ev('fabric_commit', 2, { durationMs: 10 }),
      ev('fabric_commit', 3, { durationMs: 17 }),
      ev('fabric_commit', 4, { durationMs: 60 }),
      ev('fabric_commit', 5, { durationMs: 400 }),
      ev('custom', 6, {}),
    ];
    const buckets = buildFabricHistogram(events);
    expect(buckets.map((b) => b.count)).toEqual([1, 1, 1, 0, 1, 0, 1]);
    expect(buckets[0]?.label).toBe('0–8 ms');
    expect(buckets[buckets.length - 1]?.label).toBe('250+ ms');
  });

  test('drops invalid durations rather than bucketising them into 0', () => {
    const events = [
      ev('fabric_commit', 1, { durationMs: -5 }),
      ev('fabric_commit', 2, { durationMs: 'bad' }),
      ev('fabric_commit', 3, {}),
      ev('fabric_commit', 4, { durationMs: 12 }),
    ];
    const buckets = buildFabricHistogram(events);
    expect(buckets.map((b) => b.count)).toEqual([0, 1, 0, 0, 0, 0, 0]);
  });
});

describe('extractStartupPhases', () => {
  test('keeps only the freshest cold/warm/hot record and renders them in canonical order', () => {
    const phases = [
      { label: 'native-init', startMs: 0, durationMs: 200 },
      { label: 'js-bundle', startMs: 200, durationMs: 500 },
    ];
    const events = [
      ev('startup', 1, { kind: 'cold', totalMs: 800, phases }),
      ev('startup', 2, { kind: 'cold', totalMs: 700, phases }), // newer wins
      ev('startup', 3, { kind: 'warm', totalMs: 400, phases }),
      ev('startup', 4, { kind: 'invalid', totalMs: 99, phases }),
    ];
    const out = extractStartupPhases(events);
    expect(out.map((r) => r.kind)).toEqual(['cold', 'warm']);
    expect(out[0]?.totalMs).toBe(700);
    expect(out[0]?.phases).toHaveLength(2);
  });
});
