// Task 117.91 — bundle size benchmark.
//
// Walks an entry's transitive ESM/CJS import graph and gzips every leaf,
// summing the bytes. Matches the methodology of @erne/monitor's
// scripts/check-bundle-size.js so the numbers are consistent with the
// SDK's own per-PR budget enforcement.
//
// Subjects do the actual walk because each SDK ships its files in a
// different layout. This module is just the shared `gzipSize` helper +
// the BenchmarkResult adapter.

import { readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { dirname, resolve, relative } from 'node:path';
import type {
  BenchmarkContext,
  BenchmarkResult,
  BundleSizeMeasurement,
  Subject,
} from '../types.js';
import { runBenchmark } from './runBenchmark.js';

export async function runBundleSize(
  subject: Subject,
  ctx: BenchmarkContext,
): Promise<BenchmarkResult> {
  return runBenchmark({
    benchmark: 'bundle_size',
    subject,
    ctx,
    measure: async (s, c) => s.measureBundleSize(c),
  });
}

/**
 * Compute the gzipped size of `entryPath` plus every locally-imported file
 * it transitively pulls in. Returns the totals + the top files for the
 * formatter.
 *
 * Cycle-safe (visited set), absolute-path deduped, fails fast if an
 * import resolves outside `repoRoot` (so a misconfigured fixture can't
 * walk into `node_modules` and inflate the count).
 */
export function walkAndGzip(
  entryPath: string,
  repoRoot: string,
): BundleSizeMeasurement {
  const visited = new Set<string>();
  const sizes: Array<{ path: string; gzipBytes: number }> = [];
  walk(entryPath);
  sizes.sort((a, b) => b.gzipBytes - a.gzipBytes);
  return {
    totalGzipBytes: sizes.reduce((sum, x) => sum + x.gzipBytes, 0),
    largestFiles: sizes.slice(0, 5),
    fileCount: sizes.length,
    entry: relative(repoRoot, entryPath),
  };

  function walk(filePath: string): void {
    const absolute = resolve(filePath);
    if (visited.has(absolute)) return;
    if (!absolute.startsWith(resolve(repoRoot))) {
      throw new Error(
        `bundle_size: import escaped repoRoot — ${absolute} not under ${repoRoot}`,
      );
    }
    visited.add(absolute);
    const source = readFileSync(absolute, 'utf8');
    const gz = gzipSync(source).byteLength;
    sizes.push({ path: relative(repoRoot, absolute), gzipBytes: gz });
    for (const childRel of extractRelativeImports(source)) {
      const childAbs = resolveImport(absolute, childRel);
      if (childAbs) walk(childAbs);
    }
  }
}

/**
 * Extract local relative imports/requires from a JS source. Same regex
 * pattern as @erne/monitor's `check-bundle-size.js` so the numbers stay
 * comparable.
 */
export function extractRelativeImports(source: string): string[] {
  const out: string[] = [];
  const staticEsm =
    /(?:export|import)\s+(?:[^'"`]*?\s+from\s+|\s*\()?\s*['"`](\.\.?\/[^'"`]+)['"`]/g;
  let m: RegExpExecArray | null;
  while ((m = staticEsm.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  // Dynamic ESM imports (`await import('./x')`, `import('./x').then(...)`).
  const dynamicEsm = /\bimport\s*\(\s*['"`](\.\.?\/[^'"`]+)['"`]\s*\)/g;
  while ((m = dynamicEsm.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  const cjs = /require\(\s*['"`](\.\.?\/[^'"`]+)['"`]\s*\)/g;
  while ((m = cjs.exec(source)) !== null) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

function resolveImport(parentPath: string, importPath: string): string | null {
  const parent = dirname(parentPath);
  // Strip trailing fragments and try the canonical .js / index.js fallback.
  const candidates = [
    resolve(parent, importPath),
    resolve(parent, `${importPath}.js`),
    resolve(parent, importPath, 'index.js'),
  ];
  for (const c of candidates) {
    try {
      readFileSync(c, 'utf8');
      return c;
    } catch {
      continue;
    }
  }
  return null;
}
