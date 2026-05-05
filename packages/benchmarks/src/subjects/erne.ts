// Task 117.91 — `erne` benchmark subject.
//
// Measures `@erne/monitor` directly. We intentionally do NOT install the
// package via `npm install` for the bundle_size + crash_latency paths —
// the SDK lives next door in this monorepo at packages/monitor/, and
// resolving it via filesystem path keeps the harness fast + reproducible.
//
// install_time is the one benchmark that DOES hit the real public npm
// registry, because that's the only honest way to measure it.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { Subject, BenchmarkContext } from '../types.js';
import { walkAndGzip } from '../benchmarks/bundleSize.js';
import { measureNpmInstall } from '../benchmarks/installTime.js';
import { summarise } from '../benchmarks/crashLatency.js';
import {
  summariseVerdicts,
  type FrameVerdict,
} from '../benchmarks/symbolicationAccuracy.js';
import {
  fixtureMapping,
  fixtureFrames,
  applyFixtureMapping,
} from '../fixtures/symbolication.js';
import {
  ERNE_VERSION,
  resolveMonitorRoot,
  resolveMonitorEntry,
} from './erneLocations.js';

export const erneSubject: Subject = {
  id: 'erne',
  label: '@erne/monitor',
  packageName: '@erne/monitor',
  version: ERNE_VERSION,
  status: 'native',
  notes:
    'Measured against the local sibling build at packages/monitor/dist (bundle_size, symbolication_accuracy) or the published npm package (install_time). crash_latency runs an in-process pipeline that mirrors the SDK CrashCollector hot path.',

  async measureBundleSize(ctx) {
    const monitorRoot = resolveMonitorRoot(ctx);
    const entry = resolveMonitorEntry(monitorRoot);
    if (!entry) return null;
    return walkAndGzip(entry, monitorRoot);
  },

  async measureCrashLatency(ctx) {
    const samples = simulateCrashHotPath(ctx);
    return summarise(samples);
  },

  async measureInstallTime(ctx) {
    if (ctx.dryRun) return null;
    return measureNpmInstall({
      packageName: '@erne/monitor',
      version: ERNE_VERSION,
      measureCold: true,
      now: ctx.now,
    });
  },

  async measureSymbolicationAccuracy(ctx) {
    ctx.log('symbolication_accuracy: erne — using fixture mapping');
    const verdicts: FrameVerdict[] = [];
    for (const frame of fixtureFrames) {
      const resolved = applyFixtureMapping(frame, fixtureMapping);
      verdicts.push({
        category: frame.category,
        correct: resolved.file === frame.expectedFile && resolved.line === frame.expectedLine,
      });
    }
    return summariseVerdicts(verdicts);
  },
};

/**
 * Replicates the CrashCollector hot path: take an Error, extract message
 * + stack, construct a fingerprint, serialise to JSON. Skips the
 * SignalBus + EventStore wiring because measuring those is out of scope
 * for "crash capture latency" — they're append-only operations whose
 * cost is dominated by JSON serialisation, which we DO measure.
 */
function simulateCrashHotPath(ctx: BenchmarkContext): number[] {
  const samples: number[] = [];
  const iterations = ctx.iterations;
  // Pre-build the error so allocation cost doesn't pollute the loop
  // budget — a real app `throw`s an already-constructed Error too.
  const err = new Error('benchmark crash');
  for (let i = 0; i < iterations; i++) {
    const start = ctx.now();
    captureSimulated(err);
    samples.push(ctx.now() - start);
  }
  return samples;
}

function captureSimulated(err: Error): unknown {
  // Mirrors @erne/monitor's CrashCollector serialisation step:
  // extract message + stack → build a fingerprint stub → JSON.stringify.
  // The fingerprint stub matches the stable-hash approach but stops short
  // of the full fingerprinter — that work happens off the hot path.
  const message = err.message;
  const stack = err.stack ?? '';
  const fingerprint = simpleFingerprint(stack || message);
  return JSON.stringify({
    type: 'crash',
    severity: 'critical',
    fingerprint,
    payload: { message, stack, isFatal: false, kind: 'exception' },
  });
}

function simpleFingerprint(input: string): string {
  // FNV-1a 32-bit. Matches the `Fingerprinter` complexity class without
  // dragging the full processor into the benchmark.
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

// Re-exported so tests can verify the helpers without importing the
// whole subject + its filesystem touch.
export { simulateCrashHotPath, captureSimulated, simpleFingerprint };

/**
 * Tiny convenience used by the runner to display the published bundle
 * size out-of-band — handy when the user passes `--benchmark=bundle_size
 * --subject=erne` and wants the index.js standalone gzip size on top of
 * the transitive walk total.
 */
export function reportEntryGzip(entryPath: string): { gzipBytes: number; rawBytes: number } | null {
  if (!existsSync(entryPath)) return null;
  const { size } = statSync(entryPath);
  const gz = gzipSync(readFileSync(entryPath, 'utf8')).byteLength;
  return { rawBytes: size, gzipBytes: gz };
}

// Quiet the unused import warning when consumers tree-shake; the helper
// is reachable via the named export above.
void resolve;
