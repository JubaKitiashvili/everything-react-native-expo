// Task 117.91 — runner.test.ts (suite orchestration).

import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runSuite } from './runner.js';

const HERE = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolve(HERE, '..', '..', '..', '..');

describe('runSuite', () => {
  let stderr: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    stderr.mockRestore();
  });

  test('produces a result row for every benchmark × subject', async () => {
    const report = await runSuite({ workspaceRoot: WORKSPACE_ROOT, dryRun: true, iterations: 5 });
    // 4 benchmarks × 4 subjects = 16 rows.
    expect(report.results.length).toBe(16);
    const benchmarks = new Set(report.results.map((r) => r.benchmark));
    expect(benchmarks.size).toBe(4);
    const subjects = new Set(report.results.map((r) => r.subjectId));
    expect(subjects).toEqual(new Set(['erne', 'sentry', 'bitdrift', 'measure-sh']));
  });

  test('honours benchmark + subject filters', async () => {
    const report = await runSuite({
      workspaceRoot: WORKSPACE_ROOT,
      benchmarks: ['symbolication_accuracy'],
      subjectIds: ['erne'],
      dryRun: true,
    });
    expect(report.results).toHaveLength(1);
    expect(report.results[0]?.benchmark).toBe('symbolication_accuracy');
    expect(report.results[0]?.subjectId).toBe('erne');
    expect(report.results[0]?.measurement).not.toBeNull();
  });

  test('placeholder subjects emit unavailableReason instead of fake numbers', async () => {
    const report = await runSuite({
      workspaceRoot: WORKSPACE_ROOT,
      benchmarks: ['bundle_size'],
      subjectIds: ['sentry'],
      dryRun: true,
    });
    const r = report.results[0]!;
    expect(r.measurement).toBeNull();
    expect(r.status).toBe('documented_placeholder');
    expect(r.unavailableReason).toContain('placeholder');
  });

  test('throws on an unknown subject id', async () => {
    await expect(
      runSuite({ workspaceRoot: WORKSPACE_ROOT, subjectIds: ['nope'], dryRun: true }),
    ).rejects.toThrow(/no subjects matched/);
  });
});
