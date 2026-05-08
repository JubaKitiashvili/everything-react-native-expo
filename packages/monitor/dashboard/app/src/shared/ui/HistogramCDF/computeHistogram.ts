// Task 117.16 — pure histogram + CDF + percentile maths.
//
// Latency distributions in mobile apps are routinely bimodal: cold-start
// requests sit near the slow peak, warm-cache requests near the fast
// peak. A single P95 line hides this — the dashboard needs both the
// shape (histogram + CDF curve) and a flag that says "this looks
// bimodal" so the operator knows to drill in.

export interface HistogramBucket {
  /** Inclusive lower bound of this bucket. */
  start: number;
  /** Exclusive upper bound (inclusive on the last bucket). */
  end: number;
  /** Number of samples that fell inside `[start, end)`. */
  count: number;
}

export interface HistogramResult {
  buckets: HistogramBucket[];
  /** Width of each bucket — uniform across the histogram. */
  bucketWidth: number;
  /** Total number of samples summed across every bucket. */
  totalCount: number;
  /** Smallest sample in the input. NaN when the input is empty. */
  min: number;
  /** Largest sample. NaN when empty. */
  max: number;
}

export interface ComputeHistogramOptions {
  /**
   * Number of buckets to bin into. Default 24 — wide enough to spot a
   * bimodal split, narrow enough to avoid jagged rendering on short
   * series. Clamped to `[1, 1024]` so a misconfigured caller can't
   * allocate megabytes of empty buckets.
   */
  bucketCount?: number;
  /**
   * Override the histogram's domain. When omitted, derived from the
   * samples (`min`..`max`). Useful when the dashboard wants to keep
   * the X-axis stable across re-renders so the bucket positions
   * don't dance under live data.
   */
  domain?: { min: number; max: number };
}

/**
 * Bin a sample array into uniform-width buckets. Returns an empty
 * histogram for empty input rather than throwing — callers can render
 * an empty-state placeholder without special-casing.
 */
export function computeHistogram(
  samples: readonly number[],
  options: ComputeHistogramOptions = {},
): HistogramResult {
  const bucketCount = clamp(Math.round(options.bucketCount ?? 24), 1, 1024);

  if (samples.length === 0) {
    return {
      buckets: [],
      bucketWidth: 0,
      totalCount: 0,
      min: Number.NaN,
      max: Number.NaN,
    };
  }

  let min: number;
  let max: number;
  if (options.domain) {
    min = options.domain.min;
    max = options.domain.max;
  } else {
    min = Number.POSITIVE_INFINITY;
    max = Number.NEGATIVE_INFINITY;
    for (const v of samples) {
      if (!Number.isFinite(v)) continue;
      if (v < min) min = v;
      if (v > max) max = v;
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) {
      return {
        buckets: [],
        bucketWidth: 0,
        totalCount: 0,
        min: Number.NaN,
        max: Number.NaN,
      };
    }
  }

  // A flat series (every sample identical) collapses to one wide bucket
  // so we don't emit a histogram with width 0.
  const span = max - min;
  const effectiveBuckets = span === 0 ? 1 : bucketCount;
  const bucketWidth = span === 0 ? 1 : span / effectiveBuckets;

  const buckets: HistogramBucket[] = [];
  for (let i = 0; i < effectiveBuckets; i++) {
    buckets.push({
      start: min + i * bucketWidth,
      end: min + (i + 1) * bucketWidth,
      count: 0,
    });
  }

  let total = 0;
  for (const v of samples) {
    if (!Number.isFinite(v)) continue;
    if (v < min || v > max) continue;
    let idx = Math.floor((v - min) / bucketWidth);
    if (idx >= effectiveBuckets) idx = effectiveBuckets - 1;
    if (idx < 0) idx = 0;
    buckets[idx]!.count += 1;
    total += 1;
  }

  return { buckets, bucketWidth, totalCount: total, min, max };
}

/**
 * Linear-interpolation percentile. `p` is a fraction in `[0, 1]`. Empty
 * input returns 0 so callers don't have to special-case it.
 *
 * Mirrors the `percentile` helper in `@erne/benchmarks` — kept
 * duplicated here to avoid a runtime dependency on the benchmark
 * package from the dashboard app.
 */
export function percentile(samples: readonly number[], p: number): number {
  if (samples.length === 0) return 0;
  const sorted = samples.slice().sort((a, b) => a - b);
  if (sorted.length === 1) return sorted[0]!;
  const clamped = Math.max(0, Math.min(1, p));
  const idx = clamped * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const t = idx - lo;
  const a = sorted[lo] ?? 0;
  const b = sorted[hi] ?? a;
  return a + (b - a) * t;
}

/**
 * Cumulative distribution function over the histogram, normalised to
 * `[0, 1]`. Returns one CDF value per bucket — the value at index `i`
 * is "fraction of samples with value ≤ bucket[i].end". Empty input
 * returns an empty array.
 */
export function computeCdf(buckets: readonly HistogramBucket[], totalCount: number): number[] {
  if (totalCount === 0) return new Array(buckets.length).fill(0);
  const cdf: number[] = [];
  let running = 0;
  for (const b of buckets) {
    running += b.count;
    cdf.push(running / totalCount);
  }
  return cdf;
}

function clamp(n: number, lo: number, hi: number): number {
  if (Number.isNaN(n)) return lo;
  return Math.max(lo, Math.min(hi, n));
}
