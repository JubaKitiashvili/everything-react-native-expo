import { describe, expect, test } from 'vitest';
import type { CrashGroupRecord, EventRecord } from '../../shared/api/types';
import {
  computeFixSuccessRate,
  computeMttr,
  extractConfidenceSeries,
  formatMttr,
  formatPercent,
  topPatternHits,
} from './aggregate';

function group(partial: Partial<CrashGroupRecord>): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp',
    message: partial.message ?? 'msg',
    firstSeen: partial.firstSeen ?? 0,
    lastSeen: partial.lastSeen ?? 1_000,
    eventCount: partial.eventCount ?? 1,
    sessionCount: partial.sessionCount ?? 1,
    status: partial.status ?? 'new',
    ...partial,
  };
}

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

describe('computeFixSuccessRate', () => {
  test('splits groups into resolved-with-AI / suggested-but-unresolved / no-suggestion and computes the rate over the AI-assisted cohort only', () => {
    const groups = [
      group({ status: 'resolved', aiSuggestion: { pattern: 'p' } }),
      group({ status: 'resolved', aiSuggestion: { pattern: 'p' } }),
      group({ status: 'investigating', aiSuggestion: { pattern: 'p' } }),
      group({ status: 'resolved' }),
      group({ status: 'new' }),
    ];
    const summary = computeFixSuccessRate(groups);
    expect(summary).toEqual({
      resolvedWithAi: 2,
      suggestedButUnresolved: 1,
      withoutSuggestion: 2,
      total: 5,
      // 2 / (2 + 1) ≈ 0.667
      successRate: 2 / 3,
    });
  });

  test('returns null rate when no AI-assisted crash groups exist', () => {
    expect(computeFixSuccessRate([group({ status: 'new' })]).successRate).toBeNull();
  });
});

describe('computeMttr', () => {
  test('separates agent vs human cohorts and averages their durations in ms', () => {
    const groups = [
      // Agent
      group({ status: 'resolved', firstSeen: 0, lastSeen: 60_000, aiSuggestion: { pattern: 'p' } }),
      group({
        status: 'resolved',
        firstSeen: 0,
        lastSeen: 120_000,
        aiSuggestion: { pattern: 'p' },
      }),
      // Human
      group({ status: 'resolved', firstSeen: 0, lastSeen: 3_600_000 }),
      // Unresolved — skipped
      group({ status: 'investigating', firstSeen: 0, lastSeen: 999_999 }),
    ];
    const summary = computeMttr(groups);
    expect(summary.agentSamples).toBe(2);
    expect(summary.humanSamples).toBe(1);
    expect(summary.agentMeanMs).toBe(90_000);
    expect(summary.humanMeanMs).toBe(3_600_000);
  });

  test('returns null means when a cohort has zero samples', () => {
    const summary = computeMttr([group({ status: 'new' })]);
    expect(summary.agentMeanMs).toBeNull();
    expect(summary.humanMeanMs).toBeNull();
  });
});

describe('topPatternHits', () => {
  test('merges pattern_match events + group.aiSuggestion.pattern, sorts by count then recency, averages confidence', () => {
    const events = [
      ev('pattern_match', 10, { pattern: 'unhandled-rejection', confidence: 0.8 }),
      ev('pattern_match', 20, { pattern: 'unhandled-rejection', confidence: 0.9 }),
      ev('pattern_match', 15, { pattern: 'render-storm', confidence: 60 }), // 0–100 path, normalised
      ev('custom', 30, { pattern: 'ignored' }),
    ];
    const groups = [
      group({
        fingerprint: 'a',
        aiSuggestion: { pattern: 'unhandled-rejection', confidence: 0.85 },
        lastSeen: 25,
      }),
      group({
        fingerprint: 'b',
        aiSuggestion: { pattern: 'slow-fabric-commit', confidence: 0.5 },
        lastSeen: 5,
      }),
    ];
    const top = topPatternHits(events, groups, 5);
    expect(top.map((p) => p.pattern)).toEqual([
      'unhandled-rejection',
      'render-storm',
      'slow-fabric-commit',
    ]);
    expect(top[0]?.count).toBe(3);
    expect(top[0]?.avgConfidence).toBeCloseTo((0.8 + 0.9 + 0.85) / 3);
    // 60 normalised to 0.6 since SDKs may emit 0–100 confidences.
    expect(top[1]?.avgConfidence).toBeCloseTo(0.6);
  });
});

describe('extractConfidenceSeries', () => {
  test('keeps ai_suggestion + pattern_match samples, sorts ascending, normalises 0–100 to 0–1', () => {
    const events = [
      ev('ai_suggestion', 30, { confidence: 0.7 }),
      ev('pattern_match', 10, { confidence: 80 }),
      ev('custom', 20, { confidence: 0.99 }),
      ev('ai_suggestion', 40, { confidence: 'bad' }),
    ];
    const series = extractConfidenceSeries(events);
    expect(series).toEqual([
      { timestamp: 10, confidence: 0.8 },
      { timestamp: 30, confidence: 0.7 },
    ]);
  });
});

describe('formatMttr + formatPercent', () => {
  test('formatMttr chooses a human-readable unit', () => {
    expect(formatMttr(null)).toBe('—');
    expect(formatMttr(12_000)).toBe('12 s');
    expect(formatMttr(5 * 60_000)).toBe('5 min');
    expect(formatMttr(2 * 3_600_000)).toBe('2.0 h');
    expect(formatMttr(2 * 86_400_000)).toBe('2.0 d');
  });

  test('formatPercent rounds to integer percent', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0.666)).toBe('67%');
    expect(formatPercent(1)).toBe('100%');
  });
});
