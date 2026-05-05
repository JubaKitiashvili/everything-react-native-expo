// Task 117.91 — file-system locations for the local @erne/monitor build.
//
// Extracted from `erne.ts` so tests can stub `resolveMonitorRoot` and
// `resolveMonitorEntry` without faking the rest of the subject. The
// version literal lives here too because the bundle_size + install_time
// paths both need it and we want exactly one place to bump.

import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { BenchmarkContext } from '../types.js';

/**
 * Pinned @erne/monitor version we benchmark against. Bump in lockstep
 * with packages/monitor/package.json so install_time picks up the
 * intended release.
 */
export const ERNE_VERSION = '1.0.0';

/**
 * Find the local @erne/monitor source root, preferring the in-monorepo
 * sibling at `<workspaceRoot>/packages/monitor`. Returns the directory
 * containing `package.json` so the caller can resolve subpaths.
 */
export function resolveMonitorRoot(ctx: BenchmarkContext): string {
  const candidate = resolve(ctx.workspaceRoot, 'packages', 'monitor');
  if (existsSync(join(candidate, 'package.json'))) return candidate;
  // Fallback: when this package is copied into the future
  // erne-benchmarks repo, allow ERNE_MONITOR_ROOT to point at a
  // local checkout.
  const env = process.env.ERNE_MONITOR_ROOT;
  if (env && existsSync(join(env, 'package.json'))) return env;
  throw new Error(
    `resolveMonitorRoot: could not locate @erne/monitor (expected ${candidate} or $ERNE_MONITOR_ROOT)`,
  );
}

/**
 * Pick the entry the bundle_size walker should start from. Prefers the
 * built `dist/index.js` (matches what npm consumers see); falls back to
 * the source `src/index.ts` so the benchmark still works pre-build.
 */
export function resolveMonitorEntry(monitorRoot: string): string | null {
  const builtJs = join(monitorRoot, 'dist', 'index.js');
  if (existsSync(builtJs)) return builtJs;
  const builtFromManifest = readMainFromManifest(monitorRoot);
  if (builtFromManifest && existsSync(builtFromManifest)) return builtFromManifest;
  return null;
}

function readMainFromManifest(monitorRoot: string): string | null {
  try {
    const pkg = JSON.parse(readFileSync(join(monitorRoot, 'package.json'), 'utf8')) as {
      main?: string;
    };
    if (typeof pkg.main === 'string' && pkg.main.length > 0) {
      return resolve(monitorRoot, pkg.main);
    }
    return null;
  } catch {
    return null;
  }
}
