// lib/scanners/type-safety.js — Type safety scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

const TS_EXTENSIONS = new Set(['.ts', '.tsx']);

const ANY_PATTERNS = [
  /:\s*any\b/g,
  /\bas\s+any\b/g,
  /<any>/g,
  /\bany\[\]/g,
  /\bany\s*[,)]/g,
];

/**
 * Scan TypeScript files for `any` usage and type safety metrics.
 * @param {string} cwd - Project root
 * @param {string[]} sourceFiles - Relative paths to source files
 * @returns {{ summary: object, perFile: object[], perCategory: object }}
 */
function scanTypeSafety(cwd, sourceFiles) {
  const resolvedCwd = path.resolve(cwd);
  const perFile = [];
  let totalTsFiles = 0;
  let filesWithAny = 0;
  let totalAnyUsages = 0;

  const categoryBuckets = {
    components: { files: 0, anyCount: 0 },
    hooks: { files: 0, anyCount: 0 },
    api: { files: 0, anyCount: 0 },
    utils: { files: 0, anyCount: 0 },
    other: { files: 0, anyCount: 0 },
  };

  // Only scan .ts/.tsx files
  const tsFiles = sourceFiles.filter((f) => TS_EXTENSIONS.has(path.extname(f)));
  totalTsFiles = tsFiles.length;

  for (const relFile of tsFiles) {
    const filePath = path.join(resolvedCwd, relFile);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lineCount = content.split('\n').length;
    let anyCount = 0;

    // Count `any` usages across all patterns
    // Use a Set of match positions to avoid double-counting overlapping patterns
    const matchPositions = new Set();
    for (const pattern of ANY_PATTERNS) {
      const re = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = re.exec(content)) !== null) {
        if (!matchPositions.has(match.index)) {
          matchPositions.add(match.index);
          anyCount++;
        }
      }
    }

    if (anyCount > 0) {
      filesWithAny++;
      totalAnyUsages += anyCount;
      perFile.push({ file: relFile, anyCount, lineCount });
    }

    // Categorize
    const category = categorizeFile(relFile);
    categoryBuckets[category].files++;
    categoryBuckets[category].anyCount += anyCount;
  }

  const coveragePercent = totalTsFiles > 0
    ? Math.round(((totalTsFiles - filesWithAny) / totalTsFiles) * 10000) / 100
    : 100;

  const summary = {
    totalTsFiles,
    filesWithAny,
    totalAnyUsages,
    coveragePercent,
  };

  // Build perCategory from buckets
  const perCategory = {};
  for (const [cat, data] of Object.entries(categoryBuckets)) {
    if (data.files > 0) {
      perCategory[cat] = data;
    }
  }

  return { summary, perFile, perCategory };
}

/**
 * Categorize a file by its directory path.
 * @param {string} relFile
 * @returns {string}
 */
function categorizeFile(relFile) {
  const normalized = relFile.replace(/\\/g, '/').toLowerCase();
  if (/(?:^|\/)components?\//.test(normalized) || /(?:^|\/)ui\//.test(normalized) || /(?:^|\/)screens?\//.test(normalized)) {
    return 'components';
  }
  if (/(?:^|\/)hooks?\//.test(normalized)) {
    return 'hooks';
  }
  if (/(?:^|\/)(?:api|services?)\//.test(normalized)) {
    return 'api';
  }
  if (/(?:^|\/)(?:utils?|helpers?|lib)\//.test(normalized)) {
    return 'utils';
  }
  return 'other';
}

module.exports = scanTypeSafety;
