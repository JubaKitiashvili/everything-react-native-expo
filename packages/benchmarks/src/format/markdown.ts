// Task 117.91 — Markdown formatter for SuiteReport.
//
// Output shape (one section per benchmark):
//
//   ## bundle_size
//
//   | Subject | Status | Total gzip | Files | Notes |
//   | --- | --- | --- | --- | --- |
//   | @erne/monitor | native | 67.49 KB | 76 | dist/index.js |
//   | @sentry/react-native | placeholder | — | — | runbook in src/subjects/sentry.ts |
//
// Numbers are formatted with units. `placeholder` rows show "—" so the
// reader's eye doesn't compare a real number to a fabricated one.

import type {
  BenchmarkResult,
  BundleSizeMeasurement,
  CrashLatencyMeasurement,
  InstallTimeMeasurement,
  SuiteReport,
  SymbolicationMeasurement,
} from '../types.js';

export function formatMarkdown(report: SuiteReport): string {
  const lines: string[] = [];
  lines.push('# ERNE Benchmark Report');
  lines.push('');
  lines.push(`- Started: ${report.startedAt}`);
  lines.push(`- Finished: ${report.finishedAt}`);
  lines.push(`- Node: ${report.node}`);
  if (report.runnerImage) lines.push(`- Runner image: \`${report.runnerImage}\``);
  lines.push(`- Iterations (sampled benchmarks): ${report.iterations}`);
  lines.push(`- Seed: ${report.seed}`);
  lines.push('');

  for (const benchmark of unique(report.results.map((r) => r.benchmark))) {
    lines.push(`## ${benchmark}`);
    lines.push('');
    lines.push(...renderTable(benchmark, report.results.filter((r) => r.benchmark === benchmark)));
    lines.push('');
  }

  return lines.join('\n');
}

function unique<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function renderTable(benchmark: string, rows: BenchmarkResult[]): string[] {
  switch (benchmark) {
    case 'bundle_size':
      return renderBundleSize(rows);
    case 'crash_latency':
      return renderCrashLatency(rows);
    case 'install_time':
      return renderInstallTime(rows);
    case 'symbolication_accuracy':
      return renderSymbolicationAccuracy(rows);
    default:
      return ['(unknown benchmark)'];
  }
}

function renderBundleSize(rows: BenchmarkResult[]): string[] {
  const out = ['| Subject | Status | Version | Total gzip | Files | Entry / Notes |', '| --- | --- | --- | --- | --- | --- |'];
  for (const r of rows) {
    const m = r.measurement as BundleSizeMeasurement | null;
    if (!m) {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | — | — | ${r.unavailableReason ?? '—'} |`,
      );
    } else {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | ${formatKb(m.totalGzipBytes)} | ${m.fileCount} | \`${m.entry}\` |`,
      );
    }
  }
  return out;
}

function renderCrashLatency(rows: BenchmarkResult[]): string[] {
  const out = [
    '| Subject | Status | Version | p50 | p95 | p99 | max | Iterations |',
    '| --- | --- | --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const m = r.measurement as CrashLatencyMeasurement | null;
    if (!m) {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | — | — | — | — | — |`,
      );
    } else {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | ${formatMs(m.p50Ms)} | ${formatMs(m.p95Ms)} | ${formatMs(m.p99Ms)} | ${formatMs(m.maxMs)} | ${m.iterations} |`,
      );
    }
  }
  return out;
}

function renderInstallTime(rows: BenchmarkResult[]): string[] {
  const out = [
    '| Subject | Status | Version | Warm | Cold | npm |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const m = r.measurement as InstallTimeMeasurement | null;
    if (!m) {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | — | — | — |`,
      );
    } else {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | ${formatSec(m.warmSeconds)} | ${m.coldSeconds === null ? '—' : formatSec(m.coldSeconds)} | ${m.npmVersion} |`,
      );
    }
  }
  return out;
}

function renderSymbolicationAccuracy(rows: BenchmarkResult[]): string[] {
  const out = [
    '| Subject | Status | Version | Accuracy | Frames | Per-category |',
    '| --- | --- | --- | --- | --- | --- |',
  ];
  for (const r of rows) {
    const m = r.measurement as SymbolicationMeasurement | null;
    if (!m) {
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | — | — | — |`,
      );
    } else {
      const pct = (m.accuracy * 100).toFixed(1);
      const cats = m.byCategory
        .map((c) => `${c.category}: ${c.correct}/${c.total}`)
        .join('; ');
      out.push(
        `| ${r.subjectLabel} | ${r.status} | ${r.subjectVersion} | ${pct}% | ${m.correctFrames}/${m.frameCount} | ${cats} |`,
      );
    }
  }
  return out;
}

function formatKb(bytes: number): string {
  return `${(bytes / 1024).toFixed(2)} KB`;
}

function formatMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(1)} µs`;
  return `${ms.toFixed(2)} ms`;
}

function formatSec(sec: number): string {
  return `${sec.toFixed(2)} s`;
}
