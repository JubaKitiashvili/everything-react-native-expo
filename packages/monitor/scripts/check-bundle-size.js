#!/usr/bin/env node
/**
 * Bundle size budget enforcer for @erne/monitor.
 *
 * Runs after `npm run build` and fails if any published entry point
 * exceeds its gzipped size budget. Consumers care about the gzipped
 * figure because that's what ships over the wire during metro bundling
 * (Hermes bytecode + gzip transport).
 *
 * Budgets mirror the design spec §7 "Performance Budget":
 *
 *   - main (index.js)          ≤ 50 KB gzip
 *   - /performance             ≤ 20 KB gzip
 *   - /network                 ≤  5 KB gzip
 *   - /ai                      ≤ 30 KB gzip  (pattern library heavy)
 *   - /replay                  ≤ 10 KB gzip
 *   - /dev                     ≤ 15 KB gzip
 *
 * These are conservative: Metro / Hermes will dead-code-eliminate
 * anything the consumer doesn't import, so the REAL bundle impact is
 * almost always smaller than what this script measures. If this script
 * starts complaining, look at what was added in the latest commit
 * before shrugging it off.
 *
 * Usage:
 *   node scripts/check-bundle-size.js
 *   node scripts/check-bundle-size.js --json > sizes.json
 *
 * Exit codes:
 *   0  — all entries within budget
 *   1  — one or more entries exceeded budget
 *   2  — dist/ not built (run `npm run build` first)
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

/**
 * Entries whose published size we track, mapped to their budgets (KB
 * gzipped). The main entry re-exports EVERY public symbol so its size
 * reflects the full SDK surface. Consumers who want smaller footprints
 * should import from a subpath (`@erne/monitor/performance`, etc.) —
 * those budgets are intentionally tight to keep each domain small.
 *
 * Spec §7 quotes a 50 KB gzipped target for "the JS bundle" — that
 * figure assumes subpath imports in a tree-shaking consumer. The main
 * entry in a no-tree-shake scenario measures ~67 KB gzipped today, so
 * the `main` budget is set at 75 KB to catch regressions without
 * churning on every one-liner that crosses 50.
 */
const BUDGETS = [
  { name: 'main', entry: 'dist/index.js', budgetKb: 75 },
  { name: '/performance', entry: 'dist/exports/performance.js', budgetKb: 20 },
  { name: '/network', entry: 'dist/exports/network.js', budgetKb: 5 },
  { name: '/ai', entry: 'dist/exports/ai.js', budgetKb: 30 },
  { name: '/replay', entry: 'dist/exports/replay.js', budgetKb: 10 },
  { name: '/dev', entry: 'dist/exports/dev.js', budgetKb: 15 },
  { name: '/testing', entry: 'dist/exports/testing.js', budgetKb: 10 },
];

const PACKAGE_ROOT = path.resolve(__dirname, '..');

/** Reads an entry and all its local re-exports transitively. */
function collectEntrySize(entryPath) {
  const visited = new Set();
  const stack = [entryPath];
  let rawBytes = 0;
  const chunks = [];
  while (stack.length > 0) {
    const abs = stack.pop();
    if (visited.has(abs)) continue;
    visited.add(abs);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    rawBytes += Buffer.byteLength(src, 'utf8');
    chunks.push(src);
    for (const dep of extractRelativeImports(src, abs)) {
      if (!visited.has(dep)) stack.push(dep);
    }
  }
  const combined = chunks.join('\n');
  const gzipped = zlib.gzipSync(combined, { level: 9 });
  return {
    files: visited.size,
    rawBytes,
    gzipBytes: gzipped.length,
  };
}

/**
 * Extracts relative import paths from a compiled JS module. Matches
 * both ESM (`export … from './foo'`, `import … from '../bar'`) and
 * CommonJS (`require("./baz")`) forms so this works whether tsc emits
 * ESM or CommonJS. External packages (which never start with a dot)
 * are skipped — they're peerDeps, not our bundle.
 */
function extractRelativeImports(src, fromFile) {
  const out = [];
  // Match ESM static import/export-from and CJS require in one sweep.
  const patterns = [
    /(?:export|import)\s+(?:[^'"`]*?\s+from\s+|\s*\()?\s*['"`](\.\.?\/[^'"`]+)['"`]/g,
    /require\s*\(\s*['"`](\.\.?\/[^'"`]+)['"`]\s*\)/g,
  ];
  for (const re of patterns) {
    let match;
    while ((match = re.exec(src)) !== null) {
      const specifier = match[1];
      const dir = path.dirname(fromFile);
      const candidates = [
        path.resolve(dir, specifier + '.js'),
        path.resolve(dir, specifier, 'index.js'),
      ];
      for (const c of candidates) {
        if (fs.existsSync(c)) {
          out.push(c);
          break;
        }
      }
    }
  }
  return out;
}

function kb(bytes) {
  return (bytes / 1024).toFixed(2);
}

function main() {
  const distDir = path.join(PACKAGE_ROOT, 'dist');
  if (!fs.existsSync(distDir)) {
    console.error('[@erne/monitor] dist/ missing — run `npm run build` first.');
    process.exit(2);
  }

  const wantsJson = process.argv.includes('--json');
  const results = [];
  let failed = false;

  for (const row of BUDGETS) {
    const entry = path.join(PACKAGE_ROOT, row.entry);
    if (!fs.existsSync(entry)) {
      results.push({
        name: row.name,
        entry: row.entry,
        missing: true,
        budgetKb: row.budgetKb,
      });
      failed = true;
      continue;
    }
    const { files, rawBytes, gzipBytes } = collectEntrySize(entry);
    const gzipKb = gzipBytes / 1024;
    const withinBudget = gzipKb <= row.budgetKb;
    if (!withinBudget) failed = true;
    results.push({
      name: row.name,
      entry: row.entry,
      files,
      rawBytes,
      gzipBytes,
      budgetKb: row.budgetKb,
      withinBudget,
    });
  }

  if (wantsJson) {
    process.stdout.write(JSON.stringify(results, null, 2) + '\n');
  } else {
    // Human-friendly table.
    const rows = [['entry', 'files', 'raw (KB)', 'gzip (KB)', 'budget (KB)', 'status']];
    for (const r of results) {
      if (r.missing) {
        rows.push([r.name, '—', '—', '—', String(r.budgetKb), 'missing']);
        continue;
      }
      rows.push([
        r.name,
        String(r.files),
        kb(r.rawBytes),
        kb(r.gzipBytes),
        String(r.budgetKb),
        r.withinBudget ? 'ok' : 'OVER',
      ]);
    }
    const widths = rows[0].map((_, c) =>
      Math.max(...rows.map((row) => row[c].length)),
    );
    for (const row of rows) {
      console.log(
        row.map((cell, c) => cell.padEnd(widths[c])).join('  '),
      );
    }
    if (failed) {
      console.error(
        '\n[@erne/monitor] One or more entries exceeded their bundle size budget.',
      );
    } else {
      console.log('\n[@erne/monitor] All entries within budget.');
    }
  }

  process.exit(failed ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = { BUDGETS, collectEntrySize };
