// lib/detect.js — Deep stack detection for ERNE CLI
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  isRNProject: false,
  framework: 'unknown',
  stack: {
    state: 'none',
    serverState: 'none',
    navigation: 'none',
    styling: 'stylesheet',
    lists: 'flatlist',
    images: 'rn-image',
    forms: 'none',
    storage: 'async-storage',
    testing: 'none',
    build: 'manual',
  },
  hasMonorepo: false,
  monorepo: null,
  hasNewArch: false,
  hasTypescript: false,
  existingClaudeMd: false,
  componentStyle: 'functional',
};

/**
 * Detect the project stack from a given working directory.
 * @param {string} cwd - The project root directory
 * @returns {object} Detection result
 */
function detectProject(cwd) {
  const result = JSON.parse(JSON.stringify(DEFAULTS));

  // Read package.json
  const pkgPath = path.join(cwd, 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return result;
  }

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // --- Framework detection ---
  const hasExpo = !!deps['expo'];
  const hasRN = !!deps['react-native'];

  if (hasExpo) {
    result.isRNProject = true;
    // Check for native code to distinguish bare vs managed
    if (hasNativeCode(cwd)) {
      result.framework = 'expo-bare';
    } else {
      result.framework = 'expo-managed';
    }
  } else if (hasRN) {
    result.isRNProject = true;
    result.framework = 'bare-rn';
  } else {
    return result;
  }

  // --- Stack detection ---
  // State
  if (deps['zustand']) result.stack.state = 'zustand';
  else if (deps['@reduxjs/toolkit']) result.stack.state = 'redux-toolkit';
  else if (deps['redux-saga']) result.stack.state = 'redux-saga';
  else if (deps['mobx-react'] || deps['mobx-react-lite']) result.stack.state = 'mobx';

  // Server state
  if (deps['@tanstack/react-query']) result.stack.serverState = 'tanstack-query';
  else if (deps['swr']) result.stack.serverState = 'swr';

  // Navigation
  if (deps['expo-router']) result.stack.navigation = 'expo-router';
  else if (deps['@react-navigation/native']) result.stack.navigation = 'react-navigation';

  // Styling
  if (deps['nativewind']) result.stack.styling = 'nativewind';
  else if (deps['tamagui']) result.stack.styling = 'tamagui';
  else if (deps['react-native-unistyles']) result.stack.styling = 'unistyles';

  // Lists
  if (deps['@shopify/flash-list']) result.stack.lists = 'flashlist';

  // Images
  if (deps['expo-image']) result.stack.images = 'expo-image';
  else if (deps['react-native-fast-image']) result.stack.images = 'fast-image';

  // Forms
  if (deps['react-hook-form']) result.stack.forms = 'react-hook-form';
  else if (deps['formik']) result.stack.forms = 'formik';
  else if (deps['redux-form']) result.stack.forms = 'redux-form';

  // Storage
  if (deps['expo-secure-store']) result.stack.storage = 'expo-secure-store';
  else if (deps['react-native-keychain']) result.stack.storage = 'rn-keychain';

  // Testing
  if (deps['@testing-library/react-native']) result.stack.testing = 'jest-rntl';
  else if (deps['detox']) result.stack.testing = 'jest-detox';

  // Build
  if (fs.existsSync(path.join(cwd, 'eas.json'))) result.stack.build = 'eas';
  else if (fs.existsSync(path.join(cwd, 'fastlane'))) result.stack.build = 'fastlane';

  // --- Metadata ---
  // Monorepo
  const monorepoInfo = detectMonorepo(cwd, pkg);
  result.hasMonorepo = monorepoInfo !== null;
  result.monorepo = monorepoInfo;

  // TypeScript
  result.hasTypescript = fs.existsSync(path.join(cwd, 'tsconfig.json'));

  // Existing CLAUDE.md
  result.existingClaudeMd = fs.existsSync(path.join(cwd, 'CLAUDE.md'));

  // New Architecture
  result.hasNewArch = detectNewArch(cwd, pkg);

  // Component style
  result.componentStyle = detectComponentStyle(cwd);

  return result;
}

/**
 * Detect monorepo configuration and scan workspace packages.
 * @param {string} cwd - The project root directory
 * @param {object} pkg - Parsed root package.json
 * @returns {object|null} Monorepo info or null if not a monorepo
 */
function detectMonorepo(cwd, pkg) {
  // Determine workspace tool
  let tool = null;
  if (fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml')) ||
      fs.existsSync(path.join(cwd, 'pnpm-workspace.yml'))) {
    tool = 'pnpm';
  } else if (fs.existsSync(path.join(cwd, 'lerna.json'))) {
    tool = 'lerna';
  } else if (fs.existsSync(path.join(cwd, 'nx.json'))) {
    tool = 'nx';
  } else if (fs.existsSync(path.join(cwd, 'turbo.json'))) {
    tool = 'turbo';
  } else if (fs.existsSync(path.join(cwd, 'rush.json'))) {
    tool = 'rush';
  } else if (pkg.workspaces) {
    tool = 'npm'; // npm/yarn workspaces
  }

  if (!tool) return null;

  // Resolve workspace globs
  const workspaceGlobs = resolveWorkspaceGlobs(cwd, pkg, tool);
  const packages = scanWorkspacePackages(cwd, workspaceGlobs);

  return { tool, packages };
}

/**
 * Resolve workspace glob patterns from config files or package.json.
 * @param {string} cwd
 * @param {object} pkg
 * @param {string} tool
 * @returns {string[]} Array of glob patterns like ['packages/*', 'apps/*']
 */
function resolveWorkspaceGlobs(cwd, pkg, tool) {
  // package.json workspaces field (npm/yarn/pnpm all support this)
  if (pkg.workspaces) {
    const ws = Array.isArray(pkg.workspaces) ? pkg.workspaces : pkg.workspaces.packages || [];
    if (ws.length > 0) return ws;
  }

  // pnpm-workspace.yaml
  if (tool === 'pnpm') {
    for (const ext of ['yaml', 'yml']) {
      const wsPath = path.join(cwd, `pnpm-workspace.${ext}`);
      if (fs.existsSync(wsPath)) {
        try {
          const content = fs.readFileSync(wsPath, 'utf8');
          // Simple YAML parsing for packages list — avoids adding a YAML dependency
          const globs = [];
          let inPackages = false;
          for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (/^packages\s*:/.test(trimmed)) {
              inPackages = true;
              continue;
            }
            if (inPackages) {
              if (trimmed.startsWith('- ')) {
                globs.push(trimmed.slice(2).trim().replace(/['"]/g, ''));
              } else if (trimmed && !trimmed.startsWith('#')) {
                break; // next top-level key
              }
            }
          }
          if (globs.length > 0) return globs;
        } catch { /* ignore */ }
      }
    }
  }

  // lerna.json
  if (tool === 'lerna') {
    try {
      const lernaConfig = JSON.parse(fs.readFileSync(path.join(cwd, 'lerna.json'), 'utf8'));
      if (lernaConfig.packages && lernaConfig.packages.length > 0) return lernaConfig.packages;
    } catch { /* ignore */ }
  }

  // Default globs
  return ['packages/*', 'apps/*'];
}

/**
 * Expand workspace globs and scan each package for React Native / Expo deps.
 * @param {string} cwd
 * @param {string[]} globs - e.g. ['packages/*', 'apps/*']
 * @returns {Array<{name: string, path: string, hasReactNative: boolean, hasExpo: boolean}>}
 */
function scanWorkspacePackages(cwd, globs) {
  const packages = [];

  for (const glob of globs) {
    // Only support simple trailing /* globs (covers the vast majority of monorepos)
    const basePart = glob.replace(/\/?\*\*?$/, '');
    const baseDir = path.join(cwd, basePart);

    if (!fs.existsSync(baseDir)) continue;

    let entries;
    try {
      entries = fs.readdirSync(baseDir, { withFileTypes: true });
    } catch { continue; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const pkgJsonPath = path.join(baseDir, entry.name, 'package.json');
      if (!fs.existsSync(pkgJsonPath)) continue;

      try {
        const wsPkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
        const wsDeps = { ...wsPkg.dependencies, ...wsPkg.devDependencies };
        packages.push({
          name: wsPkg.name || entry.name,
          path: path.relative(cwd, path.join(baseDir, entry.name)),
          hasReactNative: !!wsDeps['react-native'],
          hasExpo: !!wsDeps['expo'],
        });
      } catch { /* ignore malformed package.json */ }
    }
  }

  return packages;
}

/**
 * Check if ios/ or android/ directories contain native code files.
 * Uses sentinel files for fast detection instead of recursive directory scan.
 */
function hasNativeCode(cwd) {
  // Check for sentinel files that indicate native code presence
  if (fs.existsSync(path.join(cwd, 'ios', 'Podfile'))) return true;
  if (fs.existsSync(path.join(cwd, 'android', 'build.gradle'))) return true;

  return false;
}

/**
 * Detect New Architecture usage.
 */
function detectNewArch(cwd, pkg) {
  // Check app.json
  const appJsonPath = path.join(cwd, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      const content = fs.readFileSync(appJsonPath, 'utf8');
      if (content.includes('newArchEnabled')) return true;
    } catch { /* ignore */ }
  }

  // Check package.json for reactNativeNewArchEnabled
  if (pkg.reactNativeNewArchEnabled) return true;

  // Check iOS native files for RCTAppDelegate
  const iosDir = path.join(cwd, 'ios');
  if (fs.existsSync(iosDir)) {
    try {
      const entries = fs.readdirSync(iosDir, { recursive: true });
      for (const entry of entries) {
        const ext = path.extname(String(entry));
        if (['.swift', '.m', '.mm'].includes(ext)) {
          const filePath = path.join(iosDir, String(entry));
          try {
            const content = fs.readFileSync(filePath, 'utf8');
            if (content.includes('RCTAppDelegate')) return true;
          } catch { /* ignore */ }
        }
      }
    } catch { /* ignore */ }
  }

  return false;
}

/**
 * Detect component style by scanning .tsx/.ts files.
 */
function detectComponentStyle(cwd) {
  const excludeDirs = new Set(['node_modules', 'ios', 'android', '.expo', '.git', 'build', 'dist']);
  const classPattern = /class\s+\w+\s+extends\s+(React\.)?(Component|PureComponent)/;
  const files = [];

  collectTsFiles(cwd, files, excludeDirs, 30);

  if (files.length === 0) return 'functional';

  let classCount = 0;
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (classPattern.test(content)) classCount++;
    } catch { /* ignore */ }
  }

  if (classCount === 0) return 'functional';
  if (classCount > files.length * 0.5) return 'class';
  return 'mixed';
}

/**
 * Recursively collect .tsx/.ts/.jsx/.js files up to a limit.
 */
function collectTsFiles(dir, files, excludeDirs, limit) {
  if (files.length >= limit) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch { return; }

  for (const entry of entries) {
    if (files.length >= limit) return;
    if (excludeDirs.has(entry.name)) continue;

    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectTsFiles(full, files, excludeDirs, limit);
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts') || entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
      files.push(full);
    }
  }
}

module.exports = { detectProject };
