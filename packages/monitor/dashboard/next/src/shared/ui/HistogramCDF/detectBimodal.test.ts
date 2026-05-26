// Task 117.16 — detectBimodal tests.

import { describe, expect, test } from 'vitest';
import { computeHistogram } from './computeHistogram';
import { detectBimodal } from './detectBimodal';

/** Generate `n` samples from a triangular distribution centred at `centre`. */
function triangular(centre: number, halfWidth: number, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1 || 1);
    // Tent function: peaks at centre, zero at centre±halfWidth.
    const offset = (u - 0.5) * 2 * halfWidth;
    out.push(centre + offset);
  }
  return out;
}

describe('detectBimodal', () => {
  test('flags too-few-samples when total count is below threshold', () => {
    const out = detectBimodal(computeHistogram([1, 2, 3, 4, 5]).buckets);
    expect(out.isBimodal).toBe(false);
    expect(out.reason).toBe('too-few-samples');
  });

  test('flags insufficient-buckets for very narrow histograms', () => {
    const samples = Array.from({ length: 100 }, (_, i) => Math.floor(i / 25));
    const buckets = computeHistogram(samples, { bucketCount: 4 }).buckets;
    const out = detectBimodal(buckets);
    expect(out.isBimodal).toBe(false);
    expect(out.reason).toBe('insufficient-buckets');
  });

  test('returns unimodal for a single triangular distribution', () => {
    const samples = triangular(50, 20, 200);
    const out = detectBimodal(computeHistogram(samples).buckets);
    expect(out.isBimodal).toBe(false);
    expect(out.reason).toMatch(/unimodal|peaks-too-close/);
  });

  test('returns bimodal for two well-separated triangular peaks', () => {
    const samples = [...triangular(20, 5, 200), ...triangular(80, 5, 200)];
    const histogram = computeHistogram(samples, { bucketCount: 24 });
    const out = detectBimodal(histogram.buckets);
    expect(out.isBimodal).toBe(true);
    expect(out.reason).toBe('bimodal');
    expect(out.peaks).toHaveLength(2);
    expect(out.peaks[0]!.start).toBeLessThan(out.peaks[1]!.start);
    expect(out.antiMode).not.toBeNull();
    // Trough must be lower than both peaks.
    expect(out.antiMode!.count).toBeLessThan(out.peaks[0]!.count);
    expect(out.antiMode!.count).toBeLessThan(out.peaks[1]!.count);
  });

  test('rejects a shallow trough between two peaks', () => {
    // Two peaks of 20 each, lowest valley between them is 17 — only
    // a 15% drop, well above the 0.6 threshold, so the histogram is
    // effectively one wide plateau, not two populations.
    const buckets = synthBuckets([0, 0, 5, 20, 18, 17, 18, 20, 5, 0]);
    const out = detectBimodal(buckets, { minSeparationBuckets: 2, minTotalCount: 10 });
    expect(out.isBimodal).toBe(false);
    expect(out.reason).toBe('trough-too-shallow');
  });

  test('rejects two peaks that are too close together', () => {
    const buckets = synthBuckets([0, 0, 0, 30, 5, 30, 0, 0, 0, 0]);
    const out = detectBimodal(buckets, { minSeparationBuckets: 5, minTotalCount: 10 });
    expect(out.isBimodal).toBe(false);
    expect(out.reason).toBe('peaks-too-close');
  });

  test('returns flat for a histogram with no strict peaks', () => {
    const buckets = synthBuckets(new Array(10).fill(5));
    const out = detectBimodal(buckets, { minTotalCount: 1 });
    expect(out.isBimodal).toBe(false);
    expect(out.reason).toBe('flat');
  });
});

/**
 * Build a histogram bucket array directly from counts so the bimodal
 * tests can ignore the binning details.
 */
function synthBuckets(counts: number[]): Array<{ start: number; end: number; count: number }> {
  return counts.map((count, i) => ({ start: i, end: i + 1, count }));
}
