import { describe, expect, test } from 'vitest';
import type { EventRecord, SessionRecord } from '@/shared/api/types';
import { summarizeUser } from './summarizeUser';

const NOW = 1_770_000_000_000;

function event(partial: Partial<EventRecord>): EventRecord {
  return {
    id: partial.id ?? 'e',
    type: partial.type ?? 'log',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 'sess',
    timestamp: partial.timestamp ?? NOW,
    receivedAt: partial.receivedAt ?? NOW,
    payload: partial.payload ?? {},
    ...partial,
  };
}

function session(partial: Partial<SessionRecord>): SessionRecord {
  return {
    id: partial.id ?? 's',
    startedAt: partial.startedAt ?? NOW,
    eventCount: partial.eventCount ?? 0,
    crashCount: partial.crashCount ?? 0,
    ...partial,
  };
}

describe('summarizeUser', () => {
  test('returns a zeroed summary for empty input', () => {
    const summary = summarizeUser([], []);
    expect(summary).toEqual({
      sessionCount: 0,
      eventCount: 0,
      crashCount: 0,
      anrCount: 0,
      firstSeen: null,
      lastSeen: null,
      topScreens: [],
    });
  });

  test('counts sessions and events', () => {
    const summary = summarizeUser(
      [event({ id: 'a' }), event({ id: 'b' }), event({ id: 'c' })],
      [session({ id: 's1' }), session({ id: 's2' })],
    );
    expect(summary.sessionCount).toBe(2);
    expect(summary.eventCount).toBe(3);
  });

  test('classifies crash and anr events', () => {
    const events = [
      event({ id: 'a', type: 'crash' }),
      event({ id: 'b', type: 'crash.native' }),
      event({ id: 'c', type: 'anr' }),
      event({ id: 'd', type: 'log' }),
      event({ id: 'e', type: 'crashlytics' }), // NOT a crash — no dot, different word
    ];
    const summary = summarizeUser(events, []);
    expect(summary.crashCount).toBe(2);
    expect(summary.anrCount).toBe(1);
  });

  test('derives firstSeen / lastSeen across sessions and events', () => {
    const events = [
      event({ id: 'a', timestamp: NOW + 5_000 }),
      event({ id: 'b', timestamp: NOW - 1_000 }),
    ];
    const sessions = [
      session({ id: 's1', startedAt: NOW, endedAt: NOW + 10_000 }),
      session({ id: 's2', startedAt: NOW - 3_000 }),
    ];
    const summary = summarizeUser(events, sessions);
    expect(summary.firstSeen).toBe(NOW - 3_000); // earliest session start
    expect(summary.lastSeen).toBe(NOW + 10_000); // latest session end
  });

  test('first/last fall back to event timestamps when no sessions', () => {
    const summary = summarizeUser(
      [event({ id: 'a', timestamp: 200 }), event({ id: 'b', timestamp: 50 })],
      [],
    );
    expect(summary.firstSeen).toBe(50);
    expect(summary.lastSeen).toBe(200);
  });

  test('ranks top screens by count, ties broken alphabetically', () => {
    const events = [
      event({ id: '1', screen: 'Home' }),
      event({ id: '2', screen: 'Home' }),
      event({ id: '3', screen: 'Home' }),
      event({ id: '4', screen: 'Settings' }),
      event({ id: '5', screen: 'Settings' }),
      event({ id: '6', screen: 'Profile' }), // tie with About at count 1 → alpha
      event({ id: '7', screen: 'About' }),
      event({ id: '8', screen: '   ' }), // blank — ignored
      event({ id: '9' }), // no screen — ignored
    ];
    const summary = summarizeUser(events, []);
    expect(summary.topScreens).toEqual([
      { screen: 'Home', count: 3 },
      { screen: 'Settings', count: 2 },
      { screen: 'About', count: 1 },
      { screen: 'Profile', count: 1 },
    ]);
  });

  test('honors topScreensLimit', () => {
    const events = [
      event({ id: '1', screen: 'A' }),
      event({ id: '2', screen: 'B' }),
      event({ id: '3', screen: 'C' }),
    ];
    const summary = summarizeUser(events, [], { topScreensLimit: 2 });
    expect(summary.topScreens).toHaveLength(2);
    expect(summary.topScreens.map((s) => s.screen)).toEqual(['A', 'B']);
  });

  test('is deterministic — same input yields equal output', () => {
    const events = [event({ id: 'a', type: 'crash', screen: 'X', timestamp: 10 })];
    const sessions = [session({ id: 's', startedAt: 5 })];
    expect(summarizeUser(events, sessions)).toEqual(summarizeUser(events, sessions));
  });
});
