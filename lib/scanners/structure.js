// lib/scanners/structure.js — Structure scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'ios', 'android', 'build', 'dist',
  '.expo', '.next', '__tests__', '.cache', '.turbo',
]);

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

const MAX_DEPTH = 5;

/**
 * Scan project structure from the given directory.
 * @param {string} cwd - Project root
 * @returns {{ tree: object, dirCounts: object, totalSourceFiles: number, sourceFiles: string[] }}
 */
function scanStructure(cwd) {
  const dirCounts = {};
  const sourceFiles = [];
  let maxFiles = 500;

  function walk(dirPath, depth) {
    const name = path.basename(dirPath);
    const node = { name, type: 'dir', children: [] };

    if (depth > MAX_DEPTH) return node;

    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return node;
    }

    // Sort for deterministic output
    entries.sort((a, b) => a.name.localeCompare(b.name));

    let dirSourceCount = 0;

    for (const entry of entries) {
      if (sourceFiles.length >= maxFiles) break;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        if (EXCLUDE_DIRS.has(entry.name)) continue;
        const child = walk(fullPath, depth + 1);
        node.children.push(child);
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SOURCE_EXTENSIONS.has(ext)) {
          const relPath = path.relative(cwd, fullPath);
          sourceFiles.push(relPath);
          dirSourceCount++;
        }
        node.children.push({ name: entry.name, type: 'file' });
      }
    }

    if (dirSourceCount > 0) {
      const relDir = path.relative(cwd, dirPath) || '.';
      dirCounts[relDir] = dirSourceCount;
    }

    return node;
  }

  const resolvedCwd = path.resolve(cwd);
  const tree = walk(resolvedCwd, 0);

  return {
    tree,
    dirCounts,
    totalSourceFiles: sourceFiles.length,
    sourceFiles,
  };
}

module.exports = scanStructure;
