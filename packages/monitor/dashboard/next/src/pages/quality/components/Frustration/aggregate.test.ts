// Task 117.23 — frustration aggregation tests.

import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import {
  aggregateByComponent,
  countSessions,
  countTapsByComponent,
  extractFrustrations,
  pickHeadline,
  type FrustrationSignal,
} from './aggregate';

let counter = 0;
function event(payload: Record<string, unknown>, sessionId = 's1', timestamp = 0): EventRecord {
  counter += 1;
  return {
    id: `e-${counter}`,
    type: 'custom',
    severity: 'info',
    sessionId,
    timestamp,
    receivedAt: timestamp + 1,
    payload,
  };
}

function frustrationEvent(
  componentPath: string,
  signals: FrustrationSignal[],
  sessionId = 's1',
  timestamp = 0,
): EventRecord {
  return event(
    {
      name: 'frustration',
      attributes: {
        componentPath,
        signals,
        level: signals.length >= 3 ? 'high' : signals.length === 2 ? 'medium' : 'low',
        tapCount: signals.length,
        windowMs: 5000,
      },
    },
    sessionId,
    timestamp,
  );
}

function touchEvent(componentPath: string, sessionId = 's1', timestamp = 0): EventRecord {
  return event({ name: 'touch', attributes: { componentPath } }, sessionId, timestamp);
}

describe('extractFrustrations', () => {
  test('keeps only frustration custom events with valid signals + componentPath; newest-first', () => {
    const events = [
      frustrationEvent('Login.button', ['rage-tap'], 's1', 100),
      event({ name: 'frustration', attributes: { componentPath: 'X' } }, 's1', 200), // empty signals
      event({ name: 'touch', attributes: { componentPath: 'Y' } }, 's1', 300),
      frustrationEvent('Home.cta', ['error-tap'], 's2', 400),
    ];
    const out = extractFrustrations(events);
    expect(out.map((f) => f.componentPath)).toEqual(['Home.cta', 'Login.button']);
  });

  test('drops invalid signal entries silently', () => {
    const events = [
      event(
        {
          name: 'frustration',
          attributes: {
            componentPath: 'X',
            signals: ['rage-tap', 'invalid', 42],
            level: 'low',
            tapCount: 1,
          },
        },
        's1',
        100,
      ),
    ];
    const out = extractFrustrations(events);
    expect(out).toHaveLength(1);
    expect(out[0]?.signals).toEqual(['rage-tap']);
  });

  test('drops events missing componentPath entirely', () => {
    const events = [
      event(
        {
          name: 'frustration',
          attributes: { signals: ['rage-tap'], level: 'low', tapCount: 1 },
        },
        's1',
        100,
      ),
    ];
    expect(extractFrustrations(events)).toEqual([]);
  });
});

describe('countTapsByComponent', () => {
  test('counts touch events per componentPath', () => {
    const taps = countTapsByComponent([
      touchEvent('Btn.A', 's1', 100),
      touchEvent('Btn.A', 's1', 200),
      touchEvent('Btn.B', 's2', 300),
      frustrationEvent('Btn.A', ['rage-tap']),
    ]);
    expect(taps.get('Btn.A')).toBe(2);
    expect(taps.get('Btn.B')).toBe(1);
  });
});

describe('countSessions', () => {
  test('counts distinct session ids across the whole stream', () => {
    expect(countSessions([])).toBe(0);
    expect(
      countSessions([
        touchEvent('Btn.A', 's1'),
        touchEvent('Btn.A', 's1'),
        touchEvent('Btn.B', 's2'),
      ]),
    ).toBe(2);
  });
});

describe('aggregateByComponent', () => {
  test('rolls up rage / dead / error counts and computes user-impact %', () => {
    const events = [
      frustrationEvent('Login.button', ['rage-tap'], 's1'),
      frustrationEvent('Login.button', ['error-tap'], 's2'),
      frustrationEvent('Login.button', ['error-tap'], 's3'),
      frustrationEvent('Help.cta', ['dead-tap'], 's4'),
    ];
    const taps = new Map<string, number>([
      ['Login.button', 30],
      ['Help.cta', 5],
    ]);
    const out = aggregateByComponent(extractFrustrations(events), taps, 4);
    const login = out.find((r) => r.componentPath === 'Login.button')!;
    const help = out.find((r) => r.componentPath === 'Help.cta')!;
    expect(login.frustrationCount).toBe(3);
    expect(login.rageTapCount).toBe(1);
    expect(login.errorTapCount).toBe(2);
    expect(login.deadTapCount).toBe(0);
    expect(login.totalTapCount).toBe(30);
    expect(login.errorRate).toBeCloseTo(2 / 30, 5);
    expect(login.affectedSessions).toBe(3);
    expect(login.userImpactPct).toBeCloseTo(0.75, 5);
    expect(help.deadTapCount).toBe(1);
    expect(help.userImpactPct).toBeCloseTo(0.25, 5);
  });

  test('sorts rows by composite score so the worst offender is first', () => {
    const events = [
      frustrationEvent('A', ['error-tap'], 's1'),
      frustrationEvent('A', ['error-tap'], 's2'),
      frustrationEvent('B', ['rage-tap'], 's3'),
    ];
    const out = aggregateByComponent(extractFrustrations(events), new Map(), 3);
    expect(out[0]?.componentPath).toBe('A');
  });

  test('handles zero sessions without dividing by zero', () => {
    const out = aggregateByComponent(
      extractFrustrations([frustrationEvent('A', ['rage-tap'], 's1')]),
      new Map(),
      0,
    );
    expect(out[0]?.userImpactPct).toBeGreaterThan(0);
    expect(out[0]?.userImpactPct).toBeLessThanOrEqual(1);
  });

  test('errorRate is 0 when totalTapCount is unknown', () => {
    const out = aggregateByComponent(
      extractFrustrations([frustrationEvent('A', ['error-tap'], 's1')]),
      new Map(),
      1,
    );
    expect(out[0]?.errorRate).toBe(0);
  });
});

describe('pickHeadline', () => {
  test('builds the canonical "X causes errors for N% of users" sentence when data supports it', () => {
    const impacts = aggregateByComponent(
      extractFrustrations([
        frustrationEvent('LoginButton', ['error-tap'], 's1'),
        frustrationEvent('LoginButton', ['error-tap'], 's2'),
      ]),
      new Map([['LoginButton', 20]]),
      4,
    );
    const out = pickHeadline(impacts, 4);
    expect(out.componentPath).toBe('LoginButton');
    expect(out.text).toBe('LoginButton causes errors for 50% of users.');
    expect(out.errorTapCount).toBe(2);
  });

  test('falls back to a softer headline when no error-tap user-impact crosses zero', () => {
    const impacts = aggregateByComponent(
      extractFrustrations([
        frustrationEvent('Help', ['rage-tap'], 's1'),
      ]),
      new Map(),
      4,
    );
    const out = pickHeadline(impacts, 4);
    expect(out.text).toMatch(/Top frustration: Help/);
  });

  test('returns the empty-state line when there are no impacts', () => {
    expect(pickHeadline([], 4).text).toMatch(/No frustration recorded/i);
    expect(pickHeadline([{
      componentPath: 'X',
      totalTapCount: 0,
      frustrationCount: 0,
      rageTapCount: 0,
      deadTapCount: 0,
      errorTapCount: 0,
      errorRate: 0,
      affectedSessions: 0,
      userImpactPct: 0,
      score: 0,
    }], 0).text).toMatch(/No frustration recorded/i);
  });
});
