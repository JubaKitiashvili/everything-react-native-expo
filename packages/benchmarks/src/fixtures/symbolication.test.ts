// Task 117.91 — symbolication fixture sanity tests.

import { describe, expect, test } from 'vitest';
import { applyFixtureMapping, fixtureFrames, fixtureMapping } from './symbolication.js';

describe('symbolication fixture', () => {
  test('contains exactly 50 frames spanning all three categories', () => {
    expect(fixtureFrames).toHaveLength(50);
    const cats = new Set(fixtureFrames.map((f) => f.category));
    expect(cats).toEqual(new Set(['hermes', 'proguard', 'dsym']));
  });

  test('every frame has a corresponding mapping entry', () => {
    for (const frame of fixtureFrames) {
      const mapped = applyFixtureMapping(frame, fixtureMapping);
      expect(mapped.file).toBe(frame.expectedFile);
      expect(mapped.line).toBe(frame.expectedLine);
    }
  });

  test('returns null for an unknown raw frame', () => {
    const result = applyFixtureMapping(
      { category: 'hermes', raw: '0xZZZZZZ', expectedFile: '', expectedLine: 0 },
      fixtureMapping,
    );
    expect(result.file).toBeNull();
    expect(result.line).toBeNull();
  });
});
