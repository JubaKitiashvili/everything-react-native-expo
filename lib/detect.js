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
  result.hasMonorepo = !!(
    fs.existsSync(path.join(cwd, 'lerna.json')) ||
    fs.existsSync(path.join(cwd, 'pnpm-workspace.yaml')) ||
    fs.existsSync(path.join(cwd, 'pnpm-workspace.yml')) ||
    fs.existsSync(path.join(cwd, 'nx.json')) ||
    fs.existsSync(path.join(cwd, 'rush.json')) ||
    (pkg.workspaces)
  );

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
 * Check if ios/ or android/ directories contain native code files.
 */
function hasNativeCode(cwd) {
  const iosExts = ['.swift', '.m', '.mm'];
  const androidExts = ['.kt', '.java'];

  const iosDir = path.join(cwd, 'ios');
  if (fs.existsSync(iosDir)) {
    try {
      const entries = fs.readdirSync(iosDir, { recursive: true });
      if (entries.some(e => iosExts.some(ext => String(e).endsWith(ext)))) return true;
    } catch { /* ignore */ }
  }

  const androidDir = path.join(cwd, 'android');
  if (fs.existsSync(androidDir)) {
    try {
      const entries = fs.readdirSync(androidDir, { recursive: true });
      if (entries.some(e => androidExts.some(ext => String(e).endsWith(ext)))) return true;
    } catch { /* ignore */ }
  }

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
 * Recursively collect .tsx/.ts files up to a limit.
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
    } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
      files.push(full);
    }
  }
}

module.exports = { detectProject };
