// Task 117.16 — bimodal distribution detection.
//
// Latency histograms in mobile apps are routinely bimodal — cold-start
// requests pile up near the slow peak, warm-cache requests near the
// fast peak. A single P95 number averages those two populations
// together and hides the actual story. This module flags the shape so
// the dashboard can show a "Bimodal" pill that nudges the operator to
// drill in.
//
// Algorithm: a derivative-sign-change peak finder with a
// min-prominence threshold. We accept a histogram as the bucket count
// array (post-binning). A peak is a bucket strictly greater than its
// immediate neighbours; we require two peaks separated by at least
// `minSeparationBuckets` buckets, with the trough between them at
// most `troughRatio` of the smaller peak. Both knobs default to
// values tuned on synthetic latency mixtures (see the unit tests).

import type { HistogramBucket } from './computeHistogram.js';

export interface DetectBimodalOptions {
  /**
   * Bucket distance the two peaks must be apart. Prevents flagging a
   * jagged single-mode histogram as bimodal because two adjacent
   * buckets happened to tie. Default 4.
   */
  minSeparationBuckets?: number;
  /**
   * Trough-to-peak ratio threshold. The valley between the two peaks
   * must be ≤ `troughRatio * min(peakA, peakB)` for the histogram to
   * count as bimodal. Default 0.6 — a peak of 100 with a valley of
   * 60 still counts; 70 doesn't.
   */
  troughRatio?: number;
  /**
   * Minimum total samples below which we don't even try — small
   * samples are too noisy to call. Default 30.
   */
  minTotalCount?: number;
}

export interface DetectBimodalResult {
  isBimodal: boolean;
  /** The two highest peaks, ordered low → high by start. */
  peaks: Array<{ index: number; count: number; start: number; end: number }>;
  /** The lowest bucket strictly between the two peaks, when bimodal. */
  antiMode: { index: number; count: number; start: number; end: number } | null;
  /** Reason the result is what it is — handy for telemetry + tests. */
  reason:
    | 'bimodal'
    | 'unimodal'
    | 'flat'
    | 'too-few-samples'
    | 'insufficient-buckets'
    | 'peaks-too-close'
    | 'trough-too-shallow';
}

const DEFAULT_OPTIONS: Required<DetectBimodalOptions> = {
  minSeparationBuckets: 4,
  troughRatio: 0.6,
  minTotalCount: 30,
};

export function detectBimodal(
  buckets: readonly HistogramBucket[],
  options: DetectBimodalOptions = {},
): DetectBimodalResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const totalCount = buckets.reduce((sum, b) => sum + b.count, 0);
  if (totalCount < opts.minTotalCount) {
    return { isBimodal: false, peaks: [], antiMode: null, reason: 'too-few-samples' };
  }
  if (buckets.length < 5) {
    return { isBimodal: false, peaks: [], antiMode: null, reason: 'insufficient-buckets' };
  }

  const peaks = findPeaks(buckets);
  if (peaks.length === 0) {
    return { isBimodal: false, peaks: [], antiMode: null, reason: 'flat' };
  }
  if (peaks.length === 1) {
    return {
      isBimodal: false,
      peaks: peaks.map((p) => describe(buckets, p.index)),
      antiMode: null,
      reason: 'unimodal',
    };
  }

  // Pick the top two peaks by count.
  peaks.sort((a, b) => b.count - a.count);
  const [first, second] = peaks;
  if (!first || !second) {
    return { isBimodal: false, peaks: [], antiMode: null, reason: 'unimodal' };
  }

  if (Math.abs(first.index - second.index) < opts.minSeparationBuckets) {
    return {
      isBimodal: false,
      peaks: [describe(buckets, first.index), describe(buckets, second.index)].sort(
        (a, b) => a.start - b.start,
      ),
      antiMode: null,
      reason: 'peaks-too-close',
    };
  }

  // Find the lowest bucket strictly between the two peaks.
  const lo = Math.min(first.index, second.index);
  const hi = Math.max(first.index, second.index);
  let troughIdx = lo + 1;
  for (let i = lo + 1; i < hi; i++) {
    if ((buckets[i]?.count ?? 0) < (buckets[troughIdx]?.count ?? 0)) troughIdx = i;
  }
  const troughCount = buckets[troughIdx]?.count ?? 0;
  const smallerPeak = Math.min(first.count, second.count);
  if (smallerPeak === 0 || troughCount > opts.troughRatio * smallerPeak) {
    return {
      isBimodal: false,
      peaks: [describe(buckets, first.index), describe(buckets, second.index)].sort(
        (a, b) => a.start - b.start,
      ),
      antiMode: null,
      reason: 'trough-too-shallow',
    };
  }

  return {
    isBimodal: true,
    peaks: [describe(buckets, first.index), describe(buckets, second.index)].sort(
      (a, b) => a.start - b.start,
    ),
    antiMode: describe(buckets, troughIdx),
    reason: 'bimodal',
  };
}

interface PeakHit {
  index: number;
  count: number;
}

/**
 * Find every strict local maximum. A bucket is a peak iff its count is
 * strictly greater than its immediate neighbour on both sides. Edge
 * buckets are peaks if their inner neighbour is strictly smaller.
 */
function findPeaks(buckets: readonly HistogramBucket[]): PeakHit[] {
  const out: PeakHit[] = [];
  for (let i = 0; i < buckets.length; i++) {
    const here = buckets[i]?.count ?? 0;
    const left = i > 0 ? (buckets[i - 1]?.count ?? 0) : -Infinity;
    const right = i < buckets.length - 1 ? (buckets[i + 1]?.count ?? 0) : -Infinity;
    if (here > left && here > right && here > 0) {
      out.push({ index: i, count: here });
    }
  }
  return out;
}

function describe(
  buckets: readonly HistogramBucket[],
  index: number,
): { index: number; count: number; start: number; end: number } {
  const b = buckets[index]!;
  return { index, count: b.count, start: b.start, end: b.end };
}
