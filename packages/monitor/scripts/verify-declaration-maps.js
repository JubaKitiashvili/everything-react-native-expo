#!/usr/bin/env node
/**
 * Declaration-map completeness check.
 *
 * Go-to-Definition in a consumer's IDE only jumps into our actual
 * TypeScript source (not the compiled `.d.ts`) when every `.js` file
 * we ship has a matching `.d.ts.map` whose `sources` array points at a
 * real file inside `src/`. Without the map, IDEs land on the generated
 * declaration — which is technically accurate but useless for reading
 * the implementation.
 *
 * This script is run after `npm run build` in CI. It fails loudly when:
 *   - A `.js` is missing its `.d.ts` (type info gone)
 *   - A `.js` is missing its `.d.ts.map` (GTD broken)
 *   - A `.d.ts.map` references a source file that doesn't exist
 *
 * Ignored: files in `dist/exports/` — those are the thin re-export
 * facades and always resolve to a single source. Still required to
 * have the map files though (consumer GTD into the re-export origin
 * works via the re-exported symbols' own maps).
 *
 * Usage:
 *   node scripts/verify-declaration-maps.js
 *
 * Exit codes:
 *   0 — every .js has its .d.ts + .d.ts.map and sources resolve
 *   1 — one or more files are missing or sources can't be resolved
 *   2 — dist/ not built
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const DIST_DIR = path.join(PACKAGE_ROOT, 'dist');
const SRC_DIR = path.join(PACKAGE_ROOT, 'src');

function walk(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, acc);
    else acc.push(abs);
  }
  return acc;
}

function check(dist, src) {
  if (!fs.existsSync(dist)) {
    return {
      kind: 'dist-missing',
      message: `dist/ missing — run 'npm run build' first (${dist}).`,
    };
  }
  if (!fs.existsSync(src)) {
    return {
      kind: 'src-missing',
      message: `src/ missing — cannot verify map targets (${src}).`,
    };
  }

  const problems = [];
  const files = walk(dist).filter((f) => f.endsWith('.js'));

  for (const js of files) {
    const dts = js.replace(/\.js$/, '.d.ts');
    const map = js.replace(/\.js$/, '.d.ts.map');

    if (!fs.existsSync(dts)) {
      problems.push({
        file: path.relative(dist, js),
        kind: 'missing-dts',
        message: 'No .d.ts sibling — consumers get no type info.',
      });
      continue;
    }

    if (!fs.existsSync(map)) {
      problems.push({
        file: path.relative(dist, js),
        kind: 'missing-map',
        message: 'No .d.ts.map sibling — IDE Go-to-Definition is broken.',
      });
      continue;
    }

    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(map, 'utf8'));
    } catch (e) {
      problems.push({
        file: path.relative(dist, map),
        kind: 'invalid-map',
        message: 'Failed to parse .d.ts.map: ' + String(e),
      });
      continue;
    }

    const sources = Array.isArray(parsed.sources) ? parsed.sources : [];
    if (sources.length === 0) {
      problems.push({
        file: path.relative(dist, map),
        kind: 'empty-sources',
        message: 'Map has no `sources` entries.',
      });
      continue;
    }

    for (const source of sources) {
      const sourceAbs = path.resolve(path.dirname(map), source);
      if (!fs.existsSync(sourceAbs)) {
        problems.push({
          file: path.relative(dist, map),
          kind: 'missing-source',
          message: `Referenced source does not exist: ${source}`,
        });
      } else if (!sourceAbs.startsWith(src)) {
        problems.push({
          file: path.relative(dist, map),
          kind: 'source-outside-src',
          message: `Referenced source outside src/: ${source}`,
        });
      }
    }
  }

  return {
    kind: 'ok',
    filesChecked: files.length,
    problems,
  };
}

function main() {
  const result = check(DIST_DIR, SRC_DIR);

  if (result.kind !== 'ok') {
    console.error(`[@erne/monitor] ${result.message}`);
    process.exit(2);
  }

  if (result.problems.length === 0) {
    console.log(
      `[@erne/monitor] Declaration maps OK — ${result.filesChecked} files checked.`,
    );
    process.exit(0);
  }

  for (const p of result.problems) {
    console.error(`  ${p.kind}  ${p.file}  — ${p.message}`);
  }
  console.error(
    `\n[@erne/monitor] ${result.problems.length} declaration map problem(s) in ${result.filesChecked} files.`,
  );
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { check, walk };
