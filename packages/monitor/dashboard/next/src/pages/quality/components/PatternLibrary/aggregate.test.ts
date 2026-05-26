import { describe, expect, test } from 'vitest';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { BUILT_IN_PATTERNS } from './catalog';
import { buildPatternRows, computeDecayedConfidence } from './aggregate';

const NOW = 1_770_000_000_000;
const DAY = 86_400_000;

function ev(type: string, timestamp: number, payload: Record<string, unknown>): EventRecord {
  return {
    id: `e-${Math.random().toString(36).slice(2, 8)}`,
    type,
    severity: 'info',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload,
  };
}

function group(partial: Partial<CrashGroupRecord>): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp',
    message: partial.message ?? 'msg',
    firstSeen: partial.firstSeen ?? 0,
    lastSeen: partial.lastSeen ?? 0,
    eventCount: partial.eventCount ?? 1,
    sessionCount: 1,
    status: partial.status ?? 'new',
    ...partial,
  };
}

describe('buildPatternRows', () => {
  test('includes every built-in pattern even when nothing has matched yet', () => {
    const rows = buildPatternRows([], [], { now: NOW });
    expect(rows).toHaveLength(BUILT_IN_PATTERNS.length);
    const unused = rows.find((r) => r.id === 'cannot-read-property');
    expect(unused?.matchCount).toBe(0);
    expect(unused?.confidence).toBe(0);
    expect(unused?.learned).toBe(false);
  });

  test('merges pattern_match events + group.aiSuggestion.pattern, sorts by matchCount', () => {
    const events = [
      ev('pattern_match', NOW - DAY, { pattern: 'render-storm', confidence: 0.82 }),
      ev('pattern_match', NOW - 2 * DAY, { pattern: 'render-storm', confidence: 0.9 }),
      ev('pattern_match', NOW - 10 * DAY, { pattern: 'oversized-image', confidence: 0.5 }),
    ];
    const groups = [
      group({
        fingerprint: 'a',
        lastSeen: NOW - 3 * DAY,
        aiSuggestion: { pattern: 'render-storm', confidence: 0.88 },
      }),
    ];
    const rows = buildPatternRows(events, groups, { now: NOW, halfLifeMs: 7 * DAY });
    const first = rows[0]!;
    expect(first.id).toBe('render-storm');
    expect(first.matchCount).toBe(3);
    expect(first.confidence).toBeGreaterThan(0.5);
    const oversized = rows.find((r) => r.id === 'oversized-image')!;
    expect(oversized.matchCount).toBe(1);
    // 10 days > half-life → confidence should decay materially
    expect(oversized.confidence).toBeLessThan(0.4);
  });

  test('records pattern_match ids missing from the catalog as learned rows (SDK shipped a new pattern)', () => {
    const events = [ev('pattern_match', NOW, { pattern: 'brand-new-pattern', confidence: 0.66 })];
    const rows = buildPatternRows(events, [], { now: NOW });
    const learned = rows.find((r) => r.id === 'brand-new-pattern');
    expect(learned).toBeDefined();
    expect(learned?.learned).toBe(true);
  });
});

describe('computeDecayedConfidence', () => {
  test('returns 0 when the pattern was never matched', () => {
    expect(computeDecayedConfidence(0.9, null, NOW, DAY)).toBe(0);
  });

  test('halves the observed confidence after one half-life, quarters after two', () => {
    expect(computeDecayedConfidence(1, NOW - DAY, NOW, DAY)).toBeCloseTo(0.5);
    expect(computeDecayedConfidence(1, NOW - 2 * DAY, NOW, DAY)).toBeCloseTo(0.25);
  });
});
