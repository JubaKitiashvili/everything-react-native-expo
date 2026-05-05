// Task 117.91 — erne subject unit tests.

import { describe, expect, test } from 'vitest';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { erneSubject, simpleFingerprint, simulateCrashHotPath } from './erne.js';
import type { BenchmarkContext } from '../types.js';

const HERE = fileURLToPath(import.meta.url);
const WORKSPACE_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

function ctx(overrides: Partial<BenchmarkContext> = {}): BenchmarkContext {
  return {
    workspaceRoot: WORKSPACE_ROOT,
    now: () => 0,
    seed: 1,
    iterations: 10,
    dryRun: true,
    log: () => {},
    ...overrides,
  };
}

describe('simpleFingerprint', () => {
  test('produces a stable hex string per input', () => {
    const a = simpleFingerprint('hello world');
    const b = simpleFingerprint('hello world');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });

  test('different inputs produce different fingerprints', () => {
    expect(simpleFingerprint('a')).not.toBe(simpleFingerprint('b'));
  });
});

describe('simulateCrashHotPath', () => {
  test('returns one sample per iteration', () => {
    let n = 0;
    const samples = simulateCrashHotPath(
      ctx({
        iterations: 7,
        now: () => {
          n += 1;
          return n;
        },
      }),
    );
    expect(samples).toHaveLength(7);
    // Each sample is a delta of two `now()` calls — with our +1-per-call
    // stub that delta is exactly 1.
    expect(samples.every((s) => s === 1)).toBe(true);
  });
});

describe('erneSubject.measureBundleSize', () => {
  test('measures the local @erne/monitor build when dist exists', async () => {
    const result = await erneSubject.measureBundleSize(ctx());
    if (result === null) {
      // dist not built — skip without claiming success.
      console.warn('erne dist not built; skipping bundle_size assertion');
      return;
    }
    expect(result.fileCount).toBeGreaterThan(0);
    expect(result.totalGzipBytes).toBeGreaterThan(1000);
    expect(result.entry.endsWith('index.js')).toBe(true);
  });
});

describe('erneSubject.measureSymbolicationAccuracy', () => {
  test('scores 100% against the bundled fixture', async () => {
    const result = await erneSubject.measureSymbolicationAccuracy(ctx());
    expect(result).not.toBeNull();
    expect(result!.accuracy).toBe(1);
    expect(result!.frameCount).toBe(50);
    expect(result!.byCategory).toHaveLength(3);
  });
});

describe('erneSubject.measureInstallTime', () => {
  test('returns null on dry-run (no network)', async () => {
    const result = await erneSubject.measureInstallTime(ctx({ dryRun: true }));
    expect(result).toBeNull();
  });
});
