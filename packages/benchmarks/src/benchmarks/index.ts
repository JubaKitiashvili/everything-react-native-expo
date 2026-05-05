// Task 117.91 — benchmark registry.

import { runBundleSize } from './bundleSize.js';
import { runCrashLatency } from './crashLatency.js';
import { runInstallTime } from './installTime.js';
import { runSymbolicationAccuracy } from './symbolicationAccuracy.js';
import type { BenchmarkContext, BenchmarkId, BenchmarkResult, Subject } from '../types.js';

export type BenchmarkRunner = (subject: Subject, ctx: BenchmarkContext) => Promise<BenchmarkResult>;

export const BENCHMARKS: Record<BenchmarkId, BenchmarkRunner> = {
  bundle_size: runBundleSize,
  crash_latency: runCrashLatency,
  install_time: runInstallTime,
  symbolication_accuracy: runSymbolicationAccuracy,
};

export const BENCHMARK_IDS: BenchmarkId[] = [
  'bundle_size',
  'crash_latency',
  'install_time',
  'symbolication_accuracy',
];
