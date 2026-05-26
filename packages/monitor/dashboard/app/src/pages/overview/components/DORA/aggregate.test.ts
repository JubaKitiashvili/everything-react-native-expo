import { describe, expect, test } from 'vitest';
import type { CrashGroupRecord, SessionRecord } from '@/shared/api/types';
import {
  computeChangeFailureRate,
  computeDeployFrequency,
  computeLeadTime,
  computeMttr,
  extractDeploys,
  formatMsHuman,
  formatPerDay,
  formatPercent,
  trendDirection,
} from './aggregate';

const DAY = 86_400_000;
const NOW = 1_770_000_000_000;

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: partial.id ?? 's',
    startedAt: partial.startedAt ?? NOW,
    eventCount: 0,
    crashCount: 0,
    ...partial,
  };
}

function group(partial: Partial<CrashGroupRecord>): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp',
    message: partial.message ?? 'msg',
    firstSeen: partial.firstSeen ?? 0,
    lastSeen: partial.lastSeen ?? 0,
    eventCount: 1,
    sessionCount: 1,
    status: partial.status ?? 'new',
    ...partial,
  };
}

describe('extractDeploys', () => {
  test('dedupes by appVersion + channel and keeps the earliest firstSeen', () => {
    const sessions = [
      session({ id: 'a', appVersion: '1.2.0', channel: 'default', startedAt: 1_000 }),
      session({ id: 'b', appVersion: '1.2.0', channel: 'default', startedAt: 500 }),
      session({ id: 'c', appVersion: '1.2.0', channel: 'canary', startedAt: 600 }),
      session({ id: 'd', appVersion: '1.3.0', channel: 'default', startedAt: 2_000 }),
      session({ id: 'no-version', startedAt: 3_000 }),
    ];
    const deploys = extractDeploys(sessions);
    expect(deploys.map((d) => d.id)).toEqual(['1.2.0@default', '1.2.0@canary', '1.3.0@default']);
    expect(deploys[0]?.firstSeen).toBe(500);
  });
});

describe('computeMttr', () => {
  test('averages lastSeen-firstSeen over the window for resolved crashes', () => {
    const groups = [
      group({ status: 'resolved', firstSeen: NOW - 7 * DAY, lastSeen: NOW - 6 * DAY }), // 1 day
      group({ status: 'resolved', firstSeen: NOW - 3 * DAY, lastSeen: NOW - DAY }), // 2 days
      group({ status: 'investigating', firstSeen: NOW - 2 * DAY, lastSeen: NOW - DAY }),
    ];
    const mttr = computeMttr(groups, { now: NOW, windowMs: 14 * DAY });
    expect(mttr.samples).toBe(2);
    expect(mttr.value).toBe(1.5 * DAY);
  });

  test('returns null for an empty window', () => {
    expect(computeMttr([], { now: NOW }).value).toBeNull();
  });
});

describe('computeChangeFailureRate', () => {
  test('fraction of deploys followed by a crash inside failureWindowMs', () => {
    const deploys = [
      { id: 'v1@default', appVersion: '1', channel: 'default', firstSeen: NOW - 5 * DAY },
      { id: 'v2@default', appVersion: '2', channel: 'default', firstSeen: NOW - 3 * DAY },
      { id: 'v3@default', appVersion: '3', channel: 'default', firstSeen: NOW - DAY },
    ];
    const groups = [
      group({ firstSeen: NOW - 5 * DAY + 3_600_000 }),
      // v2 stays clean
      group({ firstSeen: NOW - DAY + 3_600_000 }),
    ];
    const cfr = computeChangeFailureRate(groups, deploys, { now: NOW, windowMs: 14 * DAY });
    expect(cfr.samples).toBe(3);
    expect(cfr.value).toBeCloseTo(2 / 3);
  });

  test('null when no deploys sit in the window', () => {
    expect(computeChangeFailureRate([], [], { now: NOW }).value).toBeNull();
  });
});

describe('computeDeployFrequency + computeLeadTime', () => {
  test('deploy frequency is count / window-days', () => {
    const deploys = [
      { id: '1', appVersion: '1', channel: 'default', firstSeen: NOW - 13 * DAY },
      { id: '2', appVersion: '2', channel: 'default', firstSeen: NOW - 8 * DAY },
      { id: '3', appVersion: '3', channel: 'default', firstSeen: NOW - DAY },
    ];
    const freq = computeDeployFrequency(deploys, { now: NOW, windowMs: 14 * DAY });
    expect(freq.value).toBeCloseTo(3 / 14);
    expect(freq.samples).toBe(3);
  });

  test('lead time is median of consecutive gaps', () => {
    const deploys = [
      { id: '1', appVersion: '1', channel: 'default', firstSeen: 0 },
      { id: '2', appVersion: '2', channel: 'default', firstSeen: 1_000 },
      { id: '3', appVersion: '3', channel: 'default', firstSeen: 5_000 },
      { id: '4', appVersion: '4', channel: 'default', firstSeen: 10_000 },
    ];
    const lead = computeLeadTime(deploys, { now: 20_000, windowMs: 30_000 });
    // gaps: 1000, 4000, 5000 → median 4000
    expect(lead.value).toBe(4_000);
  });
});

describe('trendDirection', () => {
  test('returns flat when either side is null or values match', () => {
    expect(trendDirection({ value: null, previous: null, samples: 0 }, 'lower')).toBe('flat');
    expect(trendDirection({ value: 10, previous: 10, samples: 1 }, 'lower')).toBe('flat');
  });

  test('returns up when the metric moved in the "better" direction', () => {
    expect(trendDirection({ value: 5, previous: 10, samples: 1 }, 'lower')).toBe('up'); // lower is better
    expect(trendDirection({ value: 10, previous: 5, samples: 1 }, 'higher')).toBe('up');
  });

  test('returns down when the metric regressed', () => {
    expect(trendDirection({ value: 10, previous: 5, samples: 1 }, 'lower')).toBe('down');
  });
});

describe('formatters', () => {
  test('formatMsHuman uses s / min / h / d tiers', () => {
    expect(formatMsHuman(null)).toBe('—');
    expect(formatMsHuman(20_000)).toBe('20 s');
    expect(formatMsHuman(5 * 60_000)).toBe('5 min');
    expect(formatMsHuman(2 * 3_600_000)).toBe('2.0 h');
    expect(formatMsHuman(3 * 86_400_000)).toBe('3.0 d');
  });

  test('formatPerDay degrades to week / month when < 1/day', () => {
    expect(formatPerDay(null)).toBe('—');
    expect(formatPerDay(2)).toBe('2.00 / day');
    expect(formatPerDay(0.5)).toBe('3.5 / week');
    expect(formatPerDay(0.05)).toBe('1.5 / month');
  });

  test('formatPercent rounds to integer', () => {
    expect(formatPercent(null)).toBe('—');
    expect(formatPercent(0.666)).toBe('67%');
  });
});
