// lib/scanners/dead-code.js — Dead code detector for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_FILES = 300;
const MAX_EXPORTS = 500;

const ENTRY_POINTS = new Set(['_layout.tsx', '_layout.ts', '_layout.js', '_layout.jsx', 'App.tsx', 'App.ts', 'app.tsx', 'app.ts', 'App.jsx', 'app.jsx']);

/**
 * Scan for potentially dead (unused) exports.
 * @param {string} cwd - Project root
 * @param {string[]} sourceFiles - Relative paths to source files
 * @returns {{ deadExports: object[] }}
 */
function scanDeadCode(cwd, sourceFiles) {
  const resolvedCwd = path.resolve(cwd);
  const deadExports = [];

  // Limit files to scan
  const filesToScan = sourceFiles.slice(0, MAX_FILES);

  // Step 1: Collect all named exports
  const exportRe = /export\s+(?:const|function|class|type|interface)\s+(\w+)/g;
  const allExports = []; // { name, file, type, fullPath }

  for (const relFile of filesToScan) {
    if (allExports.length >= MAX_EXPORTS) break;

    const baseName = path.basename(relFile);
    // Skip entry points and test files
    if (ENTRY_POINTS.has(baseName)) continue;
    if (/\.(?:test|spec)\.[jt]sx?$/.test(baseName)) continue;
    // Skip index files (re-exports)
    if (/^index\.[jt]sx?$/.test(baseName)) continue;

    const filePath = path.join(resolvedCwd, relFile);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    let match;
    const localRe = new RegExp(exportRe.source, exportRe.flags);
    while ((match = localRe.exec(content)) !== null) {
      if (allExports.length >= MAX_EXPORTS) break;
      const name = match[1];
      const exportText = match[0];
      let type = 'function';
      if (/export\s+(?:type|interface)/.test(exportText)) {
        type = 'type';
      } else if (/^[A-Z]/.test(name) && /<|jsx|tsx/.test(path.extname(relFile)) && /return\s*[(<]/.test(content)) {
        type = 'component';
      } else if (name.startsWith('use')) {
        type = 'hook';
      }
      allExports.push({ name, file: relFile, type, fullPath: filePath });
    }
  }

  // Step 2: For each export, check if it's imported anywhere else
  // Build a content cache for searching
  const contentCache = new Map();
  for (const relFile of filesToScan) {
    const filePath = path.join(resolvedCwd, relFile);
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      contentCache.set(relFile, content);
    } catch {
      // skip
    }
  }

  for (const exp of allExports) {
    let isUsed = false;

    for (const [relFile, content] of contentCache) {
      // Don't search the file that declares the export
      if (relFile === exp.file) continue;

      // Check if the name appears in an import or usage context
      if (content.includes(exp.name)) {
        // Verify it's likely an import reference (not just a comment or string)
        const importCheckRe = new RegExp(`(?:import|from|require).*${escapeRegex(exp.name)}|\\b${escapeRegex(exp.name)}\\b`);
        if (importCheckRe.test(content)) {
          isUsed = true;
          break;
        }
      }
    }

    if (!isUsed) {
      let lastModified = null;
      try {
        const stat = fs.statSync(exp.fullPath);
        lastModified = stat.mtime.toISOString();
      } catch {
        // skip
      }
      deadExports.push({
        name: exp.name,
        file: exp.file,
        type: exp.type,
        lastModified,
      });
    }
  }

  return { deadExports };
}

/**
 * Escape special regex characters in a string.
 * @param {string} str
 * @returns {string}
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = scanDeadCode;
