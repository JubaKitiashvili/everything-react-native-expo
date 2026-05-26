import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import { buildJourneyGraph } from './aggregate';

let seq = 0;

function event(partial: Partial<EventRecord>): EventRecord {
  seq += 1;
  return {
    id: partial.id ?? `e${seq}`,
    type: partial.type ?? 'custom',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 's1',
    timestamp: partial.timestamp ?? seq,
    receivedAt: partial.receivedAt ?? (partial.timestamp ?? seq) + 1,
    payload: partial.payload ?? {},
    ...partial,
  };
}

describe('buildJourneyGraph', () => {
  test('derives consecutive transitions per session in timestamp order', () => {
    // Inserted out of order — the transform must sort by timestamp.
    const events = [
      event({ sessionId: 's1', screen: 'Cart', timestamp: 30 }),
      event({ sessionId: 's1', screen: 'Home', timestamp: 10 }),
      event({ sessionId: 's1', screen: 'Search', timestamp: 20 }),
    ];
    const { transitions } = buildJourneyGraph(events);
    expect(transitions).toEqual([
      { from: 'Home', to: 'Search', count: 1 },
      { from: 'Search', to: 'Cart', count: 1 },
    ]);
  });

  test('collapses runs of the same screen (no self-loops)', () => {
    const events = [
      event({ sessionId: 's1', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's1', screen: 'Home', timestamp: 2 }),
      event({ sessionId: 's1', screen: 'Home', timestamp: 3 }),
      event({ sessionId: 's1', screen: 'Profile', timestamp: 4 }),
    ];
    const { transitions, screens } = buildJourneyGraph(events);
    expect(transitions).toEqual([{ from: 'Home', to: 'Profile', count: 1 }]);
    // Home counted once despite three consecutive events.
    expect(screens.find((s) => s.screen === 'Home')?.visits).toBe(1);
    expect(screens.find((s) => s.screen === 'Profile')?.visits).toBe(1);
  });

  test('sums transition weights across multiple sessions', () => {
    const events = [
      // s1: Home → Search
      event({ sessionId: 's1', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's1', screen: 'Search', timestamp: 2 }),
      // s2: Home → Search → Cart
      event({ sessionId: 's2', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's2', screen: 'Search', timestamp: 2 }),
      event({ sessionId: 's2', screen: 'Cart', timestamp: 3 }),
    ];
    const { transitions } = buildJourneyGraph(events);
    expect(transitions).toEqual([
      { from: 'Home', to: 'Search', count: 2 },
      { from: 'Search', to: 'Cart', count: 1 },
    ]);
  });

  test('sorts transitions by count desc, then from, then to', () => {
    const events = [
      // B→A and A→C both end at count 1; A→B reaches count 2.
      event({ sessionId: 's1', screen: 'A', timestamp: 1 }),
      event({ sessionId: 's1', screen: 'B', timestamp: 2 }),
      event({ sessionId: 's2', screen: 'A', timestamp: 1 }),
      event({ sessionId: 's2', screen: 'B', timestamp: 2 }),
      event({ sessionId: 's3', screen: 'B', timestamp: 1 }),
      event({ sessionId: 's3', screen: 'A', timestamp: 2 }),
      event({ sessionId: 's4', screen: 'A', timestamp: 1 }),
      event({ sessionId: 's4', screen: 'C', timestamp: 2 }),
    ];
    const { transitions } = buildJourneyGraph(events);
    expect(transitions).toEqual([
      { from: 'A', to: 'B', count: 2 },
      { from: 'A', to: 'C', count: 1 },
      { from: 'B', to: 'A', count: 1 },
    ]);
  });

  test('counts crash and anr events per screen', () => {
    const events = [
      event({ sessionId: 's1', screen: 'Checkout', type: 'screen_view', timestamp: 1 }),
      event({ sessionId: 's1', screen: 'Checkout', type: 'crash', timestamp: 2 }),
      event({ sessionId: 's2', screen: 'Checkout', type: 'crash', timestamp: 1 }),
      event({ sessionId: 's2', screen: 'Checkout', type: 'anr', timestamp: 2 }),
      event({ sessionId: 's3', screen: 'Home', type: 'anr', timestamp: 1 }),
    ];
    const { screens } = buildJourneyGraph(events);
    const checkout = screens.find((s) => s.screen === 'Checkout');
    const home = screens.find((s) => s.screen === 'Home');
    expect(checkout?.crashes).toBe(2);
    expect(checkout?.anrs).toBe(1);
    expect(home?.crashes).toBe(0);
    expect(home?.anrs).toBe(1);
  });

  test('crash/anr events without a screen still surface no phantom screen', () => {
    const events = [
      event({ sessionId: 's1', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's1', type: 'crash', timestamp: 2 }), // no screen
    ];
    const { screens } = buildJourneyGraph(events);
    expect(screens.map((s) => s.screen)).toEqual(['Home']);
    expect(screens[0]?.crashes).toBe(0);
  });

  test('ignores events without a screen when deriving transitions', () => {
    const events = [
      event({ sessionId: 's1', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's1', timestamp: 2 }), // no screen → skipped
      event({ sessionId: 's1', screen: 'Profile', timestamp: 3 }),
    ];
    const { transitions } = buildJourneyGraph(events);
    // The screen-less event does not break the Home → Profile edge.
    expect(transitions).toEqual([{ from: 'Home', to: 'Profile', count: 1 }]);
  });

  test('sorts screens by visits desc then name', () => {
    const events = [
      event({ sessionId: 's1', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's1', screen: 'Search', timestamp: 2 }),
      event({ sessionId: 's2', screen: 'Home', timestamp: 1 }),
      event({ sessionId: 's2', screen: 'Cart', timestamp: 2 }),
    ];
    const { screens } = buildJourneyGraph(events);
    expect(screens.map((s) => s.screen)).toEqual(['Home', 'Cart', 'Search']);
    expect(screens[0]).toMatchObject({ screen: 'Home', visits: 2 });
  });

  test('returns empty graph for empty input', () => {
    expect(buildJourneyGraph([])).toEqual({ screens: [], transitions: [] });
  });
});
