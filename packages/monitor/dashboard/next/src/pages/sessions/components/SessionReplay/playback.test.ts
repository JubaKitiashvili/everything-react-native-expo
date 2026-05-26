import { describe, expect, test } from 'vitest';
import { advanceScrubber, extractReplayFrames, selectFrame, type ReplayFrame } from './playback';
import type { EventRecord } from '@/shared/api/types';

function frame(partial: Partial<ReplayFrame>): ReplayFrame {
  return {
    id: partial.id ?? `f-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: partial.timestamp ?? 0,
    ...partial,
  };
}

describe('extractReplayFrames', () => {
  test('keeps replay_frame events with an image, sorts ascending by timestamp, drops other types', () => {
    const events: EventRecord[] = [
      {
        id: 'b',
        type: 'replay_frame',
        severity: 'info',
        sessionId: 's1',
        timestamp: 2_000,
        receivedAt: 2_010,
        payload: { image: 'data:image/png;base64,BBB', screen: 'Settings' },
      },
      {
        id: 'other',
        type: 'custom',
        severity: 'info',
        sessionId: 's1',
        timestamp: 1_500,
        receivedAt: 1_510,
        payload: {},
      },
      {
        id: 'a',
        type: 'replay_frame',
        severity: 'info',
        sessionId: 's1',
        timestamp: 1_000,
        receivedAt: 1_010,
        payload: {
          image: 'data:image/png;base64,AAA',
          screen: 'Home',
          masks: [{ x: 0, y: 0, width: 100, height: 20, reason: 'email' }],
        },
      },
    ];
    const frames = extractReplayFrames(events);
    expect(frames.map((f) => f.id)).toEqual(['a', 'b']);
    expect(frames[0]?.masks).toHaveLength(1);
    expect(frames[0]?.screen).toBe('Home');
  });
});

describe('selectFrame', () => {
  const frames = [
    frame({ id: 'a', timestamp: 1_000 }),
    frame({ id: 'b', timestamp: 2_000 }),
    frame({ id: 'c', timestamp: 3_000 }),
  ];

  test('returns the newest frame whose timestamp is ≤ the scrubber', () => {
    expect(selectFrame(frames, 999)).toBeNull();
    expect(selectFrame(frames, 1_000)?.id).toBe('a');
    expect(selectFrame(frames, 2_500)?.id).toBe('b');
    expect(selectFrame(frames, 10_000)?.id).toBe('c');
  });

  test('returns null for an empty frame list', () => {
    expect(selectFrame([], 5)).toBeNull();
  });
});

describe('advanceScrubber', () => {
  test('multiplies elapsed wall time by the playback rate', () => {
    expect(advanceScrubber(0, 100, 1, 0, 10_000)).toEqual({ ts: 100, done: false });
    expect(advanceScrubber(0, 100, 2, 0, 10_000)).toEqual({ ts: 200, done: false });
    expect(advanceScrubber(0, 100, 4, 0, 10_000)).toEqual({ ts: 400, done: false });
  });

  test('clamps at maxTs and flags done when the ceiling engages', () => {
    expect(advanceScrubber(9_800, 300, 1, 0, 10_000)).toEqual({ ts: 10_000, done: true });
  });

  test('leaves a non-positive elapsed tick as a no-op but still reports done if already past ceiling', () => {
    expect(advanceScrubber(5_000, 0, 1, 0, 10_000)).toEqual({ ts: 5_000, done: false });
    expect(advanceScrubber(10_000, 0, 1, 0, 10_000)).toEqual({ ts: 10_000, done: true });
  });
});
