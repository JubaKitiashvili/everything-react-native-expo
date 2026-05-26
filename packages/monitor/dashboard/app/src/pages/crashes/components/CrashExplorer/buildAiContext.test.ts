import { describe, expect, test } from 'vitest';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { buildAiContext } from './buildAiContext';

const NOW = 1_770_000_000_000;

function group(partial: Partial<CrashGroupRecord> = {}): CrashGroupRecord {
  return {
    fingerprint: partial.fingerprint ?? 'fp-a',
    message: partial.message ?? 'TypeError: cannot read id',
    firstSeen: partial.firstSeen ?? NOW - 120_000,
    lastSeen: partial.lastSeen ?? NOW - 10_000,
    eventCount: partial.eventCount ?? 4,
    sessionCount: partial.sessionCount ?? 2,
    status: partial.status ?? 'new',
    ...partial,
  };
}

function crashEvent(partial: Partial<EventRecord> = {}): EventRecord {
  return {
    id: partial.id ?? 'evt-1',
    type: 'crash',
    severity: 'critical',
    sessionId: partial.sessionId ?? 's-9',
    timestamp: partial.timestamp ?? NOW - 30_000,
    receivedAt: partial.receivedAt ?? NOW - 29_000,
    fingerprint: partial.fingerprint ?? 'fp-a',
    payload: partial.payload ?? {},
    ...partial,
  };
}

describe('buildAiContext', () => {
  test('includes message, fingerprint, a stack line, a breadcrumb, and device info', () => {
    const text = buildAiContext({
      group: group({ topScreen: 'Users' }),
      latestEvent: crashEvent({
        platform: 'ios',
        screen: 'Users',
        userId: 'u-7',
        payload: {
          stack: [
            'TypeError: cannot read id',
            '    at UserList.render (App.tsx:128:12)',
            '    at Array.map (<anonymous>)',
          ].join('\n'),
          breadcrumbs: [
            { category: 'nav', message: 'Navigated to /users', timestamp: NOW - 45_000 },
          ],
          device: { model: 'iPhone 15', osVersion: '17.4' },
        },
      }),
    });

    // Header fields
    expect(text).toContain('Message: TypeError: cannot read id');
    expect(text).toContain('Fingerprint: fp-a');
    expect(text).toContain('Status: new');
    expect(text).toContain('Events: 4 across 2 sessions');
    expect(text).toContain('Top screen: Users');

    // Device / session
    expect(text).toContain('Platform: ios');
    expect(text).toContain('Session: s-9');
    expect(text).toContain('User: u-7');
    expect(text).toContain('model: iPhone 15');

    // Stack (parsed via parseStack)
    expect(text).toContain('at UserList.render (App.tsx:128:12)');

    // Breadcrumb
    expect(text).toContain('[nav] Navigated to /users');
  });

  test('is deterministic and emits ISO timestamps, not locale strings', () => {
    const input = { group: group(), latestEvent: crashEvent() };
    const a = buildAiContext(input);
    const b = buildAiContext(input);
    expect(a).toBe(b);
    expect(a).toContain(new Date(NOW - 120_000).toISOString()); // firstSeen
  });

  test('omits empty sections when there is no event', () => {
    const text = buildAiContext({ group: group(), latestEvent: null });
    expect(text).toContain('Message: TypeError: cannot read id');
    expect(text).not.toContain('## Stack');
    expect(text).not.toContain('## Breadcrumbs');
    // session line only appears when an event is present
    expect(text).not.toContain('Session:');
  });
});
