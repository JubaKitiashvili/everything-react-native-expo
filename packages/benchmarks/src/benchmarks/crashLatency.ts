// Task 117.91 — crash capture latency benchmark.
//
// Subjects own the actual collector wiring (each SDK has a different
// shape) and pass back a `latency-capture` callback the harness uses
// to drive iterations. The harness owns timing + percentile maths.

import type {
  BenchmarkContext,
  BenchmarkResult,
  CrashLatencyMeasurement,
  Subject,
} from '../types.js';
import { runBenchmark } from './runBenchmark.js';

export async function runCrashLatency(
  subject: Subject,
  ctx: BenchmarkContext,
): Promise<BenchmarkResult> {
  return runBenchmark({
    benchmark: 'crash_latency',
    subject,
    ctx,
    measure: async (s, c) => s.measureCrashLatency(c),
  });
}

/**
 * Compute p50 / p95 / p99 / max over a sample of latencies. Sample is
 * mutated in place (sorted) — pass a copy if the caller needs the
 * original ordering.
 */
export function summarise(samples: number[]): CrashLatencyMeasurement {
  if (samples.length === 0) {
    return { iterations: 0, p50Ms: 0, p95Ms: 0, p99Ms: 0, maxMs: 0 };
  }
  samples.sort((a, b) => a - b);
  return {
    iterations: samples.length,
    p50Ms: percentile(samples, 0.5),
    p95Ms: percentile(samples, 0.95),
    p99Ms: percentile(samples, 0.99),
    maxMs: samples[samples.length - 1] ?? 0,
  };
}

/**
 * Linear-interpolation percentile. `p` is in `[0, 1]`. Empty input
 * returns 0 so callers don't have to special-case it.
 */
export function percentile(sortedSamples: number[], p: number): number {
  if (sortedSamples.length === 0) return 0;
  if (sortedSamples.length === 1) return sortedSamples[0]!;
  const clamped = Math.max(0, Math.min(1, p));
  const idx = clamped * (sortedSamples.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  const t = idx - lo;
  const a = sortedSamples[lo] ?? 0;
  const b = sortedSamples[hi] ?? a;
  return a + (b - a) * t;
}
