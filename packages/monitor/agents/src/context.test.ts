// Task 117.6 — context bundler tests.

import { describe, expect, test } from 'vitest';
import { buildFixContext } from './context.js';
import type {
  CrashGroupRecord,
  DashboardClient,
  EventRecord,
} from '@erne/monitor-mcp/client';

const NOW = 1_770_000_000_000;

function makeClient(overrides: Partial<DashboardClient> = {}): DashboardClient {
  const groups: CrashGroupRecord[] = [
    {
      fingerprint: 'fp-1',
      message: 'TypeError: undefined is not an object',
      firstSeen: NOW - 100_000,
      lastSeen: NOW,
      eventCount: 7,
      sessionCount: 3,
      status: 'new',
      topScreen: 'HomeScreen',
    },
  ];
  const representative: EventRecord = {
    id: 'evt-1',
    type: 'crash',
    severity: 'critical',
    sessionId: 's1',
    fingerprint: 'fp-1',
    timestamp: NOW,
    receivedAt: NOW,
    platform: 'ios',
    payload: {
      message: 'TypeError: undefined is not an object (evaluating user.name)',
      appVersion: '1.4.0',
      stack: [
        { symbol: 'HomeScreen.render', file: 'src/Home.tsx', line: 42, column: 7 },
        'at App (App.tsx:9:1)',
      ],
    },
  };
  const breadcrumbs: EventRecord[] = [
    {
      id: 'evt-bc1',
      type: 'navigation',
      severity: 'info',
      sessionId: 's1',
      timestamp: NOW - 30_000,
      receivedAt: NOW - 30_000,
      payload: { message: 'navigated to Home' },
    },
    {
      id: 'evt-bc2',
      type: 'tap',
      severity: 'info',
      sessionId: 's1',
      timestamp: NOW - 5_000,
      receivedAt: NOW - 5_000,
      payload: { message: 'pressed Login' },
    },
    // Should NOT appear (post-crash).
    {
      id: 'evt-bc3',
      type: 'navigation',
      severity: 'info',
      sessionId: 's1',
      timestamp: NOW + 1000,
      receivedAt: NOW + 1000,
      payload: { message: 'after-crash event' },
    },
  ];

  const defaults = {
    listCrashGroups: async () => groups,
    listEvents: async (filter?: { fingerprint?: string; sessionId?: string }) => {
      if (filter?.fingerprint === 'fp-1') return [representative];
      if (filter?.sessionId === 's1') return breadcrumbs;
      return [];
    },
  } as unknown as DashboardClient;
  return Object.assign(defaults, overrides);
}

describe('buildFixContext', () => {
  test('returns null when no crash group matches', async () => {
    const client = makeClient({
      listCrashGroups: async () => [],
    } as unknown as DashboardClient);
    const ctx = await buildFixContext(client, 'fp-missing');
    expect(ctx).toBeNull();
  });

  test('builds the structured context with stack and breadcrumbs', async () => {
    const ctx = await buildFixContext(makeClient(), 'fp-1');
    expect(ctx).not.toBeNull();
    expect(ctx?.fingerprint).toBe('fp-1');
    expect(ctx?.message).toBe(
      'TypeError: undefined is not an object (evaluating user.name)',
    );
    expect(ctx?.platform).toBe('ios');
    expect(ctx?.appVersion).toBe('1.4.0');
    expect(ctx?.topScreen).toBe('HomeScreen');
    expect(ctx?.eventCount).toBe(7);

    expect(ctx?.stack[0]).toEqual({
      symbol: 'HomeScreen.render',
      file: 'src/Home.tsx',
      line: 42,
      column: 7,
    });
    // String stack frame got parsed.
    expect(ctx?.stack[1]?.file).toBe('App.tsx');
    expect(ctx?.stack[1]?.line).toBe(9);

    // Breadcrumbs sorted relative to crash; post-crash event filtered.
    expect(ctx?.breadcrumbs.map((b) => b.message)).toEqual([
      'navigated to Home',
      'pressed Login',
    ]);
    expect(ctx?.breadcrumbs[0]?.offsetMs).toBe(-30_000);
  });

  test('honours maxBreadcrumbs cap', async () => {
    const lots: EventRecord[] = Array.from({ length: 50 }, (_, i) => ({
      id: `evt-${i}`,
      type: 'log',
      severity: 'info',
      sessionId: 's1',
      timestamp: NOW - (i + 1) * 100,
      receivedAt: NOW - (i + 1) * 100,
      payload: { message: `entry ${i}` },
    }));
    const representative: EventRecord = {
      id: 'evt-x',
      type: 'crash',
      severity: 'critical',
      sessionId: 's1',
      fingerprint: 'fp-1',
      timestamp: NOW,
      receivedAt: NOW,
      payload: { message: 'boom', stack: [] },
    };
    const client = {
      listCrashGroups: async () => [
        {
          fingerprint: 'fp-1',
          message: 'boom',
          firstSeen: NOW - 1000,
          lastSeen: NOW,
          eventCount: 1,
          sessionCount: 1,
          status: 'new',
        },
      ],
      listEvents: async (filter?: { fingerprint?: string; sessionId?: string }) => {
        if (filter?.fingerprint === 'fp-1') return [representative];
        if (filter?.sessionId === 's1') return lots;
        return [];
      },
    } as unknown as DashboardClient;
    const ctx = await buildFixContext(client, 'fp-1', { maxBreadcrumbs: 5 });
    expect(ctx?.breadcrumbs).toHaveLength(5);
  });
});
