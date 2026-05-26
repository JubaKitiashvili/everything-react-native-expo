import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  diffBuilds,
  formatBytes,
  formatSizeReport,
  measureBundle,
  parseSizeArgs,
  readBuildFiles,
  readHistory,
  renderSizeHelp,
  runSizeCommand,
  writeHistory,
  type BundleMeasurement,
  type RawFile,
} from './size';

const FIXED_NOW = () => new Date('2026-05-26T00:00:00.000Z');

// Helper: build RawFile inputs from { name: contents } string maps.
function rawFiles(files: Record<string, string>): RawFile[] {
  return Object.entries(files).map(([name, contents]) => ({
    name,
    contents: Buffer.from(contents, 'utf8'),
  }));
}

describe('measureBundle — size math', () => {
  test('sums raw bytes and records per-file sizes', () => {
    const m = measureBundle(rawFiles({ 'a.js': 'aaa', 'b.js': 'bb' }), { now: FIXED_NOW });
    expect(m.totalBytes).toBe(5);
    expect(m.files).toHaveLength(2);
    expect(m.generatedAt).toBe('2026-05-26T00:00:00.000Z');
  });

  test('sorts files largest raw bytes first', () => {
    const m = measureBundle(rawFiles({ small: 'x', big: 'xxxxxx', mid: 'xxx' }), {
      now: FIXED_NOW,
    });
    expect(m.files.map((f) => f.name)).toEqual(['big', 'mid', 'small']);
  });

  test('computes gzip sizes by default and sums them into gzipBytes', () => {
    const m = measureBundle(rawFiles({ 'a.js': 'hello world '.repeat(50) }), { now: FIXED_NOW });
    expect(m.gzipBytes).toBeGreaterThan(0);
    // Highly repetitive content compresses well below raw.
    expect(m.gzipBytes!).toBeLessThan(m.totalBytes);
    expect(m.files[0]?.gzipBytes).toBeGreaterThan(0);
  });

  test('--no-gzip path: gzip omitted when disabled', () => {
    const m = measureBundle(rawFiles({ 'a.js': 'data' }), { gzip: false, now: FIXED_NOW });
    expect(m.gzipBytes).toBeUndefined();
    expect(m.files[0]?.gzipBytes).toBeUndefined();
  });

  test('empty input yields zero total', () => {
    const m = measureBundle([], { now: FIXED_NOW });
    expect(m.totalBytes).toBe(0);
    expect(m.files).toEqual([]);
  });
});

describe('diffBuilds — baseline vs changed', () => {
  test('first run with no previous is a baseline', () => {
    const current = measureBundle(rawFiles({ 'a.js': 'aaa' }), { now: FIXED_NOW });
    const diff = diffBuilds(current, null);
    expect(diff.isBaseline).toBe(true);
    expect(diff.total.previousBytes).toBe(0);
    expect(diff.total.currentBytes).toBe(3);
    expect(diff.files[0]?.kind).toBe('added');
  });

  test('detects changed, added, and removed files with correct deltas', () => {
    const prev = measureBundle(rawFiles({ 'keep.js': 'aaaa', 'gone.js': 'xx' }), {
      now: FIXED_NOW,
    });
    // keep.js shrinks 4 -> 2, gone.js removed, new.js added.
    const curr = measureBundle(rawFiles({ 'keep.js': 'aa', 'new.js': 'zzz' }), { now: FIXED_NOW });
    const diff = diffBuilds(curr, prev);

    expect(diff.isBaseline).toBe(false);

    const byName = Object.fromEntries(diff.files.map((f) => [f.name, f]));
    expect(byName['keep.js']?.kind).toBe('changed');
    expect(byName['keep.js']?.deltaBytes).toBe(-2);
    expect(byName['keep.js']?.deltaPercent).toBeCloseTo(-50);

    expect(byName['gone.js']?.kind).toBe('removed');
    expect(byName['gone.js']?.deltaBytes).toBe(-2);
    expect(byName['gone.js']?.currentBytes).toBe(0);

    expect(byName['new.js']?.kind).toBe('added');
    expect(byName['new.js']?.deltaBytes).toBe(3);
    expect(byName['new.js']?.deltaPercent).toBeNull(); // new file -> no percent

    // Added files render "new" (not a doubled-paren percent) in the report.
    expect(formatSizeReport(curr, diff)).toContain('[+] new.js  +3 B (new)');
  });

  test('total delta and percent reflect the whole build', () => {
    const prev = measureBundle(rawFiles({ 'a.js': 'aaaa' }), { now: FIXED_NOW }); // 4
    const curr = measureBundle(rawFiles({ 'a.js': 'aaaaaa' }), { now: FIXED_NOW }); // 6
    const diff = diffBuilds(curr, prev);
    expect(diff.total.deltaBytes).toBe(2);
    expect(diff.total.deltaPercent).toBeCloseTo(50);
  });

  test('marks identical files as unchanged', () => {
    const prev = measureBundle(rawFiles({ 'a.js': 'same' }), { now: FIXED_NOW });
    const curr = measureBundle(rawFiles({ 'a.js': 'same' }), { now: FIXED_NOW });
    const diff = diffBuilds(curr, prev);
    expect(diff.files[0]?.kind).toBe('unchanged');
    expect(diff.files[0]?.deltaBytes).toBe(0);
  });

  test('sorts per-file deltas by largest absolute change', () => {
    const prev = measureBundle(rawFiles({ a: 'a', b: 'bb', c: 'ccc' }), { now: FIXED_NOW });
    const curr = measureBundle(rawFiles({ a: 'a' + 'a'.repeat(9), b: 'bbb', c: 'ccc' }), {
      now: FIXED_NOW,
    });
    const diff = diffBuilds(curr, prev);
    // a grows by +9 (biggest), b grows by +1, c unchanged (0).
    expect(diff.files.map((f) => f.name)).toEqual(['a', 'b', 'c']);
  });

  test('includes gzip total delta when both builds have gzip', () => {
    const prev = measureBundle(rawFiles({ 'a.js': 'xy'.repeat(100) }), { now: FIXED_NOW });
    const curr = measureBundle(rawFiles({ 'a.js': 'xy'.repeat(200) }), { now: FIXED_NOW });
    const diff = diffBuilds(curr, prev);
    expect(diff.total.deltaGzipBytes).toBeDefined();
    expect(diff.total.currentGzipBytes!).toBeGreaterThan(diff.total.previousGzipBytes!);
  });
});

describe('formatBytes', () => {
  test('formats bytes, KB, MB with sign', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1536)).toBe('1.50 KB');
    expect(formatBytes(1024 * 1024 * 2)).toBe('2.00 MB');
    expect(formatBytes(-2048)).toBe('-2.00 KB');
  });
});

describe('formatSizeReport', () => {
  test('renders a baseline summary when there is no previous build', () => {
    const m = measureBundle(rawFiles({ 'a.js': 'aaa' }), { now: FIXED_NOW });
    const out = formatSizeReport(m, diffBuilds(m, null));
    expect(out).toContain('@erne/monitor size');
    expect(out).toContain('Total: 3 B');
    expect(out).toContain('Baseline recorded');
  });

  test('renders total + per-file deltas with markers when diffing', () => {
    const prev = measureBundle(rawFiles({ 'a.js': 'aaaa', 'old.js': 'zz' }), { now: FIXED_NOW });
    const curr = measureBundle(rawFiles({ 'a.js': 'aaaaaa', 'new.js': 'qqq' }), { now: FIXED_NOW });
    const out = formatSizeReport(curr, diffBuilds(curr, prev));
    expect(out).toContain('Delta:');
    expect(out).toContain('Per-file changes:');
    expect(out).toContain('[+] new.js');
    expect(out).toContain('[-] old.js');
    expect(out).toContain('[~] a.js');
  });

  test('hides unchanged files by default but shows them with includeUnchanged', () => {
    const prev = measureBundle(rawFiles({ 'same.js': 'x', 'grow.js': 'a' }), { now: FIXED_NOW });
    const curr = measureBundle(rawFiles({ 'same.js': 'x', 'grow.js': 'aaa' }), { now: FIXED_NOW });
    const diff = diffBuilds(curr, prev);
    expect(formatSizeReport(curr, diff)).not.toContain('same.js');
    expect(formatSizeReport(curr, diff, { includeUnchanged: true })).toContain('same.js');
  });
});

describe('parseSizeArgs', () => {
  test('defaults to cwd, no history, gzip on', () => {
    const parsed = parseSizeArgs([]);
    expect(parsed.path).toBe(process.cwd());
    expect(parsed.historyPath).toBeNull();
    expect(parsed.json).toBe(false);
    expect(parsed.noGzip).toBe(false);
  });

  test('accepts a positional path, --json, --no-gzip, and --history', () => {
    const parsed = parseSizeArgs(['/dist', '--json', '--no-gzip', '--history', '/tmp/h.json']);
    expect(parsed.path).toBe('/dist');
    expect(parsed.json).toBe(true);
    expect(parsed.noGzip).toBe(true);
    expect(parsed.historyPath).toBe('/tmp/h.json');
  });

  test('supports --history=<path> form', () => {
    expect(parseSizeArgs(['--history=/x/y.json']).historyPath).toBe('/x/y.json');
  });

  test('-h sets help', () => {
    expect(parseSizeArgs(['-h']).help).toBe(true);
  });

  test('rejects unknown flags, extra positionals, and dangling --history', () => {
    expect(() => parseSizeArgs(['--bogus'])).toThrow(/Unknown argument/);
    expect(() => parseSizeArgs(['/a', '/b'])).toThrow(/extra argument/);
    expect(() => parseSizeArgs(['--history'])).toThrow(/--history requires a path/);
  });
});

describe('renderSizeHelp', () => {
  test('documents path argument and flags', () => {
    const help = renderSizeHelp();
    expect(help).toContain('[path]');
    expect(help).toContain('--history');
    expect(help).toContain('--no-gzip');
    expect(help).toContain('--json');
  });
});

describe('readBuildFiles + history (disk)', () => {
  let tmp: string;

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-size-'));
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('reads a single file as one entry named by its basename', () => {
    const file = path.join(tmp, 'bundle.js');
    fs.writeFileSync(file, 'console.log(1)');
    const files = readBuildFiles(file);
    expect(files).toHaveLength(1);
    expect(files[0]?.name).toBe('bundle.js');
  });

  test('walks a directory recursively with forward-slash relative names, skipping node_modules and .erne', () => {
    fs.mkdirSync(path.join(tmp, 'assets'));
    fs.mkdirSync(path.join(tmp, 'node_modules'));
    fs.mkdirSync(path.join(tmp, '.erne'));
    fs.writeFileSync(path.join(tmp, 'index.js'), 'a');
    fs.writeFileSync(path.join(tmp, 'assets', 'logo.png'), 'bb');
    fs.writeFileSync(path.join(tmp, 'node_modules', 'dep.js'), 'ignored');
    fs.writeFileSync(path.join(tmp, '.erne', 'size-history.json'), '{}');

    const names = readBuildFiles(tmp)
      .map((f) => f.name)
      .sort();
    expect(names).toEqual(['assets/logo.png', 'index.js']);
  });

  test('writeHistory then readHistory round-trips the latest measurement', () => {
    const historyPath = path.join(tmp, '.erne', 'size-history.json');
    const m: BundleMeasurement = measureBundle(rawFiles({ 'a.js': 'aaa' }), { now: FIXED_NOW });
    writeHistory(historyPath, m);
    const back = readHistory(historyPath);
    expect(back?.totalBytes).toBe(3);
    expect(back?.generatedAt).toBe('2026-05-26T00:00:00.000Z');
  });

  test('readHistory returns null when the file is missing or malformed', () => {
    expect(readHistory(path.join(tmp, 'nope.json'))).toBeNull();
    const bad = path.join(tmp, 'bad.json');
    fs.writeFileSync(bad, 'not json{');
    expect(readHistory(bad)).toBeNull();
  });
});

describe('runSizeCommand', () => {
  function makeLogger() {
    const info: string[] = [];
    const error: string[] = [];
    return {
      info,
      error,
      logger: { info: (m: string) => info.push(m), error: (m: string) => error.push(m) },
    };
  }

  test('--help prints usage and exits 0 without reading files', () => {
    const { info, logger } = makeLogger();
    const readFiles = jest.fn();
    const code = runSizeCommand(['--help'], { logger, readFiles });
    expect(code).toBe(0);
    expect(readFiles).not.toHaveBeenCalled();
    expect(info.join('\n')).toContain('Usage: npx @erne/monitor size');
  });

  test('first run records a baseline and persists the measurement', () => {
    const { info, logger } = makeLogger();
    const readFiles = jest.fn(() => rawFiles({ 'a.js': 'aaa' }));
    const readPrevious = jest.fn(() => null);
    const writePrevious = jest.fn();

    const code = runSizeCommand(['/dist'], {
      logger,
      readFiles,
      readPrevious,
      writePrevious,
      now: FIXED_NOW,
    });

    expect(code).toBe(0);
    expect(readFiles).toHaveBeenCalledWith('/dist');
    expect(writePrevious).toHaveBeenCalledTimes(1);
    const persisted = writePrevious.mock.calls[0]![1] as BundleMeasurement;
    expect(persisted.totalBytes).toBe(3);
    expect(info.join('\n')).toContain('Baseline recorded');
  });

  test('diffs against a previous build and prints deltas', () => {
    const { info, logger } = makeLogger();
    const previous = measureBundle(rawFiles({ 'a.js': 'aaaa' }), { now: FIXED_NOW });
    const readFiles = jest.fn(() => rawFiles({ 'a.js': 'aaaaaa' }));
    const readPrevious = jest.fn(() => previous);
    const writePrevious = jest.fn();

    const code = runSizeCommand(['/dist'], {
      logger,
      readFiles,
      readPrevious,
      writePrevious,
      now: FIXED_NOW,
    });

    expect(code).toBe(0);
    const out = info.join('\n');
    expect(out).toContain('Delta: +2 B');
    expect(out).toContain('[~] a.js');
  });

  test('--json emits structured measurement + diff', () => {
    const { info, logger } = makeLogger();
    const readFiles = jest.fn(() => rawFiles({ 'a.js': 'aa' }));
    const code = runSizeCommand(['/dist', '--json'], {
      logger,
      readFiles,
      readPrevious: () => null,
      writePrevious: () => undefined,
      now: FIXED_NOW,
    });
    expect(code).toBe(0);
    const parsed = JSON.parse(info.join('\n')) as {
      measurement: BundleMeasurement;
      diff: { isBaseline: boolean };
    };
    expect(parsed.measurement.totalBytes).toBe(2);
    expect(parsed.diff.isBaseline).toBe(true);
  });

  test('honors --history target and --no-gzip', () => {
    const { logger } = makeLogger();
    const readFiles = jest.fn(() => rawFiles({ 'a.js': 'aa' }));
    const writePrevious = jest.fn();
    const code = runSizeCommand(['/dist', '--no-gzip', '--history', '/tmp/h.json'], {
      logger,
      readFiles,
      readPrevious: () => null,
      writePrevious,
      now: FIXED_NOW,
    });
    expect(code).toBe(0);
    expect(writePrevious.mock.calls[0]![0]).toBe('/tmp/h.json');
    const persisted = writePrevious.mock.calls[0]![1] as BundleMeasurement;
    expect(persisted.gzipBytes).toBeUndefined();
  });

  test('reports a clear error and exits 1 when reading files throws', () => {
    const { error, logger } = makeLogger();
    const readFiles = jest.fn(() => {
      throw new Error('ENOENT: no such file');
    });
    const code = runSizeCommand(['/missing'], { logger, readFiles });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('ENOENT'))).toBe(true);
  });

  test('still prints the report when history write fails', () => {
    const { info, error, logger } = makeLogger();
    const readFiles = jest.fn(() => rawFiles({ 'a.js': 'aa' }));
    const writePrevious = jest.fn(() => {
      throw new Error('EACCES');
    });
    const code = runSizeCommand(['/dist'], {
      logger,
      readFiles,
      readPrevious: () => null,
      writePrevious,
      now: FIXED_NOW,
    });
    expect(code).toBe(0);
    expect(error.some((l) => l.includes('EACCES'))).toBe(true);
    expect(info.join('\n')).toContain('Baseline recorded');
  });

  test('exits 1 on bad args', () => {
    const { error, logger } = makeLogger();
    const code = runSizeCommand(['--nope'], { logger });
    expect(code).toBe(1);
    expect(error.some((l) => l.includes('Unknown argument'))).toBe(true);
  });
});
