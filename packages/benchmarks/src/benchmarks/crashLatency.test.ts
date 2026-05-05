// Task 117.91 — crash_latency benchmark helpers.

import { describe, expect, test } from 'vitest';
import { percentile, summarise } from './crashLatency.js';

describe('percentile', () => {
  test('returns 0 on empty input', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  test('returns the only sample on a 1-element array', () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.99)).toBe(42);
  });

  test('linearly interpolates between samples', () => {
    expect(percentile([0, 100], 0.5)).toBe(50);
    expect(percentile([0, 100], 0)).toBe(0);
    expect(percentile([0, 100], 1)).toBe(100);
  });

  test('clamps p outside [0, 1]', () => {
    expect(percentile([0, 100], -1)).toBe(0);
    expect(percentile([0, 100], 5)).toBe(100);
  });
});

describe('summarise', () => {
  test('produces zeros on empty samples', () => {
    expect(summarise([])).toEqual({
      iterations: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
    });
  });

  test('returns sorted-percentile aggregates', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i + 1);
    const result = summarise(samples);
    expect(result.iterations).toBe(100);
    expect(result.maxMs).toBe(100);
    // 50th percentile of 1..100 by linear interp = 50.5
    expect(result.p50Ms).toBeCloseTo(50.5, 1);
    expect(result.p95Ms).toBeCloseTo(95.05, 1);
    expect(result.p99Ms).toBeCloseTo(99.01, 1);
  });
});
