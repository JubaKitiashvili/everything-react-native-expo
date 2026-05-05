// Task 117.91 — generic benchmark runner.
//
// Every benchmark looks the same once you strip out the actual
// measurement: time the call, capture the result, normalise into a
// BenchmarkResult, swallow + report errors so one subject can't bring
// down the whole table. This module owns that boilerplate so the
// per-benchmark files only have to expose the subject method to call.

import type {
  BenchmarkContext,
  BenchmarkId,
  BenchmarkMeasurement,
  BenchmarkResult,
  Subject,
} from '../types.js';

export interface RunBenchmarkOptions {
  benchmark: BenchmarkId;
  subject: Subject;
  ctx: BenchmarkContext;
  measure: (subject: Subject, ctx: BenchmarkContext) => Promise<BenchmarkMeasurement | null>;
}

export async function runBenchmark(options: RunBenchmarkOptions): Promise<BenchmarkResult> {
  const { benchmark, subject, ctx, measure } = options;
  const startedAt = new Date().toISOString();
  const start = ctx.now();
  let measurement: BenchmarkMeasurement | null = null;
  let unavailableReason: string | undefined;
  try {
    measurement = await measure(subject, ctx);
    if (measurement === null) {
      unavailableReason = unavailableReasonFor(subject.status, benchmark);
    }
  } catch (err) {
    measurement = null;
    unavailableReason = `error: ${err instanceof Error ? err.message : String(err)}`;
  }
  const durationMs = ctx.now() - start;
  const result: BenchmarkResult = {
    benchmark,
    subjectId: subject.id,
    subjectLabel: subject.label,
    subjectVersion: subject.version,
    status: subject.status,
    measurement,
    durationMs,
    startedAt,
  };
  if (unavailableReason !== undefined) result.unavailableReason = unavailableReason;
  return result;
}

function unavailableReasonFor(status: Subject['status'], benchmark: BenchmarkId): string {
  if (status === 'unsupported') return 'subject does not support this benchmark';
  if (status === 'documented_placeholder') {
    return `placeholder: see src/subjects/${benchmark}-runbook for integration steps`;
  }
  return 'measurement returned null';
}
