import { describe, expect, test, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { handleFrame } from './handleFrame';
import type { EventRecord } from '../api/types';

function makeEvent(type: string): EventRecord {
  return {
    id: 'e1',
    type,
    severity: 'info',
    sessionId: 's1',
    timestamp: 1,
    receivedAt: 2,
    payload: {},
  };
}

describe('handleFrame → query invalidation matrix', () => {
  test('event frame invalidates events + sessions (non-crash does not touch crash groups)', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    handleFrame({ kind: 'event', event: makeEvent('custom') }, qc);
    const keys = spy.mock.calls.map(
      (call) => (call[0] as { queryKey: readonly string[] }).queryKey[0],
    );
    expect(keys.sort()).toEqual(['events', 'sessions']);
  });

  test('crash event invalidates events + sessions + crash-groups', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    handleFrame({ kind: 'event', event: makeEvent('crash') }, qc);
    const keys = spy.mock.calls.map(
      (call) => (call[0] as { queryKey: readonly string[] }).queryKey[0],
    );
    expect(keys.sort()).toEqual(['crash-groups', 'events', 'sessions']);
  });

  test('crash-group-update frame only invalidates crash-groups', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    handleFrame(
      {
        kind: 'crash-group-update',
        group: {
          fingerprint: 'fp-1',
          message: 'boom',
          firstSeen: 1,
          lastSeen: 2,
          eventCount: 1,
          sessionCount: 1,
          status: 'new',
        },
      },
      qc,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    expect((spy.mock.calls[0]![0] as { queryKey: readonly string[] }).queryKey[0]).toBe(
      'crash-groups',
    );
  });

  test('hello and error frames are no-ops for the query cache', () => {
    const qc = new QueryClient();
    const spy = vi.spyOn(qc, 'invalidateQueries');
    handleFrame({ kind: 'hello', serverTime: 1 }, qc);
    handleFrame({ kind: 'error', message: 'rate limited' }, qc);
    expect(spy).not.toHaveBeenCalled();
  });
});
