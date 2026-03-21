// lib/scanners/tech-debt.js — Tech debt scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Scan for TODO, FIXME, HACK, XXX comments indicating tech debt.
 * @param {string} cwd - Project root
 * @param {string[]} sourceFiles - Relative paths to source files
 * @returns {{ items: object[], summary: object }}
 */
function scanTechDebt(cwd, sourceFiles) {
  const resolvedCwd = path.resolve(cwd);
  const items = [];
  const counts = { todo: 0, fixme: 0, hack: 0, xxx: 0 };

  // Single-line comment pattern
  const singleLineRe = /\/\/\s*(TODO|FIXME|HACK|XXX)\s*:?\s*(.*)/gi;
  // Block comment pattern
  const blockCommentRe = /\/\*[\s\S]*?(TODO|FIXME|HACK|XXX)\s*:?\s*(.*?)(?:\*\/|$)/gi;

  for (const relFile of sourceFiles) {
    const filePath = path.join(resolvedCwd, relFile);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');

    // Scan single-line comments
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const localRe = new RegExp(singleLineRe.source, singleLineRe.flags);
      let match;
      while ((match = localRe.exec(line)) !== null) {
        const category = match[1].toLowerCase();
        const text = match[2].trim();
        items.push({ category, text, file: relFile, line: i + 1 });
        if (counts[category] !== undefined) counts[category]++;
      }
    }

    // Scan block comments
    const blockRe = new RegExp(blockCommentRe.source, blockCommentRe.flags);
    let blockMatch;
    while ((blockMatch = blockRe.exec(content)) !== null) {
      const category = blockMatch[1].toLowerCase();
      const text = blockMatch[2].trim();
      const lineNum = content.substring(0, blockMatch.index).split('\n').length;

      // Avoid double-counting if already caught by single-line scan
      const alreadyCounted = items.some(
        (item) => item.file === relFile && item.line === lineNum && item.category === category
      );
      if (!alreadyCounted) {
        items.push({ category, text, file: relFile, line: lineNum });
        if (counts[category] !== undefined) counts[category]++;
      }
    }
  }

  const summary = {
    todo: counts.todo,
    fixme: counts.fixme,
    hack: counts.hack,
    xxx: counts.xxx,
    total: items.length,
  };

  return { items, summary };
}

module.exports = scanTechDebt;
