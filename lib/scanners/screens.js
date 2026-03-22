// lib/scanners/screens.js — Screen dependency scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

const EXCLUDE_FILES = new Set(['_layout.tsx', '_layout.ts', '_layout.js', '_layout.jsx']);
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Scan screen files and their dependency graphs.
 * @param {string} cwd - Project root
 * @returns {{ screens: object[] }}
 */
function scanScreens(cwd) {
  const resolvedCwd = path.resolve(cwd);
  const appDir = fs.existsSync(path.join(resolvedCwd, 'app'))
    ? path.join(resolvedCwd, 'app')
    : fs.existsSync(path.join(resolvedCwd, 'src', 'app'))
      ? path.join(resolvedCwd, 'src', 'app')
      : null;
  const screens = [];

  if (!appDir) {
    return { screens };
  }

  // Collect screen files: .tsx/.ts files directly in app/ subdirectories
  // (not _layout, not in components subdirs)
  const screenFiles = [];
  collectScreenFiles(appDir, resolvedCwd, screenFiles);

  for (const relFile of screenFiles) {
    const filePath = path.join(resolvedCwd, relFile);
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const screen = {
      name: path.basename(relFile, path.extname(relFile)),
      file: relFile,
      components: [],
      stores: [],
      apiCalls: [],
      hooks: [],
      navigation: [],
      params: [],
    };

    // Parse import statements
    const importRe = /import\s+(?:\{[^}]*\}|\w+(?:\s*,\s*\{[^}]*\})?)\s+from\s+[`'"](.*?)[`'"]/g;
    let match;
    while ((match = importRe.exec(content)) !== null) {
      const importPath = match[1];
      const importBlock = match[0];

      // Component imports (from components/ or ui/)
      if (/(?:components|ui)[/\\]/.test(importPath)) {
        const names = extractImportNames(importBlock);
        screen.components.push(...names);
      }

      // Store imports (from store/ or containing 'Store')
      if (/store[/\\]/.test(importPath) || /Store/.test(importPath)) {
        const names = extractImportNames(importBlock);
        screen.stores.push(...names);
      }

      // API imports (from api/ or services/)
      if (/(?:api|services)[/\\]/.test(importPath)) {
        const names = extractImportNames(importBlock);
        screen.apiCalls.push(...names);
      }

      // Hook imports (functions starting with 'use')
      const hookNames = extractImportNames(importBlock).filter((n) => n.startsWith('use'));
      screen.hooks.push(...hookNames);
    }

    // Deduplicate hooks from other categories
    screen.hooks = [...new Set(screen.hooks)];
    screen.components = [...new Set(screen.components)];
    screen.stores = [...new Set(screen.stores)];
    screen.apiCalls = [...new Set(screen.apiCalls)];

    // Navigation patterns
    const navPatterns = [
      /router\.push\s*\(\s*[`'"](.*?)[`'"]/g,
      /router\.replace\s*\(\s*[`'"](.*?)[`'"]/g,
      /href\s*=\s*[`'"](.*?)[`'"]/g,
    ];
    for (const re of navPatterns) {
      let navMatch;
      while ((navMatch = re.exec(content)) !== null) {
        screen.navigation.push(navMatch[1]);
      }
    }
    // Link components with href
    const linkRe = /<Link\s[^>]*href\s*=\s*[`'"](.*?)[`'"]/g;
    let linkMatch;
    while ((linkMatch = linkRe.exec(content)) !== null) {
      screen.navigation.push(linkMatch[1]);
    }
    screen.navigation = [...new Set(screen.navigation)];

    // Params detection
    if (/useLocalSearchParams/.test(content)) {
      screen.params.push('useLocalSearchParams');
    }
    if (/useGlobalSearchParams/.test(content)) {
      screen.params.push('useGlobalSearchParams');
    }

    screens.push(screen);
  }

  return { screens };
}

/**
 * Collect screen files from app/ directory.
 */
function collectScreenFiles(dirPath, cwd, results, depth) {
  if (depth === undefined) depth = 0;
  if (depth > 5) return;

  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'components' || entry.name === 'node_modules') continue;
      collectScreenFiles(full, cwd, results, depth + 1);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name);
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (EXCLUDE_FILES.has(entry.name)) continue;
      results.push(path.relative(cwd, full));
    }
  }
}

/**
 * Extract named imports from an import statement.
 * @param {string} importStmt
 * @returns {string[]}
 */
function extractImportNames(importStmt) {
  const names = [];
  // Default import
  const defaultMatch = importStmt.match(/import\s+(\w+)/);
  if (defaultMatch && defaultMatch[1] !== 'type') {
    names.push(defaultMatch[1]);
  }
  // Named imports
  const namedMatch = importStmt.match(/\{([^}]*)\}/);
  if (namedMatch) {
    const inner = namedMatch[1];
    const parts = inner.split(',').map((s) => s.trim()).filter(Boolean);
    for (const part of parts) {
      // Handle "Name as Alias" and "type Name"
      const cleaned = part.replace(/\s+as\s+\w+/, '').replace(/^type\s+/, '').trim();
      if (cleaned) names.push(cleaned);
    }
  }
  return names;
}

module.exports = scanScreens;
