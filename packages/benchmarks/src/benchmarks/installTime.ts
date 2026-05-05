// Task 117.91 — install-time benchmark.
//
// Measures `npm install <subject>` wall-clock seconds. Two flavours:
//   warm: cache primed (typical CI behaviour on `actions/cache`)
//   cold: `npm cache clean --force` first (typical fresh dev machine)
//
// Skipped entirely when `ctx.dryRun === true` — install_time hits the
// public npm registry, which we never want to do on a PR or offline.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type {
  BenchmarkContext,
  BenchmarkResult,
  InstallTimeMeasurement,
  Subject,
} from '../types.js';
import { runBenchmark } from './runBenchmark.js';

export async function runInstallTime(
  subject: Subject,
  ctx: BenchmarkContext,
): Promise<BenchmarkResult> {
  return runBenchmark({
    benchmark: 'install_time',
    subject,
    ctx,
    measure: async (s, c) => s.measureInstallTime(c),
  });
}

export interface MeasureNpmInstallOptions {
  packageName: string;
  version: string;
  /** Network-touching second pass after `npm cache clean --force`. */
  measureCold?: boolean;
  /** Hard wall-clock cap so a hung registry can't stall CI. Default 5 minutes. */
  timeoutMs?: number;
  /** Override `npm` invocation for tests. Default `npm`. */
  npmBin?: string;
  /** Clock injected by the harness. */
  now: () => number;
}

/**
 * Drives the actual npm subprocess. Exported so tests can override
 * `npmBin` with a stub script.
 */
export function measureNpmInstall(options: MeasureNpmInstallOptions): InstallTimeMeasurement {
  const { packageName, version, npmBin = 'npm', timeoutMs = 5 * 60_000, now } = options;
  const tmp = mkdtempSync(join(tmpdir(), 'erne-bench-install-'));
  try {
    writeFileSync(
      join(tmp, 'package.json'),
      JSON.stringify({ name: 'erne-bench-target', version: '0.0.0', private: true }, null, 2),
    );
    const npmVersion = readNpmVersion(npmBin);
    const installStart = now();
    const warm = spawnSync(npmBin, ['install', `${packageName}@${version}`, '--no-audit', '--no-fund'], {
      cwd: tmp,
      timeout: timeoutMs,
      stdio: 'ignore',
    });
    const warmSeconds = (now() - installStart) / 1000;
    if (warm.status !== 0) {
      throw new Error(
        `npm install ${packageName}@${version} failed (status=${warm.status}, signal=${warm.signal ?? 'none'})`,
      );
    }
    let coldSeconds: number | null = null;
    if (options.measureCold) {
      // Wipe the install + cache, then time again.
      rmSync(join(tmp, 'node_modules'), { recursive: true, force: true });
      rmSync(join(tmp, 'package-lock.json'), { force: true });
      spawnSync(npmBin, ['cache', 'clean', '--force'], { stdio: 'ignore' });
      const coldStart = now();
      const cold = spawnSync(
        npmBin,
        ['install', `${packageName}@${version}`, '--no-audit', '--no-fund'],
        { cwd: tmp, timeout: timeoutMs, stdio: 'ignore' },
      );
      coldSeconds = (now() - coldStart) / 1000;
      if (cold.status !== 0) {
        throw new Error(
          `cold npm install ${packageName}@${version} failed (status=${cold.status})`,
        );
      }
    }
    return { warmSeconds, coldSeconds, npmVersion };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function readNpmVersion(npmBin: string): string {
  const out = spawnSync(npmBin, ['--version'], { encoding: 'utf8' });
  if (out.status !== 0) return 'unknown';
  return out.stdout.trim();
}
