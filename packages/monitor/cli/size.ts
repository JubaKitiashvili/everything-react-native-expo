// `npx @erne/monitor size [path]` — app/bundle size tracking with a per-build
// diff. We measure the byte size (raw + gzip) of a built JS bundle or a
// directory of build assets, persist the latest measurement to a small JSON
// history file, and diff the new build against the previously recorded one so
// you can see exactly which files grew, shrank, were added, or removed.
//
// The size math + diff logic is split into PURE, exported functions
// (`measureBundle`, `diffBuilds`, `formatSizeReport`) that operate on plain
// data (file lists / byte counts). They never touch the filesystem, so the
// whole matrix is unit-testable in memory. The CLI shell (`runSizeCommand`)
// wires up argument parsing, real disk reads, the history file, JSON / pretty
// output, and an injectable logger for tests.

import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';

// ---------------------------------------------------------------------------
// Measurement model

export interface BundleFile {
  /** Path relative to the measured root, with forward slashes. */
  name: string;
  /** Raw byte size on disk. */
  bytes: number;
  /** Gzipped byte size (level 9), when computed. */
  gzipBytes?: number;
}

export interface BundleMeasurement {
  /** Sum of every file's raw bytes. */
  totalBytes: number;
  /** Sum of every file's gzip bytes (present only when gzip was computed). */
  gzipBytes?: number;
  /** Per-file sizes, sorted largest-first. */
  files: BundleFile[];
  /** ISO timestamp this measurement was taken. */
  generatedAt: string;
}

/** A raw `{ name, contents }` input — the unit-testable shape `measureBundle` expects. */
export interface RawFile {
  name: string;
  contents: Buffer;
}

// ---------------------------------------------------------------------------
// measureBundle — pure size math over in-memory file contents.

export interface MeasureOptions {
  /** Compute gzip sizes too (cheap via zlib). Defaults to true. */
  gzip?: boolean;
  /** Override the timestamp (tests pass a fixed value). */
  now?: () => Date;
}

/**
 * Measures a set of files into a structured {@link BundleMeasurement}. Pure:
 * accepts the file contents directly so callers (and tests) never need disk.
 * Files are sorted largest-raw-bytes first for a stable, useful report order.
 */
export function measureBundle(files: readonly RawFile[], opts: MeasureOptions = {}): BundleMeasurement {
  const gzip = opts.gzip !== false;
  const now = opts.now ?? (() => new Date());

  const measured: BundleFile[] = files.map((f) => {
    const bytes = f.contents.length;
    const file: BundleFile = { name: f.name, bytes };
    if (gzip) {
      file.gzipBytes = zlib.gzipSync(f.contents, { level: 9 }).length;
    }
    return file;
  });

  measured.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));

  const totalBytes = measured.reduce((sum, f) => sum + f.bytes, 0);

  const measurement: BundleMeasurement = {
    totalBytes,
    files: measured,
    generatedAt: now().toISOString(),
  };
  if (gzip) {
    measurement.gzipBytes = measured.reduce((sum, f) => sum + (f.gzipBytes ?? 0), 0);
  }
  return measurement;
}

// ---------------------------------------------------------------------------
// diffBuilds — pure baseline-vs-current comparison.

export type FileChangeKind = 'added' | 'removed' | 'changed' | 'unchanged';

export interface FileDelta {
  name: string;
  kind: FileChangeKind;
  /** Raw bytes in the previous build (0 when added). */
  previousBytes: number;
  /** Raw bytes in the current build (0 when removed). */
  currentBytes: number;
  /** currentBytes - previousBytes. */
  deltaBytes: number;
  /** Percent change vs previous. null when previous was 0 (a new file). */
  deltaPercent: number | null;
}

export interface TotalDelta {
  previousBytes: number;
  currentBytes: number;
  deltaBytes: number;
  deltaPercent: number | null;
  previousGzipBytes?: number;
  currentGzipBytes?: number;
  deltaGzipBytes?: number;
}

export interface BuildDiff {
  /** True when there is no previous build — current is the baseline. */
  isBaseline: boolean;
  total: TotalDelta;
  /** Per-file deltas, sorted by largest absolute byte change first. */
  files: FileDelta[];
}

/** Percent change helper — null when the previous value was 0. */
function percentChange(prev: number, curr: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

/**
 * Diffs a current measurement against an optional previous one. When `previous`
 * is null/undefined the result is flagged as a baseline (every file is treated
 * as "added" so first-run output still lists what was measured). Pure.
 */
export function diffBuilds(
  current: BundleMeasurement,
  previous?: BundleMeasurement | null,
): BuildDiff {
  const isBaseline = previous == null;

  const prevByName = new Map<string, number>();
  if (previous) {
    for (const f of previous.files) prevByName.set(f.name, f.bytes);
  }
  const currByName = new Map<string, number>();
  for (const f of current.files) currByName.set(f.name, f.bytes);

  const names = new Set<string>([...prevByName.keys(), ...currByName.keys()]);
  const files: FileDelta[] = [];

  for (const name of names) {
    const previousBytes = prevByName.get(name) ?? 0;
    const currentBytes = currByName.get(name) ?? 0;
    const inPrev = prevByName.has(name);
    const inCurr = currByName.has(name);

    let kind: FileChangeKind;
    if (!inPrev && inCurr) kind = 'added';
    else if (inPrev && !inCurr) kind = 'removed';
    else if (currentBytes !== previousBytes) kind = 'changed';
    else kind = 'unchanged';

    files.push({
      name,
      kind,
      previousBytes,
      currentBytes,
      deltaBytes: currentBytes - previousBytes,
      deltaPercent: percentChange(previousBytes, currentBytes),
    });
  }

  // Largest absolute change first; ties broken alphabetically for stability.
  files.sort(
    (a, b) => Math.abs(b.deltaBytes) - Math.abs(a.deltaBytes) || a.name.localeCompare(b.name),
  );

  const prevTotal = previous?.totalBytes ?? 0;
  const total: TotalDelta = {
    previousBytes: prevTotal,
    currentBytes: current.totalBytes,
    deltaBytes: current.totalBytes - prevTotal,
    deltaPercent: percentChange(prevTotal, current.totalBytes),
  };

  if (current.gzipBytes !== undefined) {
    const prevGzip = previous?.gzipBytes ?? 0;
    total.previousGzipBytes = prevGzip;
    total.currentGzipBytes = current.gzipBytes;
    total.deltaGzipBytes = current.gzipBytes - prevGzip;
  }

  return { isBaseline, total, files };
}

// ---------------------------------------------------------------------------
// Formatting — pure string output (testable).

/** Human-readable byte size: 1536 -> "1.50 KB". */
export function formatBytes(bytes: number): string {
  const sign = bytes < 0 ? '-' : '';
  const abs = Math.abs(bytes);
  if (abs < 1024) return `${sign}${abs} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = abs / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit++;
  }
  return `${sign}${value.toFixed(2)} ${units[unit]}`;
}

/** Signed byte delta, e.g. "+1.50 KB" / "-200 B" / "0 B". */
function formatDelta(bytes: number): string {
  if (bytes === 0) return '0 B';
  const prefix = bytes > 0 ? '+' : '';
  return `${prefix}${formatBytes(bytes)}`;
}

function formatPercent(pct: number | null): string {
  if (pct === null) return 'new';
  const prefix = pct > 0 ? '+' : '';
  return `${prefix}${pct.toFixed(1)}%`;
}

const KIND_MARKER: Record<FileChangeKind, string> = {
  added: '[+]',
  removed: '[-]',
  changed: '[~]',
  unchanged: '[ ]',
};

export interface FormatOptions {
  /** Include unchanged files in the per-file listing. Defaults to false. */
  includeUnchanged?: boolean;
}

/**
 * Renders a measurement + diff into a clear human summary. Pure string output.
 */
export function formatSizeReport(
  measurement: BundleMeasurement,
  diff: BuildDiff,
  opts: FormatOptions = {},
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push('@erne/monitor size');
  lines.push(`Measured at: ${measurement.generatedAt}`);
  lines.push(`Files:       ${measurement.files.length}`);
  lines.push('');

  // Total line
  const totalGzip =
    measurement.gzipBytes !== undefined ? `  (gzip ${formatBytes(measurement.gzipBytes)})` : '';
  lines.push(`Total: ${formatBytes(measurement.totalBytes)}${totalGzip}`);

  if (diff.isBaseline) {
    lines.push('');
    lines.push('Baseline recorded — no previous build to diff against.');
  } else {
    const t = diff.total;
    lines.push(
      `Delta: ${formatDelta(t.deltaBytes)} (${formatPercent(t.deltaPercent)}) vs ${formatBytes(
        t.previousBytes,
      )}`,
    );
    if (t.deltaGzipBytes !== undefined) {
      lines.push(`Gzip delta: ${formatDelta(t.deltaGzipBytes)}`);
    }
    lines.push('');

    const shown = diff.files.filter((f) =>
      opts.includeUnchanged ? true : f.kind !== 'unchanged',
    );
    if (shown.length === 0) {
      lines.push('No file-level changes.');
    } else {
      lines.push('Per-file changes:');
      for (const f of shown) {
        lines.push(
          `  ${KIND_MARKER[f.kind]} ${f.name}  ${formatDelta(f.deltaBytes)} (${formatPercent(
            f.deltaPercent,
          )})  -> ${formatBytes(f.currentBytes)}`,
        );
      }
    }
  }

  lines.push('');
  lines.push('Run `npx @erne/monitor size --json` for machine output.');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// CLI shell — argument parsing

export interface ParsedSizeArgs {
  /** File or directory to measure. */
  path: string;
  /** History JSON file the latest measurement is recorded into. */
  historyPath: string | null;
  json: boolean;
  /** Skip gzip computation. */
  noGzip: boolean;
  help: boolean;
}

const DEFAULT_HISTORY_REL = '.erne/size-history.json';

export function parseSizeArgs(argv: readonly string[]): ParsedSizeArgs {
  let targetPath = process.cwd();
  let historyPath: string | null = null;
  let json = false;
  let noGzip = false;
  let help = false;
  let sawPath = false;

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token) continue;
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--no-gzip') {
      noGzip = true;
      continue;
    }
    if (token === '--history') {
      const next = argv[i + 1];
      if (!next || next.startsWith('-')) {
        throw new Error('--history requires a path argument');
      }
      historyPath = next;
      i += 1;
      continue;
    }
    if (token.startsWith('--history=')) {
      const value = token.slice('--history='.length);
      if (!value) throw new Error('--history requires a path argument');
      historyPath = value;
      continue;
    }
    if (token.startsWith('-')) {
      throw new Error(`Unknown argument: ${token}`);
    }
    if (sawPath) {
      throw new Error(`Unexpected extra argument: ${token}`);
    }
    targetPath = token;
    sawPath = true;
  }

  return { path: targetPath, historyPath, json, noGzip, help };
}

export function renderSizeHelp(): string {
  return [
    'Usage: npx @erne/monitor size [path] [flags]',
    '',
    'Measures the size of a built JS bundle (or a directory of build assets),',
    'records it to a history file, and diffs the new build against the last',
    'recorded one — reporting per-file and total byte/percent deltas.',
    '',
    'Arguments:',
    '  path               Bundle file or asset directory to measure',
    '                     (default: current directory)',
    '',
    'Flags:',
    '  --history <path>   History JSON file (default: <path>/.erne/size-history.json)',
    '  --no-gzip          Skip gzip size computation',
    '  --json             Emit the structured result + diff as JSON',
    '  -h, --help         Show this message',
  ].join('\n');
}

// ---------------------------------------------------------------------------
// Filesystem helpers (thin — logic stays in the pure functions above).

// `.erne` holds the size-history file we write — never measure it, or the
// history would show up as a spurious "added" file on the next run.
const SKIP_DIRS = new Set(['node_modules', '.git', '.erne']);

/**
 * Recursively reads a file or directory into the `{ name, contents }` shape
 * `measureBundle` expects. Names are relative to `target` (or the basename for
 * a single file), with forward slashes. Skips node_modules / .git / .erne.
 */
export function readBuildFiles(target: string): RawFile[] {
  const stat = fs.statSync(target);

  if (stat.isFile()) {
    return [{ name: path.basename(target), contents: fs.readFileSync(target) }];
  }

  const out: RawFile[] = [];
  const walk = (dir: string): void => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
      } else if (entry.isFile()) {
        const abs = path.join(dir, entry.name);
        const rel = path.relative(target, abs).split(path.sep).join('/');
        out.push({ name: rel, contents: fs.readFileSync(abs) });
      }
    }
  };
  walk(target);
  return out;
}

/** Reads the previously recorded measurement from the history file, if any. */
export function readHistory(historyPath: string): BundleMeasurement | null {
  try {
    if (!fs.existsSync(historyPath)) return null;
    const text = fs.readFileSync(historyPath, 'utf8') as string;
    const parsed = JSON.parse(text) as { latest?: BundleMeasurement };
    return parsed.latest ?? null;
  } catch {
    return null;
  }
}

/** Persists the latest measurement to the history file (creating dirs). */
export function writeHistory(historyPath: string, measurement: BundleMeasurement): void {
  const dir = path.dirname(historyPath);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(historyPath, JSON.stringify({ latest: measurement }, null, 2), 'utf8');
}

// ---------------------------------------------------------------------------
// CLI command

export interface SizeCliDeps {
  logger?: { info: (msg: string) => void; error: (msg: string) => void };
  /** Injectable file reader (tests stub this to avoid disk I/O). */
  readFiles?: (target: string) => RawFile[];
  /** Injectable history reader. */
  readPrevious?: (historyPath: string) => BundleMeasurement | null;
  /** Injectable history writer. */
  writePrevious?: (historyPath: string, measurement: BundleMeasurement) => void;
  /** Injectable clock. */
  now?: () => Date;
}

export function runSizeCommand(argv: readonly string[], deps: SizeCliDeps = {}): number {
  const logger = deps.logger ?? {
    info: (msg: string) => console.log(msg),
    error: (msg: string) => console.error(msg),
  };

  let parsed: ParsedSizeArgs;
  try {
    parsed = parseSizeArgs(argv);
  } catch (err) {
    logger.error(err instanceof Error ? err.message : String(err));
    logger.error(renderSizeHelp());
    return 1;
  }

  if (parsed.help) {
    logger.info(renderSizeHelp());
    return 0;
  }

  const readFiles = deps.readFiles ?? readBuildFiles;
  const readPrevious = deps.readPrevious ?? readHistory;
  const writePrevious = deps.writePrevious ?? writeHistory;

  const historyPath =
    parsed.historyPath ?? path.join(parsed.path, DEFAULT_HISTORY_REL);

  let files: RawFile[];
  try {
    files = readFiles(parsed.path);
  } catch (err) {
    logger.error(
      '[@erne/monitor] size failed: ' + (err instanceof Error ? err.message : String(err)),
    );
    return 1;
  }

  const previous = readPrevious(historyPath);
  const measurement = measureBundle(files, { gzip: !parsed.noGzip, now: deps.now });
  const diff = diffBuilds(measurement, previous);

  // Persist the new measurement as the latest baseline for next time.
  try {
    writePrevious(historyPath, measurement);
  } catch (err) {
    logger.error(
      '[@erne/monitor] size: could not write history (' +
        (err instanceof Error ? err.message : String(err)) +
        ') — diff still printed below.',
    );
  }

  if (parsed.json) {
    logger.info(JSON.stringify({ measurement, diff }, null, 2));
  } else {
    logger.info(formatSizeReport(measurement, diff));
  }
  return 0;
}
