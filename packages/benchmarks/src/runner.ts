// Task 117.91 — suite runner.
//
// Loops benchmarks × subjects, collects every BenchmarkResult, returns
// a SuiteReport ready for the formatter. No I/O of its own — the CLI
// owns argument parsing + output emission.

import { performance } from 'node:perf_hooks';
import { BENCHMARKS, BENCHMARK_IDS } from './benchmarks/index.js';
import { SUBJECTS } from './subjects/index.js';
import type {
  BenchmarkContext,
  BenchmarkId,
  BenchmarkResult,
  Subject,
  SuiteReport,
} from './types.js';

export interface RunSuiteOptions {
  workspaceRoot: string;
  benchmarks?: BenchmarkId[];
  subjectIds?: string[];
  iterations?: number;
  seed?: number;
  dryRun?: boolean;
  log?: (message: string) => void;
  /** Clock injection for deterministic durationMs in tests. */
  now?: () => number;
}

export async function runSuite(options: RunSuiteOptions): Promise<SuiteReport> {
  const benchmarks =
    options.benchmarks && options.benchmarks.length > 0 ? options.benchmarks : BENCHMARK_IDS;
  const subjects = filterSubjects(options.subjectIds);
  const log = options.log ?? ((m) => process.stderr.write(`${m}\n`));
  const now = options.now ?? (() => performance.now());
  const ctx: BenchmarkContext = {
    workspaceRoot: options.workspaceRoot,
    now,
    seed: options.seed ?? 1,
    iterations: options.iterations ?? 1000,
    dryRun: options.dryRun ?? false,
    log,
  };

  const startedAt = new Date().toISOString();
  const results: BenchmarkResult[] = [];
  for (const id of benchmarks) {
    const runner = BENCHMARKS[id];
    for (const subject of subjects) {
      log(`▶ ${id} × ${subject.id}`);
      const result = await runner(subject, ctx);
      results.push(result);
    }
  }
  const finishedAt = new Date().toISOString();

  const report: SuiteReport = {
    startedAt,
    finishedAt,
    node: process.version,
    seed: ctx.seed,
    iterations: ctx.iterations,
    results,
  };
  if (process.env.RUNNER_IMAGE) report.runnerImage = process.env.RUNNER_IMAGE;
  return report;
}

function filterSubjects(ids: string[] | undefined): Subject[] {
  if (!ids || ids.length === 0) return SUBJECTS;
  const want = new Set(ids);
  const matched = SUBJECTS.filter((s) => want.has(s.id));
  if (matched.length === 0) {
    throw new Error(`runSuite: no subjects matched ids=${ids.join(',')}`);
  }
  return matched;
}
