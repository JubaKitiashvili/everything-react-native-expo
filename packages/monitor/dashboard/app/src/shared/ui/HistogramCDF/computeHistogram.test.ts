// Task 117.16 — computeHistogram + computeCdf + percentile tests.

import { describe, expect, test } from 'vitest';
import { computeCdf, computeHistogram, percentile } from './computeHistogram';

describe('computeHistogram', () => {
  test('returns an empty result for an empty sample array', () => {
    const out = computeHistogram([]);
    expect(out.buckets).toEqual([]);
    expect(out.totalCount).toBe(0);
    expect(out.bucketWidth).toBe(0);
    expect(Number.isNaN(out.min)).toBe(true);
    expect(Number.isNaN(out.max)).toBe(true);
  });

  test('collapses a flat series into a single 1-wide bucket', () => {
    const out = computeHistogram([5, 5, 5, 5]);
    expect(out.buckets).toHaveLength(1);
    expect(out.buckets[0]?.count).toBe(4);
    expect(out.bucketWidth).toBe(1);
    expect(out.min).toBe(5);
    expect(out.max).toBe(5);
  });

  test('produces a uniform-width binning over a known range', () => {
    const samples = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    const out = computeHistogram(samples, { bucketCount: 5 });
    expect(out.buckets).toHaveLength(5);
    expect(out.bucketWidth).toBeCloseTo(1.8, 5);
    expect(out.totalCount).toBe(10);
    // Every bucket should be non-empty for an evenly-spread series.
    expect(out.buckets.every((b) => b.count > 0)).toBe(true);
  });

  test('honours an explicit domain override', () => {
    const out = computeHistogram([5, 6, 7], { bucketCount: 4, domain: { min: 0, max: 10 } });
    expect(out.min).toBe(0);
    expect(out.max).toBe(10);
    expect(out.buckets).toHaveLength(4);
  });

  test('clamps bucketCount into a sane range', () => {
    expect(computeHistogram([1, 2, 3], { bucketCount: 0 }).buckets.length).toBe(1);
    expect(computeHistogram([1, 2, 3], { bucketCount: 99999 }).buckets.length).toBe(1024);
  });

  test('skips non-finite samples instead of crashing', () => {
    const out = computeHistogram([1, 2, Infinity, NaN, 3]);
    expect(out.totalCount).toBe(3);
    expect(out.min).toBe(1);
    expect(out.max).toBe(3);
  });

  test('captures the boundary sample at max in the last bucket', () => {
    const out = computeHistogram([0, 5, 10], { bucketCount: 5 });
    const last = out.buckets[out.buckets.length - 1]!;
    expect(last.count).toBe(1);
    expect(last.end).toBe(10);
  });
});

describe('percentile', () => {
  test('returns 0 for an empty array', () => {
    expect(percentile([], 0.5)).toBe(0);
  });

  test('returns the only sample on a 1-element array', () => {
    expect(percentile([42], 0.5)).toBe(42);
    expect(percentile([42], 0.99)).toBe(42);
  });

  test('linearly interpolates between adjacent samples', () => {
    expect(percentile([0, 100], 0.5)).toBe(50);
  });

  test('clamps p outside [0, 1]', () => {
    expect(percentile([0, 100], -1)).toBe(0);
    expect(percentile([0, 100], 5)).toBe(100);
  });

  test('does not require pre-sorted input', () => {
    expect(percentile([100, 0, 50], 0.5)).toBe(50);
  });
});

describe('computeCdf', () => {
  test('produces a monotonically non-decreasing curve from 0 to 1', () => {
    const out = computeHistogram([1, 1, 2, 2, 3, 3, 4, 4, 5, 5], { bucketCount: 5 });
    const cdf = computeCdf(out.buckets, out.totalCount);
    expect(cdf).toHaveLength(5);
    for (let i = 1; i < cdf.length; i++) {
      expect(cdf[i]).toBeGreaterThanOrEqual(cdf[i - 1]!);
    }
    expect(cdf[cdf.length - 1]).toBeCloseTo(1, 5);
  });

  test('returns all-zero curve for an empty histogram', () => {
    const cdf = computeCdf([], 0);
    expect(cdf).toEqual([]);
  });
});
