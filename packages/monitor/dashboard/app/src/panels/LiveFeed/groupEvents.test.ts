import { describe, expect, test } from 'vitest';
import { filterEvents, groupEvents } from './groupEvents';
import type { EventRecord } from '../../shared/api/types';

function ev(partial: Partial<EventRecord>): EventRecord {
  return {
    id: partial.id ?? `e-${Math.random().toString(36).slice(2, 8)}`,
    type: partial.type ?? 'custom',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 's1',
    timestamp: partial.timestamp ?? 0,
    receivedAt: partial.receivedAt ?? (partial.timestamp ?? 0) + 10,
    payload: partial.payload ?? {},
    ...partial,
  };
}

describe('groupEvents', () => {
  test('collapses consecutive same-fingerprint events within the fingerprint window', () => {
    const events = [
      ev({ id: '3', fingerprint: 'fp-a', timestamp: 3_000 }),
      ev({ id: '2', fingerprint: 'fp-a', timestamp: 2_500 }),
      ev({ id: '1', fingerprint: 'fp-a', timestamp: 2_000 }),
    ];
    const groups = groupEvents(events, { fingerprintWindowMs: 10_000 });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(3);
    expect(groups[0]?.isCollapsed).toBe(true);
    expect(groups[0]?.representative.id).toBe('3');
  });

  test('keeps different fingerprints separate even when timestamps are close', () => {
    const events = [
      ev({ id: '2', fingerprint: 'fp-a', timestamp: 2_000 }),
      ev({ id: '1', fingerprint: 'fp-b', timestamp: 1_990 }),
    ];
    expect(groupEvents(events)).toHaveLength(2);
  });

  test('collapses render storms by (type + sessionId + screen) within burst window', () => {
    const events = [
      ev({ id: '4', type: 'render', sessionId: 's1', screen: 'Home', timestamp: 4_000 }),
      ev({ id: '3', type: 'render', sessionId: 's1', screen: 'Home', timestamp: 3_800 }),
      ev({ id: '2', type: 'render', sessionId: 's1', screen: 'Home', timestamp: 3_600 }),
      ev({ id: '1', type: 'render', sessionId: 's1', screen: 'Home', timestamp: 3_400 }),
    ];
    const groups = groupEvents(events, { burstWindowMs: 1_000 });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.count).toBe(4);
  });

  test('does not cross a screen boundary when bursting by type+session', () => {
    const events = [
      ev({ id: '2', type: 'render', sessionId: 's1', screen: 'Home', timestamp: 2_100 }),
      ev({ id: '1', type: 'render', sessionId: 's1', screen: 'Settings', timestamp: 2_000 }),
    ];
    expect(groupEvents(events, { burstWindowMs: 2_000 })).toHaveLength(2);
  });

  test('caps a single group at maxGroupSize', () => {
    const events = Array.from({ length: 250 }, (_, i) =>
      ev({ id: String(i), fingerprint: 'fp-a', timestamp: 10_000 - i }),
    );
    const groups = groupEvents(events, { fingerprintWindowMs: 60_000, maxGroupSize: 50 });
    expect(groups.length).toBeGreaterThan(1);
    for (const g of groups) expect(g.count).toBeLessThanOrEqual(50);
  });
});

describe('filterEvents', () => {
  const events = [
    ev({
      id: 'a',
      type: 'crash',
      severity: 'critical',
      screen: 'Home',
      payload: { message: 'TypeError: boom' },
    }),
    ev({
      id: 'b',
      type: 'network',
      severity: 'warning',
      screen: 'Settings',
      payload: { message: 'HTTP 500' },
    }),
    ev({
      id: 'c',
      type: 'custom',
      severity: 'info',
      screen: 'Home',
      payload: { message: 'user.logged_in' },
    }),
  ];

  test('filters by type set', () => {
    const out = filterEvents(events, {
      types: new Set(['crash']),
      severities: new Set(),
      search: '',
    });
    expect(out.map((e) => e.id)).toEqual(['a']);
  });

  test('filters by severity + free-text search (case-insensitive, covers message + screen + type + session)', () => {
    const out = filterEvents(events, {
      types: new Set(),
      severities: new Set(['warning']),
      search: 'Settings',
    });
    expect(out.map((e) => e.id)).toEqual(['b']);

    const typeError = filterEvents(events, {
      types: new Set(),
      severities: new Set(),
      search: 'typeerror',
    });
    expect(typeError.map((e) => e.id)).toEqual(['a']);
  });
});
