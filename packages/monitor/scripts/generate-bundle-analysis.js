#!/usr/bin/env node
/**
 * Generates `docs/BUNDLE-ANALYSIS.md` from the live `dist/` output.
 * Committed so pull-request reviewers can see the effect of an import
 * change without running the build themselves, and so npm package
 * page readers get a transparent size breakdown.
 *
 * The report has two sections:
 *
 *   1. Summary table — one row per subpath with raw + gzip + budget.
 *   2. Per-entry breakdown — every transitively-reached file sorted
 *      by size, with the top 10 callers for the main entry.
 *
 * Usage:
 *   node scripts/generate-bundle-analysis.js         # writes docs/BUNDLE-ANALYSIS.md
 *   node scripts/generate-bundle-analysis.js --check # fails if file is stale
 *
 * The `--check` mode is what CI runs. It produces the report in
 * memory, compares it to the committed copy byte-for-byte, and fails
 * with a diff-style message when they don't match.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BUDGETS, collectEntrySize } = require('./check-bundle-size.js');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(PACKAGE_ROOT, 'docs', 'BUNDLE-ANALYSIS.md');

function kb(bytes) {
  return (bytes / 1024).toFixed(2);
}

function walk(entry) {
  const visited = new Set();
  const stack = [entry];
  while (stack.length > 0) {
    const abs = stack.pop();
    if (visited.has(abs) || !fs.existsSync(abs)) continue;
    visited.add(abs);
    const src = fs.readFileSync(abs, 'utf8');
    const patterns = [
      /(?:export|import)\s+(?:[^'"`]*?\s+from\s+|\s*\()?\s*['"`](\.\.?\/[^'"`]+)['"`]/g,
      /require\s*\(\s*['"`](\.\.?\/[^'"`]+)['"`]\s*\)/g,
    ];
    for (const re of patterns) {
      let match;
      while ((match = re.exec(src)) !== null) {
        const dir = path.dirname(abs);
        const candidates = [
          path.resolve(dir, match[1] + '.js'),
          path.resolve(dir, match[1], 'index.js'),
        ];
        for (const c of candidates) {
          if (fs.existsSync(c) && !visited.has(c)) {
            stack.push(c);
            break;
          }
        }
      }
    }
  }
  return [...visited];
}

function perFileSizes(entry) {
  return walk(entry)
    .map((abs) => {
      const src = fs.readFileSync(abs);
      return {
        file: path.relative(PACKAGE_ROOT, abs),
        rawBytes: src.length,
        gzipBytes: zlib.gzipSync(src, { level: 9 }).length,
      };
    })
    .sort((a, b) => b.gzipBytes - a.gzipBytes);
}

function renderReport() {
  const lines = [];
  lines.push('# Bundle Analysis');
  lines.push('');
  lines.push(
    '> Auto-generated from `dist/` after `npm run build`. Do not edit by hand —',
  );
  lines.push(
    '> run `npm run analyze` to regenerate. CI fails on any mismatch.',
  );
  lines.push('');
  lines.push(
    '`@erne/monitor` ships six tree-shakeable entry points. Consumers',
  );
  lines.push(
    'who import from a subpath only pay for what they use. The main',
  );
  lines.push(
    'entry re-exports every public symbol — it\'s the biggest bundle,',
  );
  lines.push('always — but it\'s also the simplest to wire.');
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push('| Entry | Files | Raw (KB) | Gzip (KB) | Budget (KB) | Status |');
  lines.push('| ----- | ----: | -------: | --------: | ----------: | :----- |');
  const summary = BUDGETS.map((row) => {
    const entry = path.join(PACKAGE_ROOT, row.entry);
    if (!fs.existsSync(entry)) {
      return {
        ...row,
        files: 0,
        rawBytes: 0,
        gzipBytes: 0,
        status: 'MISSING',
      };
    }
    const measured = collectEntrySize(entry);
    const ok = measured.gzipBytes / 1024 <= row.budgetKb;
    return {
      ...row,
      files: measured.files,
      rawBytes: measured.rawBytes,
      gzipBytes: measured.gzipBytes,
      status: ok ? 'ok' : 'OVER',
    };
  });
  for (const row of summary) {
    lines.push(
      `| \`${row.name}\` | ${row.files} | ${kb(row.rawBytes)} | ${kb(row.gzipBytes)} | ${row.budgetKb} | ${row.status} |`,
    );
  }
  lines.push('');

  lines.push('## Largest files (main entry)');
  lines.push('');
  lines.push('| File | Raw (KB) | Gzip (KB) |');
  lines.push('| ---- | -------: | --------: |');
  const mainEntry = path.join(PACKAGE_ROOT, 'dist', 'index.js');
  if (fs.existsSync(mainEntry)) {
    const files = perFileSizes(mainEntry).slice(0, 15);
    for (const f of files) {
      lines.push(
        `| \`${f.file.replace(/\\/g, '/')}\` | ${kb(f.rawBytes)} | ${kb(f.gzipBytes)} |`,
      );
    }
  }
  lines.push('');

  lines.push('## Per-subpath breakdown');
  lines.push('');
  for (const row of BUDGETS) {
    if (row.name === 'main') continue;
    const entry = path.join(PACKAGE_ROOT, row.entry);
    if (!fs.existsSync(entry)) continue;
    lines.push(`### \`@erne/monitor${row.name}\``);
    lines.push('');
    lines.push('| File | Raw (KB) | Gzip (KB) |');
    lines.push('| ---- | -------: | --------: |');
    const files = perFileSizes(entry);
    for (const f of files.slice(0, 10)) {
      lines.push(
        `| \`${f.file.replace(/\\/g, '/')}\` | ${kb(f.rawBytes)} | ${kb(f.gzipBytes)} |`,
      );
    }
    if (files.length > 10) {
      lines.push(`| …${files.length - 10} more | — | — |`);
    }
    lines.push('');
  }

  lines.push('## How to interpret');
  lines.push('');
  lines.push(
    '- **Raw** is the concatenated size of every `.js` file reached',
  );
  lines.push(
    '  from this entry (sum of on-disk bytes, no minification).',
  );
  lines.push(
    '- **Gzip** is the true over-the-wire cost — Metro + Hermes both',
  );
  lines.push(
    '  gzip their delivery; this is the number consumers actually pay.',
  );
  lines.push(
    '- **Budget** is the ceiling enforced by `scripts/check-bundle-size.js`.',
  );
  lines.push(
    '  Regressions fail the `monitor / performance budget` CI workflow.',
  );
  lines.push('');
  lines.push(
    'A tree-shaking bundler (Metro in RN, esbuild/Rollup on web) will',
  );
  lines.push(
    'drop everything the consumer doesn\'t import — so real app impact',
  );
  lines.push('is almost always smaller than the numbers above.');
  lines.push('');
  return lines.join('\n');
}

function main() {
  const report = renderReport();
  const check = process.argv.includes('--check');
  if (check) {
    if (!fs.existsSync(REPORT_PATH)) {
      console.error(
        `[@erne/monitor] ${path.relative(PACKAGE_ROOT, REPORT_PATH)} missing — run 'npm run analyze' to create it.`,
      );
      process.exit(1);
    }
    const committed = fs.readFileSync(REPORT_PATH, 'utf8');
    if (committed === report) {
      console.log(
        `[@erne/monitor] ${path.relative(PACKAGE_ROOT, REPORT_PATH)} is up to date.`,
      );
      process.exit(0);
    }
    console.error(
      `[@erne/monitor] ${path.relative(PACKAGE_ROOT, REPORT_PATH)} is stale. Run 'npm run analyze' and commit the result.`,
    );
    process.exit(1);
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, report);
  console.log(
    `[@erne/monitor] Wrote ${path.relative(PACKAGE_ROOT, REPORT_PATH)} (${report.length} bytes).`,
  );
}

if (require.main === module) {
  main();
}

module.exports = { renderReport };
