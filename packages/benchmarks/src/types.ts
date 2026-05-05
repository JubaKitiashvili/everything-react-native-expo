// Task 117.91 — benchmark suite types.
//
// Three concept layers:
//
//   Subject — one SDK we measure (erne, sentry, bitdrift, measure.sh, ...).
//             A Subject implements zero-or-more measure-* methods. Methods
//             that aren't applicable to the subject return `null` so the
//             runner emits a clean "not measured" row instead of a fake
//             zero. Status fields tell the reader why.
//
//   Benchmark — one measurement axis (bundle_size, crash_latency, install_time,
//               symbolication_accuracy). Benchmarks are pure functions that
//               consume a Subject and emit a BenchmarkResult.
//
//   Runner — loops benchmarks × subjects, collects results, hands the
//            collection to a formatter (markdown, json) for output.

/**
 * Subject participation level. The runner uses this to render honest
 * status badges in its output instead of producing fabricated numbers.
 */
export type SubjectStatus =
  | 'native' // Real measurement against the SDK living locally.
  | 'documented_placeholder' // Stubs ship + the README links to the integration runbook.
  | 'unsupported'; // The benchmark does not apply (e.g. a server-side product).

export type BenchmarkId =
  | 'bundle_size'
  | 'crash_latency'
  | 'install_time'
  | 'symbolication_accuracy';

export interface Subject {
  /** Stable, lowercase id for CLI flags. */
  id: string;
  /** Human-readable label for tables. */
  label: string;
  /** npm package name (used by install_time). */
  packageName: string;
  /** Pinned version we measure against. Reported in every result. */
  version: string;
  /** Per-subject participation summary. */
  status: SubjectStatus;
  /** One-paragraph notes the formatter prints below the subject's row. */
  notes?: string;
  /** Returns null when the subject does not yet implement this benchmark. */
  measureBundleSize: (ctx: BenchmarkContext) => Promise<BundleSizeMeasurement | null>;
  measureCrashLatency: (ctx: BenchmarkContext) => Promise<CrashLatencyMeasurement | null>;
  measureInstallTime: (ctx: BenchmarkContext) => Promise<InstallTimeMeasurement | null>;
  measureSymbolicationAccuracy: (
    ctx: BenchmarkContext,
  ) => Promise<SymbolicationMeasurement | null>;
}

/**
 * Shared context every benchmark receives. Carries deterministic clocks +
 * RNG seeds + the workspace root so subjects can resolve sibling packages
 * by relative path without depending on `process.cwd()`.
 */
export interface BenchmarkContext {
  workspaceRoot: string;
  /** Monotonic clock for latency measurements. Defaults to `performance.now`. */
  now: () => number;
  /** Seed used by sampled benchmarks (crash_latency). */
  seed: number;
  /**
   * When `true`, network-touching benchmarks (install_time) skip and return
   * `null` so the runner stays fast on PRs and offline.
   */
  dryRun: boolean;
  /** Iteration count for sampled benchmarks. Defaults to 1000. */
  iterations: number;
  /**
   * Optional logger surface so tests can capture progress. Production
   * default writes a single status line per benchmark to stderr.
   */
  log: (message: string) => void;
}

export interface BundleSizeMeasurement {
  /** Sum of gzipped bytes across every reachable file from the entry. */
  totalGzipBytes: number;
  /** Top files by gzip size for the formatter to render. */
  largestFiles: Array<{ path: string; gzipBytes: number }>;
  /** Number of files traversed. */
  fileCount: number;
  /** Entry file inspected. */
  entry: string;
}

export interface CrashLatencyMeasurement {
  /** Iteration count actually run (subjects may downsample). */
  iterations: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface InstallTimeMeasurement {
  /** Wall-clock seconds for `npm install <package>` with cache primed. */
  warmSeconds: number;
  /** Wall-clock seconds with `npm cache clean --force` first. */
  coldSeconds: number | null;
  /** npm version observed (so reruns can spot version drift). */
  npmVersion: string;
}

export interface SymbolicationMeasurement {
  /** 0..1 score of correctly-resolved frames out of `frameCount`. */
  accuracy: number;
  frameCount: number;
  correctFrames: number;
  /** Per-category breakdown so the formatter can highlight platform gaps. */
  byCategory: Array<{ category: string; correct: number; total: number }>;
}

export type BenchmarkMeasurement =
  | BundleSizeMeasurement
  | CrashLatencyMeasurement
  | InstallTimeMeasurement
  | SymbolicationMeasurement;

export interface BenchmarkResult {
  benchmark: BenchmarkId;
  subjectId: string;
  subjectLabel: string;
  subjectVersion: string;
  status: SubjectStatus;
  measurement: BenchmarkMeasurement | null;
  /** Human-readable explanation when `measurement === null`. */
  unavailableReason?: string;
  durationMs: number;
  startedAt: string;
}

export interface SuiteReport {
  startedAt: string;
  finishedAt: string;
  node: string;
  /** Filled by CI; `undefined` locally. */
  runnerImage?: string;
  seed: number;
  iterations: number;
  results: BenchmarkResult[];
}
