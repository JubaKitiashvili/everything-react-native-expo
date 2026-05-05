// Task 117.91 — symbolication_accuracy benchmark unit tests.

import { describe, expect, test } from 'vitest';
import { summariseVerdicts, type FrameVerdict } from './symbolicationAccuracy.js';

describe('summariseVerdicts', () => {
  test('returns zeros on an empty input', () => {
    const out = summariseVerdicts([]);
    expect(out.accuracy).toBe(0);
    expect(out.frameCount).toBe(0);
    expect(out.correctFrames).toBe(0);
    expect(out.byCategory).toEqual([]);
  });

  test('produces per-category roll-ups', () => {
    const verdicts: FrameVerdict[] = [
      { category: 'hermes', correct: true },
      { category: 'hermes', correct: true },
      { category: 'hermes', correct: false },
      { category: 'proguard', correct: true },
      { category: 'dsym', correct: false },
    ];
    const out = summariseVerdicts(verdicts);
    expect(out.frameCount).toBe(5);
    expect(out.correctFrames).toBe(3);
    expect(out.accuracy).toBeCloseTo(3 / 5, 5);
    const map = Object.fromEntries(out.byCategory.map((c) => [c.category, c]));
    expect(map.hermes).toEqual({ category: 'hermes', correct: 2, total: 3 });
    expect(map.proguard).toEqual({ category: 'proguard', correct: 1, total: 1 });
    expect(map.dsym).toEqual({ category: 'dsym', correct: 0, total: 1 });
  });
});
