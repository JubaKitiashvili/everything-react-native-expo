import { afterEach, describe, expect, test } from 'vitest';
import { DashboardStore } from '../storage/sqliteStore.js';
import type { EventRecord } from '../storage/types.js';
import {
  crashGroupCommonFrames,
  extractCommonFrames,
  framesFromPayload,
  splitStackString,
} from './commonFrames.js';

const NOW = 1_770_000_000_000;

function openInMemory(): DashboardStore {
  return new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
}

function makeEvent(partial: Partial<EventRecord> = {}): EventRecord {
  return {
    id: partial.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    type: partial.type ?? 'crash',
    severity: partial.severity ?? 'critical',
    sessionId: partial.sessionId ?? 'session-a',
    timestamp: partial.timestamp ?? NOW,
    receivedAt: partial.receivedAt ?? NOW + 100,
    payload: partial.payload ?? {},
    ...partial,
  };
}

describe('extractCommonFrames — prefix detection', () => {
  test('detects shared leading prefix across stacks', () => {
    const result = extractCommonFrames([
      ['a', 'b', 'c', 'd'],
      ['a', 'b', 'x', 'y'],
      ['a', 'b', 'c', 'z'],
    ]);
    expect(result.commonPrefix).toEqual(['a', 'b']);
  });

  test('full match when all stacks identical', () => {
    const result = extractCommonFrames([
      ['a', 'b', 'c'],
      ['a', 'b', 'c'],
    ]);
    expect(result.commonPrefix).toEqual(['a', 'b', 'c']);
    expect(result.commonFrames).toEqual(['a', 'b', 'c']);
  });

  test('prefix stops at first divergence even with differing lengths', () => {
    const result = extractCommonFrames([
      ['top', 'mid'],
      ['top', 'mid', 'extra', 'more'],
      ['top', 'mid', 'different'],
    ]);
    expect(result.commonPrefix).toEqual(['top', 'mid']);
  });

  test('no common prefix when first frames differ', () => {
    const result = extractCommonFrames([
      ['a', 'b'],
      ['x', 'b'],
    ]);
    expect(result.commonPrefix).toEqual([]);
  });
});

describe('extractCommonFrames — intersection', () => {
  test('finds frames present in all stacks regardless of position', () => {
    const result = extractCommonFrames([
      ['a', 'shared', 'b'],
      ['c', 'd', 'shared'],
      ['shared', 'e'],
    ]);
    expect(result.commonFrames).toEqual(['shared']);
    expect(result.commonPrefix).toEqual([]); // first frames differ
  });

  test('intersection order follows the first stack', () => {
    const result = extractCommonFrames([
      ['x', 'y', 'z'],
      ['z', 'x', 'y'],
    ]);
    expect(result.commonFrames).toEqual(['x', 'y', 'z']);
  });

  test('dedupes repeated frames inside a single stack', () => {
    const result = extractCommonFrames([
      ['a', 'a', 'b'],
      ['a', 'b', 'a'],
    ]);
    expect(result.commonFrames).toEqual(['a', 'b']);
  });

  test('disjoint stacks produce empty intersection and prefix', () => {
    const result = extractCommonFrames([
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(result.commonFrames).toEqual([]);
    expect(result.commonPrefix).toEqual([]);
  });
});

describe('extractCommonFrames — edge cases', () => {
  test('empty input returns empty result', () => {
    expect(extractCommonFrames([])).toEqual({ commonPrefix: [], commonFrames: [] });
  });

  test('single stack returns its frames for both prefix and intersection', () => {
    const result = extractCommonFrames([['only', 'one', 'stack']]);
    expect(result.commonPrefix).toEqual(['only', 'one', 'stack']);
    expect(result.commonFrames).toEqual(['only', 'one', 'stack']);
  });

  test('an empty stack collapses prefix and intersection', () => {
    const result = extractCommonFrames([['a', 'b'], []]);
    expect(result.commonPrefix).toEqual([]);
    expect(result.commonFrames).toEqual([]);
  });

  test('single empty stack', () => {
    const result = extractCommonFrames([[]]);
    expect(result.commonPrefix).toEqual([]);
    expect(result.commonFrames).toEqual([]);
  });
});

describe('splitStackString', () => {
  test('splits newline-joined frames and trims', () => {
    expect(splitStackString('  a \n b \r\n c ')).toEqual(['a', 'b', 'c']);
  });

  test('drops blank lines', () => {
    expect(splitStackString('a\n\n\nb')).toEqual(['a', 'b']);
  });

  test('empty string yields empty array', () => {
    expect(splitStackString('')).toEqual([]);
  });
});

describe('framesFromPayload', () => {
  test('prefers structured stackFrames array', () => {
    expect(framesFromPayload({ stackFrames: ['f1', ' f2 '], stack: 'ignored' })).toEqual([
      'f1',
      'f2',
    ]);
  });

  test('falls back to newline stack string', () => {
    expect(framesFromPayload({ stack: 'a\nb' })).toEqual(['a', 'b']);
  });

  test('returns empty when neither present', () => {
    expect(framesFromPayload({ message: 'boom' })).toEqual([]);
  });
});

describe('crashGroupCommonFrames — store integration', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('pulls recent event stacks for a fingerprint and computes commons', () => {
    store = openInMemory();
    store.insertEvent(
      makeEvent({
        id: 'c1',
        fingerprint: 'fp-x',
        payload: {
          stack: 'TypeError\n    at A.render (A.tsx:1)\n    at B (B.tsx:2)',
        },
      }),
    );
    store.insertEvent(
      makeEvent({
        id: 'c2',
        fingerprint: 'fp-x',
        payload: {
          stack: 'TypeError\n    at A.render (A.tsx:1)\n    at C (C.tsx:9)',
        },
      }),
    );
    // Different fingerprint — must be ignored.
    store.insertEvent(
      makeEvent({ id: 'other', fingerprint: 'fp-y', payload: { stack: 'X\nY' } }),
    );

    const result = crashGroupCommonFrames(store, 'fp-x');
    expect(result.fingerprint).toBe('fp-x');
    expect(result.stackCount).toBe(2);
    expect(result.commonPrefix).toEqual(['TypeError', 'at A.render (A.tsx:1)']);
    expect(result.commonFrames).toEqual(['TypeError', 'at A.render (A.tsx:1)']);
  });

  test('skips events with no stack', () => {
    store = openInMemory();
    store.insertEvent(
      makeEvent({ id: 'd1', fingerprint: 'fp-z', payload: { stack: 'a\nb' } }),
    );
    store.insertEvent(makeEvent({ id: 'd2', fingerprint: 'fp-z', payload: { message: 'no stack' } }));

    const result = crashGroupCommonFrames(store, 'fp-z');
    expect(result.stackCount).toBe(1);
    expect(result.commonPrefix).toEqual(['a', 'b']);
  });

  test('unknown fingerprint yields empty result', () => {
    store = openInMemory();
    const result = crashGroupCommonFrames(store, 'nope');
    expect(result.stackCount).toBe(0);
    expect(result.commonPrefix).toEqual([]);
    expect(result.commonFrames).toEqual([]);
  });
});
