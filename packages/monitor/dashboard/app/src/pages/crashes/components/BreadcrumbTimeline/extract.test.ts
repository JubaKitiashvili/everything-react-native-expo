import { describe, expect, test } from 'vitest';
import type { EventRecord } from '@/shared/api/types';
import { categoryFromEventType, categoryFromRaw, extractBreadcrumbs } from './extract';

function crashEvent(
  id: string,
  timestamp: number,
  breadcrumbs: Array<Record<string, unknown>>,
): EventRecord {
  return {
    id,
    type: 'crash',
    severity: 'critical',
    sessionId: 's1',
    timestamp,
    receivedAt: timestamp + 10,
    payload: { breadcrumbs },
  };
}

function sessionEvent(
  id: string,
  type: string,
  timestamp: number,
  payload: Record<string, unknown> = {},
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

describe('extractBreadcrumbs', () => {
  test('prefers crumbs embedded in the selected crash event and sorts newest-first', () => {
    const event = crashEvent('c1', 1_000, [
      { category: 'nav', message: 'Navigated to /users', timestamp: 800 },
      { category: 'touch', message: 'Tapped "Refresh"', timestamp: 900 },
      { category: 'net', message: 'GET /api/users 500', timestamp: 950 },
    ]);
    const sessionEvents = [sessionEvent('ignored', 'custom', 500)];
    const crumbs = extractBreadcrumbs({ crashEvent: event, sessionEvents });
    expect(crumbs.map((c) => c.id)).toEqual(['c1-c2', 'c1-c1', 'c1-c0']);
    expect(crumbs.every((c) => c.source === 'crash-event')).toBe(true);
  });

  test('falls back to session events when the crash event has no breadcrumbs', () => {
    const noCrashPayload = crashEvent('c1', 1_000, []);
    const events = [
      sessionEvent('e1', 'navigation', 800, { message: 'Navigated' }),
      sessionEvent('e2', 'touch', 900),
      sessionEvent('e3', 'network', 950, { message: 'GET /x' }),
    ];
    const crumbs = extractBreadcrumbs({ crashEvent: noCrashPayload, sessionEvents: events });
    expect(crumbs.map((c) => c.id)).toEqual(['e3', 'e2', 'e1']);
    expect(crumbs[0]?.category).toBe('net');
    expect(crumbs[1]?.category).toBe('touch');
    expect(crumbs[2]?.category).toBe('nav');
  });

  test('caps the timeline at `limit` (default 100) so runaway crumbs stay renderable', () => {
    const crumbs = Array.from({ length: 150 }, (_, i) => ({
      category: 'render',
      message: `render-${i}`,
      timestamp: i,
    }));
    const event = crashEvent('c1', 10_000, crumbs);
    expect(extractBreadcrumbs({ crashEvent: event }).length).toBe(100);
    expect(extractBreadcrumbs({ crashEvent: event, limit: 10 }).length).toBe(10);
  });

  test('normalises unknown category strings without throwing', () => {
    expect(categoryFromRaw('Navigation')).toBe('nav');
    expect(categoryFromRaw('HTTP')).toBe('net');
    expect(categoryFromRaw('tap')).toBe('touch');
    expect(categoryFromRaw('StateChange')).toBe('state');
    expect(categoryFromRaw(undefined)).toBe('other');

    expect(categoryFromEventType('touch_boundary')).toBe('touch');
    expect(categoryFromEventType('fabric_commit')).toBe('render');
    expect(categoryFromEventType('mystery_type')).toBe('other');
  });
});
