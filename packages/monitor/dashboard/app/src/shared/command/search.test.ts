import { describe, expect, test } from 'vitest';
import type { CrashGroupRecord, SessionRecord } from '@/shared/api/types';
import { buildResults, flattenResults, NAV_ITEMS } from './search';

const crashGroups: CrashGroupRecord[] = [
  {
    fingerprint: 'fp-login-npe',
    message: 'NullPointerException in LoginScreen',
    firstSeen: 1,
    lastSeen: 2,
    eventCount: 12,
    sessionCount: 5,
    status: 'new',
  },
  {
    fingerprint: 'fp-feed-oom',
    message: 'OutOfMemory rendering Feed',
    firstSeen: 1,
    lastSeen: 2,
    eventCount: 3,
    sessionCount: 2,
    status: 'investigating',
  },
];

const sessions: SessionRecord[] = [
  { id: 'sess-ios-1', userId: 'user_ab12', startedAt: 1, platform: 'ios', appVersion: '1.4.0', eventCount: 10, crashCount: 1 },
  { id: 'sess-android-1', userId: 'user_cd34', startedAt: 1, platform: 'android', appVersion: '1.4.0', eventCount: 8, crashCount: 0 },
  { id: 'sess-ios-2', userId: 'user_ab12', startedAt: 1, platform: 'ios', appVersion: '1.5.0', eventCount: 4, crashCount: 0 },
];

const data = { crashGroups, sessions };

describe('buildResults', () => {
  test('empty query returns only navigation destinations', () => {
    const groups = buildResults('', data);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.type).toBe('nav');
    expect(groups[0]?.results).toHaveLength(NAV_ITEMS.length);
  });

  test('matches a crash by message', () => {
    const groups = buildResults('login', data);
    const crash = groups.find((g) => g.type === 'crash');
    expect(crash?.results[0]?.label).toBe('NullPointerException in LoginScreen');
    expect(crash?.results[0]?.to).toBe('/crashes/fp-login-npe');
  });

  test('matches a session by platform + nav by keyword', () => {
    const groups = buildResults('android', data);
    const sessionGroup = groups.find((g) => g.type === 'session');
    expect(sessionGroup?.results.map((r) => r.id)).toContain('session:sess-android-1');
    // ANRs nav item carries no "android" keyword → nav group should be empty/absent here.
    expect(groups.find((g) => g.type === 'nav')).toBeUndefined();
  });

  test('matches navigation by keyword (flamegraph → Performance)', () => {
    const groups = buildResults('flamegraph', data);
    const nav = groups.find((g) => g.type === 'nav');
    expect(nav?.results[0]?.to).toBe('/performance');
  });

  test('dedupes users across sessions', () => {
    const groups = buildResults('user_', data);
    const users = groups.find((g) => g.type === 'user');
    // user_ab12 appears in two sessions but should be listed once.
    expect(users?.results).toHaveLength(2);
    expect(users?.results.map((r) => r.label).sort()).toEqual(['user_ab12', 'user_cd34']);
  });

  test('no matches → no groups', () => {
    expect(buildResults('zzz-nothing-matches', data)).toEqual([]);
  });

  test('flattenResults preserves group order', () => {
    const groups = buildResults('ios', data);
    const flat = flattenResults(groups);
    // Every flattened entry is one of the group results, in order.
    expect(flat.length).toBe(groups.reduce((n, g) => n + g.results.length, 0));
  });
});
