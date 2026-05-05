// Task 117.91 — benchmarks CLI.
//
// Usage:
//   tsx src/cli.ts run [--benchmark=<id>...] [--subject=<id>...]
//                      [--out=<path>] [--json] [--dry-run]
//                      [--iterations=<n>] [--seed=<n>]
//
// Run with no flags = full suite × all subjects, stdout markdown.

import { existsSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite } from './runner.js';
import { formatMarkdown } from './format/markdown.js';
import type { BenchmarkId, SuiteReport } from './types.js';

interface CliArgs {
  command: 'run' | 'help' | null;
  benchmarks: BenchmarkId[];
  subjects: string[];
  out: string | null;
  json: boolean;
  dryRun: boolean;
  iterations: number | undefined;
  seed: number | undefined;
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    command: null,
    benchmarks: [],
    subjects: [],
    out: null,
    json: false,
    dryRun: false,
    iterations: undefined,
    seed: undefined,
  };
  for (const raw of argv) {
    if (!args.command && (raw === 'run' || raw === 'help')) {
      args.command = raw;
      continue;
    }
    if (raw === '--json') args.json = true;
    else if (raw === '--dry-run') args.dryRun = true;
    else if (raw.startsWith('--benchmark=')) {
      const v = raw.slice('--benchmark='.length);
      if (v) args.benchmarks.push(v as BenchmarkId);
    } else if (raw.startsWith('--subject=')) {
      const v = raw.slice('--subject='.length);
      if (v) args.subjects.push(v);
    } else if (raw.startsWith('--out=')) {
      args.out = raw.slice('--out='.length);
    } else if (raw.startsWith('--iterations=')) {
      const n = Number(raw.slice('--iterations='.length));
      if (Number.isFinite(n) && n > 0) args.iterations = Math.round(n);
    } else if (raw.startsWith('--seed=')) {
      const n = Number(raw.slice('--seed='.length));
      if (Number.isFinite(n)) args.seed = Math.round(n);
    }
  }
  return args;
}

export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (!args.command || args.command === 'help') {
    process.stdout.write(usage());
    return 0;
  }
  const workspaceRoot = findWorkspaceRoot();
  const suiteOptions: Parameters<typeof runSuite>[0] = {
    workspaceRoot,
    dryRun: args.dryRun,
  };
  if (args.benchmarks.length > 0) suiteOptions.benchmarks = args.benchmarks;
  if (args.subjects.length > 0) suiteOptions.subjectIds = args.subjects;
  if (args.iterations !== undefined) suiteOptions.iterations = args.iterations;
  if (args.seed !== undefined) suiteOptions.seed = args.seed;
  const report = await runSuite(suiteOptions);
  emit(report, args);
  return 0;
}

function emit(report: SuiteReport, args: CliArgs): void {
  const body = args.json ? JSON.stringify(report, null, 2) : formatMarkdown(report);
  if (args.out) {
    writeFileSync(args.out, body);
    process.stderr.write(`wrote ${args.out}\n`);
    return;
  }
  process.stdout.write(`${body}\n`);
}

function usage(): string {
  return [
    'erne-benchmarks — Reproducible SDK benchmark suite',
    '',
    'Usage:',
    '  erne-benchmarks run [options]',
    '',
    'Options:',
    '  --benchmark=<id>     Restrict to one benchmark (repeatable). Default: all.',
    '  --subject=<id>       Restrict to one subject (repeatable). Default: all.',
    '  --out=<path>         Write results to a file instead of stdout.',
    '  --json               JSON output instead of Markdown.',
    '  --dry-run            Skip network-touching benchmarks (install_time).',
    '  --iterations=<n>     Sampled benchmarks iteration count (default: 1000).',
    '  --seed=<n>           Seed for sampled benchmarks (default: 1).',
    '',
    'Benchmarks: bundle_size, crash_latency, install_time, symbolication_accuracy',
    'Subjects:   erne, sentry, bitdrift, measure-sh',
    '',
  ].join('\n');
}

/**
 * Walk up from the CLI source dir looking for the monorepo root (the
 * directory containing `packages/`). Returns the cwd as a fallback so
 * tests + standalone consumers still get something usable.
 */
function findWorkspaceRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 10; i++) {
    if (looksLikeRoot(dir)) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

function looksLikeRoot(dir: string): boolean {
  // The monorepo root has `packages/monitor/package.json`.
  return existsSync(resolve(dir, 'packages', 'monitor', 'package.json'));
}

const isDirectInvocation =
  // tsx + node both set process.argv[1] to the script path.
  typeof process !== 'undefined' &&
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isDirectInvocation) {
  void main(process.argv.slice(2)).then(
    (code) => process.exit(code),
    (err: unknown) => {
      process.stderr.write(`benchmarks failed: ${err instanceof Error ? err.message : String(err)}\n`);
      process.exit(1);
    },
  );
}
