// lib/audit.js — Project Audit Engine
// Performs deep analysis of React Native / Expo projects and generates actionable reports
'use strict';

const fs = require('fs');
const path = require('path');
const { detectProject } = require('./detect');

const SEVERITY = { critical: 'critical', warning: 'warning', info: 'info' };
const CATEGORY = {
  security: 'Security',
  performance: 'Performance',
  architecture: 'Architecture',
  testing: 'Testing',
  dependencies: 'Dependencies',
  reactNative: 'React Native',
  codeQuality: 'Code Quality',
  newArch: 'New Architecture',
  bundleSize: 'Bundle Size',
  sdkReadiness: 'SDK Upgrade Readiness',
  circularDeps: 'Circular Dependencies',
  permissions: 'Permissions',
  deepLinks: 'Deep Links',
  configConflicts: 'Config Conflicts',
  nativeModules: 'Native Modules',
};

// ── Collectors ──────────────────────────────────────────────────────────────

function collectFindings(cwd, detection) {
  const findings = [];
  const strengths = [];
  const pkg = readPkg(cwd);
  if (!pkg) return { findings, strengths, score: 0 };

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // ── Security ──
  checkSecurity(cwd, pkg, deps, findings, strengths);

  // ── Performance ──
  checkPerformance(cwd, deps, detection, findings, strengths);

  // ── Architecture ──
  checkArchitecture(cwd, deps, detection, findings, strengths);

  // ── Testing ──
  checkTesting(cwd, deps, detection, findings, strengths);

  // ── Dependencies ──
  checkDependencies(cwd, pkg, deps, findings, strengths);

  // ── React Native Specific ──
  checkReactNative(cwd, deps, detection, findings, strengths);

  // ── Code Quality ──
  checkCodeQuality(cwd, deps, detection, findings, strengths);

  // ── New Architecture Compatibility ──
  checkNewArchCompatibility(cwd, deps, findings, strengths);

  // ── Bundle Size Breakdown ──
  checkBundleSize(cwd, deps, findings, strengths);

  // ── Expo SDK Upgrade Readiness ──
  checkSdkUpgradeReadiness(cwd, deps, findings, strengths);

  // ── Circular Dependencies ──
  checkCircularDeps(cwd, findings, strengths);

  // ── Permissions Audit ──
  checkPermissions(cwd, deps, findings, strengths);

  // ── Deep Link Validation ──
  checkDeepLinks(cwd, deps, findings, strengths);

  // ── Expo Config Conflicts ──
  checkExpoConfigConflicts(cwd, findings, strengths);

  // ── Native Module Audit ──
  checkNativeModules(cwd, deps, findings, strengths);

  // Calculate score
  const score = calculateScore(findings, strengths);

  return { findings, strengths, score };
}

// ── Security Checks ─────────────────────────────────────────────────────────

function checkSecurity(cwd, pkg, deps, findings, strengths) {
  // .env in git
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(path.join(cwd, '.env'))) {
    if (fs.existsSync(gitignorePath)) {
      const gitignore = fs.readFileSync(gitignorePath, 'utf8');
      if (!gitignore.includes('.env')) {
        findings.push({
          severity: SEVERITY.critical,
          category: CATEGORY.security,
          title: '.env file not in .gitignore',
          detail: 'Environment variables may be committed to version control, exposing secrets.',
          fix: 'Add .env to .gitignore',
        });
      } else {
        strengths.push({ category: CATEGORY.security, title: '.env properly gitignored' });
      }
    }
  }

  // Hardcoded secrets in source
  const secretPatterns = [
    { pattern: /['"]sk[-_][a-zA-Z0-9]{20,}['"]/, name: 'API secret key' },
    { pattern: /['"]AIza[a-zA-Z0-9_-]{35}['"]/, name: 'Google API key' },
    { pattern: /['"]ghp_[a-zA-Z0-9]{36}['"]/, name: 'GitHub personal access token' },
    { pattern: /password\s*[:=]\s*['"][^'"]{8,}['"]/, name: 'Hardcoded password' },
  ];
  const sourceFiles = collectSourceFiles(cwd, 50);
  let secretsFound = 0;
  for (const file of sourceFiles) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      for (const sp of secretPatterns) {
        if (sp.pattern.test(content)) {
          secretsFound++;
          findings.push({
            severity: SEVERITY.critical,
            category: CATEGORY.security,
            title: `Possible ${sp.name} in source code`,
            detail: `Found in ${path.relative(cwd, file)}`,
            fix: 'Move to environment variables or secure storage',
          });
          break;
        }
      }
    } catch { /* skip unreadable */ }
  }
  if (secretsFound === 0 && sourceFiles.length > 0) {
    strengths.push({ category: CATEGORY.security, title: 'No hardcoded secrets detected in source' });
  }

  // Secure storage
  if (deps['expo-secure-store'] || deps['react-native-keychain']) {
    strengths.push({ category: CATEGORY.security, title: `Secure token storage (${deps['expo-secure-store'] ? 'expo-secure-store' : 'react-native-keychain'})` });
  } else if (deps['@react-native-async-storage/async-storage']) {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.security,
      title: 'AsyncStorage used without secure storage',
      detail: 'Sensitive data like auth tokens should use expo-secure-store or react-native-keychain.',
      fix: 'npm install expo-secure-store',
    });
  }

  // SSL pinning
  if (deps['react-native-ssl-pinning'] || deps['react-native-cert-pinner']) {
    strengths.push({ category: CATEGORY.security, title: 'SSL certificate pinning configured' });
  }
}

// ── Performance Checks ──────────────────────────────────────────────────────

function checkPerformance(cwd, deps, detection, findings, strengths) {
  // FlashList vs FlatList
  if (deps['@shopify/flash-list']) {
    strengths.push({ category: CATEGORY.performance, title: 'FlashList used for optimized lists' });
  } else {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.performance,
      title: 'Using FlatList instead of FlashList',
      detail: 'FlashList provides significantly better performance for large lists (100+ items).',
      fix: 'npm install @shopify/flash-list',
    });
  }

  // Reanimated
  if (deps['react-native-reanimated']) {
    strengths.push({ category: CATEGORY.performance, title: 'Reanimated available for UI thread animations' });
  }

  // Image optimization
  if (deps['expo-image']) {
    strengths.push({ category: CATEGORY.performance, title: 'expo-image for optimized image loading' });
  } else if (deps['react-native-fast-image']) {
    strengths.push({ category: CATEGORY.performance, title: 'FastImage for cached image loading' });
  } else {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.performance,
      title: 'No optimized image library detected',
      detail: 'expo-image or react-native-fast-image provide better caching and performance.',
      fix: 'npm install expo-image',
    });
  }

  // Hermes
  const appJsonPath = path.join(cwd, 'app.json');
  const appConfigPath = path.join(cwd, 'app.config.ts');
  let hermesEnabled = false;
  for (const p of [appJsonPath, appConfigPath]) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content.includes('jsEngine') && content.includes('hermes')) hermesEnabled = true;
      } catch { /* skip */ }
    }
  }
  // Expo SDK 50+ defaults to Hermes
  if (deps['expo']) {
    const expoVersion = parseInt((deps['expo'].match(/(\d+)/) || [])[1], 10) || 0;
    if (expoVersion >= 50) hermesEnabled = true;
  }
  if (hermesEnabled) {
    strengths.push({ category: CATEGORY.performance, title: 'Hermes JS engine enabled' });
  }

  // Large components
  const largeComponents = findLargeComponents(cwd, 250);
  if (largeComponents.length > 0) {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.performance,
      title: `${largeComponents.length} component(s) exceed 250 lines`,
      detail: largeComponents.map(c => `${path.relative(cwd, c.file)} (${c.lines} lines)`).join(', '),
      fix: 'Extract sub-components to improve readability and performance',
    });
  }
}

// ── Architecture Checks ─────────────────────────────────────────────────────

function checkArchitecture(cwd, deps, detection, findings, strengths) {
  // Error boundary
  const hasErrorBoundary = checkForPattern(cwd, /ErrorBoundary|error.?boundary/i, 20);
  if (hasErrorBoundary) {
    strengths.push({ category: CATEGORY.architecture, title: 'Error boundary implemented' });
  } else {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.architecture,
      title: 'No error boundary detected',
      detail: 'App crashes will show white screen instead of graceful error UI.',
      fix: 'Add an ErrorBoundary component wrapping your root navigator',
    });
  }

  // TypeScript strict
  if (detection.hasTypescript) {
    strengths.push({ category: CATEGORY.codeQuality, title: 'TypeScript enabled' });
    const tsconfigPath = path.join(cwd, 'tsconfig.json');
    if (fs.existsSync(tsconfigPath)) {
      try {
        const tsconfig = fs.readFileSync(tsconfigPath, 'utf8');
        if (tsconfig.includes('"strict"') && tsconfig.includes('true')) {
          strengths.push({ category: CATEGORY.codeQuality, title: 'TypeScript strict mode enabled' });
        } else {
          findings.push({
            severity: SEVERITY.info,
            category: CATEGORY.codeQuality,
            title: 'TypeScript strict mode not enabled',
            detail: 'Strict mode catches more bugs at compile time.',
            fix: 'Add "strict": true to tsconfig.json compilerOptions',
          });
        }
      } catch { /* skip */ }
    }
  } else {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.codeQuality,
      title: 'No TypeScript configuration found',
      detail: 'TypeScript significantly reduces runtime errors in React Native apps.',
      fix: 'npx expo install typescript @types/react',
    });
  }

  // State management
  if (detection.stack.state !== 'none') {
    strengths.push({ category: CATEGORY.architecture, title: `State management: ${detection.stack.state}` });
  }

  // Navigation
  if (detection.stack.navigation !== 'none') {
    strengths.push({ category: CATEGORY.architecture, title: `Navigation: ${detection.stack.navigation}` });
  }

  // Offline support
  if (deps['@react-native-community/netinfo']) {
    strengths.push({ category: CATEGORY.architecture, title: 'Network info available for offline detection' });
  }
}

// ── Testing Checks ──────────────────────────────────────────────────────────

function checkTesting(cwd, deps, detection, findings, strengths) {
  const hasTestingLib = !!deps['@testing-library/react-native'];
  const hasJest = !!deps['jest'] || !!deps['@jest/core'];
  const hasDetox = !!deps['detox'];

  if (hasTestingLib) {
    strengths.push({ category: CATEGORY.testing, title: 'React Native Testing Library configured' });
  }
  if (hasDetox) {
    strengths.push({ category: CATEGORY.testing, title: 'Detox E2E testing configured' });
  }

  // Check for actual test files
  const testFiles = findTestFiles(cwd);
  if (testFiles.length > 0) {
    strengths.push({ category: CATEGORY.testing, title: `${testFiles.length} test file(s) found` });
  } else {
    const severity = hasTestingLib || hasJest ? SEVERITY.warning : SEVERITY.critical;
    findings.push({
      severity,
      category: CATEGORY.testing,
      title: 'No test files detected',
      detail: hasTestingLib ? 'Testing library installed but no tests written.' : 'No testing framework or tests found.',
      fix: hasTestingLib
        ? 'Create __tests__/ directory and add component tests'
        : 'npx expo install jest @testing-library/react-native jest-expo',
    });
  }
}

// ── Dependencies Checks ─────────────────────────────────────────────────────

function checkDependencies(cwd, pkg, deps, findings, strengths) {
  // Check for duplicate/conflicting deps
  const conflictPairs = [
    ['@react-navigation/native', 'expo-router'],
    ['redux', '@reduxjs/toolkit'],
  ];
  for (const [a, b] of conflictPairs) {
    if (deps[a] && deps[b] && a === 'redux' && b === '@reduxjs/toolkit') {
      findings.push({
        severity: SEVERITY.info,
        category: CATEGORY.dependencies,
        title: `Both ${a} and ${b} installed`,
        detail: '@reduxjs/toolkit includes redux. Direct redux dependency may be unnecessary.',
        fix: `npm uninstall ${a}`,
      });
    }
  }

  // Count total deps
  const depCount = Object.keys(pkg.dependencies || {}).length;
  if (depCount > 50) {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.dependencies,
      title: `High dependency count (${depCount} packages)`,
      detail: 'Large dependency trees increase bundle size and security surface.',
      fix: 'Review dependencies for unused or replaceable packages',
    });
  } else {
    strengths.push({ category: CATEGORY.dependencies, title: `Reasonable dependency count (${depCount} packages)` });
  }

  // Lock file
  const hasLockFile = fs.existsSync(path.join(cwd, 'package-lock.json')) ||
    fs.existsSync(path.join(cwd, 'yarn.lock')) ||
    fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'));
  if (hasLockFile) {
    strengths.push({ category: CATEGORY.dependencies, title: 'Lock file present for reproducible builds' });
  } else {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.dependencies,
      title: 'No lock file found',
      detail: 'Without a lock file, builds may not be reproducible.',
      fix: 'Run npm install to generate package-lock.json',
    });
  }
}

// ── React Native Specific Checks ────────────────────────────────────────────

function checkReactNative(cwd, deps, detection, findings, strengths) {
  // New Architecture
  if (detection.hasNewArch) {
    strengths.push({ category: CATEGORY.reactNative, title: 'New Architecture enabled' });
  }

  // Expo SDK version freshness
  if (deps['expo']) {
    const expoVersion = parseInt((deps['expo'].match(/(\d+)/) || [])[1], 10) || 0;
    if (expoVersion >= 53) {
      strengths.push({ category: CATEGORY.reactNative, title: `Modern Expo SDK (${expoVersion})` });
    } else if (expoVersion > 0 && expoVersion < 50) {
      findings.push({
        severity: SEVERITY.warning,
        category: CATEGORY.reactNative,
        title: `Outdated Expo SDK (${expoVersion})`,
        detail: 'Expo SDK < 50 is missing significant performance and security improvements.',
        fix: 'npx expo install expo@latest',
      });
    }
  }

  // Gesture handler
  if (deps['react-native-gesture-handler']) {
    strengths.push({ category: CATEGORY.reactNative, title: 'Native gesture handling configured' });
  }

  // Safe area
  if (deps['react-native-safe-area-context']) {
    strengths.push({ category: CATEGORY.reactNative, title: 'Safe area handling configured' });
  }
}

// ── Code Quality Checks ─────────────────────────────────────────────────────

function checkCodeQuality(cwd, deps, detection, findings, strengths) {
  // ESLint
  if (deps['eslint'] || fs.existsSync(path.join(cwd, '.eslintrc.js')) || fs.existsSync(path.join(cwd, 'eslint.config.js'))) {
    strengths.push({ category: CATEGORY.codeQuality, title: 'ESLint configured' });
  } else {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.codeQuality,
      title: 'No ESLint configuration detected',
      detail: 'Linting helps maintain consistent code quality.',
      fix: 'npx expo lint',
    });
  }

  // Prettier
  if (deps['prettier'] || fs.existsSync(path.join(cwd, '.prettierrc')) || fs.existsSync(path.join(cwd, '.prettierrc.js'))) {
    strengths.push({ category: CATEGORY.codeQuality, title: 'Prettier configured' });
  }

  // Component style
  if (detection.componentStyle === 'functional') {
    strengths.push({ category: CATEGORY.codeQuality, title: 'Functional components (modern pattern)' });
  } else if (detection.componentStyle === 'class') {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.codeQuality,
      title: 'Class components detected',
      detail: 'Modern React Native favors functional components with hooks.',
      fix: 'Gradually migrate class components to functional components',
    });
  }
}

// ── New Architecture Compatibility Check ─────────────────────────────────

function checkNewArchCompatibility(cwd, deps, findings, strengths) {
  const KNOWN_INCOMPATIBLE = [
    'react-native-push-notification', // use @notifee/react-native
    'react-native-fbsdk-next', // limited support
    'react-native-code-push', // use expo-updates
    '@react-native-community/viewpager', // use react-native-pager-view
    'react-native-splash-screen', // use expo-splash-screen
  ];
  const KNOWN_COMPATIBLE = [
    'react-native-reanimated', 'react-native-gesture-handler', 'react-native-screens',
    'react-native-safe-area-context', 'react-native-svg', '@shopify/flash-list',
    'react-native-mmkv', '@gorhom/bottom-sheet', 'expo-image', 'expo-camera',
    'expo-location', 'react-native-skia',
  ];

  // Check if New Arch is enabled
  let newArchEnabled = false;
  const appJsonPath = path.join(cwd, 'app.json');
  const appConfigJsPath = path.join(cwd, 'app.config.js');
  const appConfigTsPath = path.join(cwd, 'app.config.ts');
  for (const p of [appJsonPath, appConfigJsPath, appConfigTsPath]) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf8');
        if (content.includes('newArchEnabled') && content.includes('true')) newArchEnabled = true;
      } catch { /* skip */ }
    }
  }

  // Expo SDK 51+ defaults to New Arch
  if (deps['expo']) {
    const expoVersion = parseInt((deps['expo'].match(/(\d+)/) || [])[1], 10) || 0;
    if (expoVersion >= 51) newArchEnabled = true;
  }

  const nativeDeps = Object.keys(deps).filter(d =>
    d.startsWith('react-native-') || d.startsWith('@react-native') ||
    d.startsWith('expo-') || d.startsWith('@shopify/') || d.startsWith('@gorhom/')
  );

  const incompatible = nativeDeps.filter(d => KNOWN_INCOMPATIBLE.includes(d));
  const compatible = nativeDeps.filter(d => KNOWN_COMPATIBLE.includes(d));
  const unknown = nativeDeps.filter(d => !KNOWN_INCOMPATIBLE.includes(d) && !KNOWN_COMPATIBLE.includes(d));

  if (newArchEnabled) {
    strengths.push({ category: CATEGORY.newArch, title: 'New Architecture enabled' });
  }

  if (incompatible.length > 0) {
    const altMap = {
      'react-native-push-notification': '@notifee/react-native',
      'react-native-fbsdk-next': 'check for updated SDK',
      'react-native-code-push': 'expo-updates',
      '@react-native-community/viewpager': 'react-native-pager-view',
      'react-native-splash-screen': 'expo-splash-screen',
    };
    for (const dep of incompatible) {
      findings.push({
        severity: newArchEnabled ? SEVERITY.critical : SEVERITY.warning,
        category: CATEGORY.newArch,
        title: `${dep} is incompatible with New Architecture`,
        detail: `This package does not support the New Architecture (Fabric/TurboModules).`,
        fix: altMap[dep] ? `Replace with ${altMap[dep]}` : 'Find a New Architecture compatible alternative',
      });
    }
  }

  if (compatible.length > 0) {
    strengths.push({ category: CATEGORY.newArch, title: `${compatible.length} native dep(s) confirmed New Arch compatible` });
  }

  if (unknown.length > 0) {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.newArch,
      title: `${unknown.length} native dep(s) with unknown New Arch compatibility`,
      detail: unknown.slice(0, 5).join(', ') + (unknown.length > 5 ? ` and ${unknown.length - 5} more` : ''),
      fix: 'Check each library\'s documentation for New Architecture support',
    });
  }
}

// ── Bundle Size Breakdown Check ──────────────────────────────────────────

function checkBundleSize(cwd, deps, findings, strengths) {
  const HEAVY_DEPS = {
    'moment': { size: '290KB', alt: 'dayjs (2KB)' },
    'lodash': { size: '70KB', alt: 'lodash-es or individual imports' },
    'firebase': { size: '200KB+', alt: '@react-native-firebase/* modular' },
    '@aws-sdk': { size: '150KB+', alt: 'specific service clients only' },
    'date-fns': { size: '75KB', alt: 'Use tree-shaking or dayjs' },
    'axios': { size: '13KB', alt: 'fetch API (built-in)' },
  };

  let heavyCount = 0;
  let estimatedOverhead = 0;

  for (const [dep, info] of Object.entries(HEAVY_DEPS)) {
    // Check exact match or prefix match (for scoped packages like @aws-sdk)
    const found = dep.startsWith('@')
      ? Object.keys(deps).some(d => d.startsWith(dep))
      : !!deps[dep];

    if (found) {
      heavyCount++;
      const sizeNum = parseInt(info.size, 10) || 0;
      estimatedOverhead += sizeNum;
      findings.push({
        severity: sizeNum >= 100 ? SEVERITY.warning : SEVERITY.info,
        category: CATEGORY.bundleSize,
        title: `${dep} adds ~${info.size} to bundle`,
        detail: `Consider lighter alternative: ${info.alt}`,
        fix: `Replace ${dep} with ${info.alt}`,
      });
    }
  }

  if (heavyCount === 0) {
    strengths.push({ category: CATEGORY.bundleSize, title: 'No known heavy dependencies detected' });
  }

  // Check metro.config.js for optimization settings
  const metroConfigPath = path.join(cwd, 'metro.config.js');
  if (fs.existsSync(metroConfigPath)) {
    try {
      const content = fs.readFileSync(metroConfigPath, 'utf8');
      if (content.includes('minify') || content.includes('transformer')) {
        strengths.push({ category: CATEGORY.bundleSize, title: 'Metro config has custom transformer/minifier settings' });
      }
    } catch { /* skip */ }
  }

  // Estimate total bundle category
  if (estimatedOverhead > 300) {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.bundleSize,
      title: `Estimated ~${estimatedOverhead}KB overhead from heavy deps`,
      detail: 'Total overhead from heavy dependencies may push JS bundle over 1.5MB target.',
      fix: 'Review and replace heavy dependencies with lighter alternatives',
    });
  }
}

// ── Expo SDK Upgrade Readiness Check ─────────────────────────────────────

function checkSdkUpgradeReadiness(cwd, deps, findings, strengths) {
  const DEPRECATED_PACKAGES = {
    'expo-app-loading': 'expo-splash-screen',
    'expo-random': 'expo-crypto',
    'expo-error-recovery': 'built-in error boundary',
    '@react-native-community/async-storage': '@react-native-async-storage/async-storage',
    'react-native-gesture-handler': null, // check version, v1 deprecated
  };

  let blockerCount = 0;

  for (const [dep, replacement] of Object.entries(DEPRECATED_PACKAGES)) {
    if (!deps[dep]) continue;

    // Special case: react-native-gesture-handler v1 check
    if (dep === 'react-native-gesture-handler') {
      const version = deps[dep];
      const major = parseInt((version.match(/(\d+)/) || [])[1], 10) || 0;
      if (major >= 2) {
        strengths.push({ category: CATEGORY.sdkReadiness, title: 'react-native-gesture-handler v2+ (modern)' });
        continue;
      }
      findings.push({
        severity: SEVERITY.warning,
        category: CATEGORY.sdkReadiness,
        title: 'react-native-gesture-handler v1 is deprecated',
        detail: 'Version 1.x is no longer maintained and may block SDK upgrades.',
        fix: 'npm install react-native-gesture-handler@latest',
      });
      blockerCount++;
      continue;
    }

    blockerCount++;
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.sdkReadiness,
      title: `${dep} is deprecated`,
      detail: `This package is deprecated and may block Expo SDK upgrades.`,
      fix: replacement ? `Replace with ${replacement}` : `Remove ${dep}`,
    });
  }

  // Check current SDK version freshness
  if (deps['expo']) {
    const expoVersion = parseInt((deps['expo'].match(/(\d+)/) || [])[1], 10) || 0;
    const latestSdk = 53; // Latest known SDK
    if (expoVersion > 0 && expoVersion < latestSdk - 1) {
      findings.push({
        severity: SEVERITY.info,
        category: CATEGORY.sdkReadiness,
        title: `Expo SDK ${expoVersion} is ${latestSdk - expoVersion} version(s) behind latest (SDK ${latestSdk})`,
        detail: 'Running behind latest SDK means missing performance, security, and feature improvements.',
        fix: 'npx expo install expo@latest --fix',
      });
    } else if (expoVersion >= latestSdk) {
      strengths.push({ category: CATEGORY.sdkReadiness, title: `Running latest Expo SDK (${expoVersion})` });
    }
  }

  if (blockerCount === 0) {
    strengths.push({ category: CATEGORY.sdkReadiness, title: 'No deprecated packages blocking SDK upgrade' });
  } else {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.sdkReadiness,
      title: `${blockerCount} deprecated package(s) may block SDK upgrade`,
      detail: 'Replace deprecated packages before attempting an Expo SDK upgrade.',
      fix: 'npx expo install --fix',
    });
  }
}

// ── Circular Dependency Detection Check ──────────────────────────────────

function checkCircularDeps(cwd, findings, strengths) {
  const srcDir = path.join(cwd, 'src');
  const appDir = path.join(cwd, 'app');
  const files = [];

  const excludeDirs = new Set(['node_modules', 'ios', 'android', '.expo', '.git', 'build', 'dist', '__tests__']);
  const extPattern = /\.(tsx?|jsx?)$/;

  if (fs.existsSync(srcDir)) _collectFiles(srcDir, files, excludeDirs, 200, extPattern);
  if (fs.existsSync(appDir) && files.length < 200) _collectFiles(appDir, files, excludeDirs, 200, extPattern);

  if (files.length === 0) return;

  // Build adjacency list from import/require statements
  const importPattern = /(?:import\s+.*?\s+from\s+['"]([^'"]+)['"]|require\s*\(\s*['"]([^'"]+)['"]\s*\))/g;
  const graph = new Map();
  const fileIndex = new Map();

  // Index files by their resolved paths (without extension)
  for (const file of files) {
    const rel = path.relative(cwd, file);
    fileIndex.set(rel, file);
    // Also index without extension
    const noExt = rel.replace(/\.(tsx?|jsx?)$/, '');
    fileIndex.set(noExt, file);
  }

  for (const file of files) {
    const edges = [];
    try {
      const content = fs.readFileSync(file, 'utf8');
      let match;
      importPattern.lastIndex = 0;
      while ((match = importPattern.exec(content)) !== null) {
        const importPath = match[1] || match[2];
        // Only check relative imports
        if (!importPath.startsWith('.')) continue;
        const resolved = path.resolve(path.dirname(file), importPath);
        const rel = path.relative(cwd, resolved);
        // Try to find the actual file
        const target = fileIndex.get(rel) || fileIndex.get(rel + '/index');
        if (target) edges.push(target);
      }
    } catch { /* skip unreadable */ }
    graph.set(file, edges);
  }

  // DFS cycle detection
  const cycles = [];
  const visited = new Set();
  const inStack = new Set();
  const stackPath = [];

  function dfs(node) {
    if (cycles.length >= 5) return; // Limit to 5 cycles
    if (inStack.has(node)) {
      // Found a cycle
      const cycleStart = stackPath.indexOf(node);
      if (cycleStart !== -1) {
        const cycle = stackPath.slice(cycleStart).map(f => path.relative(cwd, f));
        cycles.push(cycle);
      }
      return;
    }
    if (visited.has(node)) return;

    visited.add(node);
    inStack.add(node);
    stackPath.push(node);

    for (const neighbor of (graph.get(node) || [])) {
      dfs(neighbor);
      if (cycles.length >= 5) return;
    }

    inStack.delete(node);
    stackPath.pop();
  }

  for (const file of files) {
    if (!visited.has(file)) dfs(file);
    if (cycles.length >= 5) break;
  }

  if (cycles.length > 0) {
    for (const cycle of cycles) {
      findings.push({
        severity: SEVERITY.warning,
        category: CATEGORY.circularDeps,
        title: `Circular dependency detected (${cycle.length} files)`,
        detail: cycle.join(' -> ') + ' -> ' + cycle[0],
        fix: 'Refactor to break the dependency cycle (extract shared code to a separate module)',
      });
    }
  } else {
    strengths.push({ category: CATEGORY.circularDeps, title: `No circular dependencies detected (${files.length} files scanned)` });
  }
}

// ── Permissions Audit ─────────────────────────────────────────────────────

function checkPermissions(cwd, deps, findings, strengths) {
  const PERMISSION_APIS = {
    camera: { packages: ['expo-camera', 'react-native-camera', 'expo-image-picker'], iosKey: 'NSCameraUsageDescription', androidPerm: 'android.permission.CAMERA' },
    location: { packages: ['expo-location', 'react-native-geolocation-service'], iosKey: 'NSLocationWhenInUseUsageDescription', androidPerm: 'android.permission.ACCESS_FINE_LOCATION' },
    microphone: { packages: ['expo-av', 'expo-audio', 'react-native-audio-recorder'], iosKey: 'NSMicrophoneUsageDescription', androidPerm: 'android.permission.RECORD_AUDIO' },
    photos: { packages: ['expo-media-library', 'expo-image-picker', '@react-native-camera-roll/camera-roll'], iosKey: 'NSPhotoLibraryUsageDescription', androidPerm: 'android.permission.READ_MEDIA_IMAGES' },
    contacts: { packages: ['expo-contacts'], iosKey: 'NSContactsUsageDescription', androidPerm: 'android.permission.READ_CONTACTS' },
    notifications: { packages: ['expo-notifications', 'react-native-push-notification', '@notifee/react-native'], iosKey: null, androidPerm: null },
    calendar: { packages: ['expo-calendar'], iosKey: 'NSCalendarsUsageDescription', androidPerm: 'android.permission.READ_CALENDAR' },
    bluetooth: { packages: ['react-native-ble-plx', 'expo-bluetooth'], iosKey: 'NSBluetoothAlwaysUsageDescription', androidPerm: 'android.permission.BLUETOOTH_CONNECT' },
  };

  // Parse app.json for declared permissions
  let appConfig = null;
  const appJsonPath = path.join(cwd, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    } catch { /* skip */ }
  }

  const expo = appConfig?.expo || appConfig || {};
  const infoPlist = expo?.ios?.infoPlist || {};
  const androidPermissions = expo?.android?.permissions || [];

  // Collect declared iOS keys and Android permissions
  const declaredIosKeys = new Set(Object.keys(infoPlist));
  const declaredAndroidPerms = new Set(androidPermissions);

  let missingCount = 0;
  let installedPermCount = 0;
  const usedIosKeys = new Set();
  const usedAndroidPerms = new Set();

  for (const [name, api] of Object.entries(PERMISSION_APIS)) {
    const installed = api.packages.filter(p => !!deps[p]);
    if (installed.length === 0) continue;

    installedPermCount++;

    // Track which declared permissions are actually used
    if (api.iosKey) usedIosKeys.add(api.iosKey);
    if (api.androidPerm) usedAndroidPerms.add(api.androidPerm);

    // Check iOS plist declaration
    if (api.iosKey && appConfig && !declaredIosKeys.has(api.iosKey)) {
      missingCount++;
      findings.push({
        severity: SEVERITY.critical,
        category: CATEGORY.permissions,
        title: `Missing iOS permission: ${api.iosKey}`,
        detail: `${installed.join(', ')} requires ${name} permission but ${api.iosKey} is not declared in app.json ios.infoPlist.`,
        fix: `Add "${api.iosKey}" to app.json > expo > ios > infoPlist`,
      });
    }

    // Check Android permission declaration
    if (api.androidPerm && appConfig && androidPermissions.length > 0 && !declaredAndroidPerms.has(api.androidPerm)) {
      missingCount++;
      findings.push({
        severity: SEVERITY.critical,
        category: CATEGORY.permissions,
        title: `Missing Android permission: ${api.androidPerm}`,
        detail: `${installed.join(', ')} requires ${name} permission but ${api.androidPerm} is not declared in app.json android.permissions.`,
        fix: `Add "${api.androidPerm}" to app.json > expo > android > permissions`,
      });
    }
  }

  // Check for unused declared permissions
  if (appConfig) {
    for (const key of declaredIosKeys) {
      if (key.startsWith('NS') && key.endsWith('UsageDescription') && !usedIosKeys.has(key)) {
        findings.push({
          severity: SEVERITY.warning,
          category: CATEGORY.permissions,
          title: `Unused iOS permission declared: ${key}`,
          detail: 'This permission is declared in infoPlist but no matching package was found.',
          fix: `Remove "${key}" from app.json if not needed (may cause App Store rejection)`,
        });
      }
    }
    for (const perm of androidPermissions) {
      if (!usedAndroidPerms.has(perm)) {
        findings.push({
          severity: SEVERITY.warning,
          category: CATEGORY.permissions,
          title: `Unused Android permission declared: ${perm}`,
          detail: 'This permission is declared but no matching package was found.',
          fix: `Remove "${perm}" from app.json android.permissions if not needed`,
        });
      }
    }
  }

  if (missingCount === 0 && installedPermCount > 0) {
    strengths.push({ category: CATEGORY.permissions, title: `${installedPermCount} permission-requiring package(s) properly configured` });
  } else if (installedPermCount === 0) {
    strengths.push({ category: CATEGORY.permissions, title: 'No permission-requiring packages detected' });
  }
}

// ── Deep Link Validation ──────────────────────────────────────────────────

function checkDeepLinks(cwd, deps, findings, strengths) {
  // Check if scheme is defined in app.json
  let appConfig = null;
  const appJsonPath = path.join(cwd, 'app.json');
  if (fs.existsSync(appJsonPath)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
    } catch { /* skip */ }
  }

  const expo = appConfig?.expo || appConfig || {};
  const hasScheme = !!expo.scheme;

  if (hasScheme) {
    strengths.push({ category: CATEGORY.deepLinks, title: `Deep link scheme configured: "${expo.scheme}"` });
  } else {
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.deepLinks,
      title: 'No deep link scheme configured',
      detail: 'Without a scheme, your app cannot handle deep links or universal links.',
      fix: 'Add "scheme": "myapp" to app.json > expo',
    });
  }

  // Check if expo-linking is installed
  if (deps['expo-linking']) {
    strengths.push({ category: CATEGORY.deepLinks, title: 'expo-linking available for deep link handling' });
  }

  // Scan app/ directory for Expo Router routes
  const appDir = path.join(cwd, 'app');
  if (!fs.existsSync(appDir)) return;

  const routeFiles = [];
  const excludeDirs = new Set(['node_modules', '.expo', '.git', '__tests__', 'components']);
  _collectFiles(appDir, routeFiles, excludeDirs, 200, /\.(tsx?|jsx?)$/);

  if (routeFiles.length === 0) return;

  // Filter to actual route files (not _layout, not +not-found, etc.)
  const routes = routeFiles.filter(f => {
    const name = path.basename(f);
    return !name.startsWith('_') && !name.startsWith('+');
  });
  const dynamicRoutes = routeFiles.filter(f => path.basename(f).includes('['));

  strengths.push({ category: CATEGORY.deepLinks, title: `${routes.length} route(s) found in app/ directory` });

  if (dynamicRoutes.length > 0) {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.deepLinks,
      title: `${dynamicRoutes.length} dynamic route(s) detected`,
      detail: dynamicRoutes.map(f => path.relative(cwd, f)).join(', '),
      fix: 'Ensure dynamic route parameters are validated (e.g., with Zod or manual checks)',
    });

    // Check if dynamic route files have param validation
    const validationPatterns = /(?:useLocalSearchParams|zod|\.parse\(|parseInt|Number\(|isNaN|typeof\s+.*===|validateParam)/;
    let unvalidated = 0;
    for (const file of dynamicRoutes) {
      try {
        const content = fs.readFileSync(file, 'utf8');
        if (!validationPatterns.test(content)) {
          unvalidated++;
        }
      } catch { /* skip */ }
    }
    if (unvalidated > 0) {
      findings.push({
        severity: SEVERITY.warning,
        category: CATEGORY.deepLinks,
        title: `${unvalidated} dynamic route(s) without parameter validation`,
        detail: 'Dynamic routes accessible via deep links should validate parameters to prevent crashes or injection.',
        fix: 'Add parameter validation using useLocalSearchParams with type checks or Zod schemas',
      });
    }
  }
}

// ── Expo Config Conflicts ─────────────────────────────────────────────────

function checkExpoConfigConflicts(cwd, findings, strengths) {
  const PLUGIN_CONFLICTS = [
    ['expo-camera', 'react-native-camera'],
    ['expo-notifications', 'react-native-push-notification'],
    ['expo-location', 'react-native-geolocation-service'],
  ];

  // Read app.json or app.config.js/ts
  let appConfig = null;
  let configSource = null;
  const appJsonPath = path.join(cwd, 'app.json');
  const appConfigJsPath = path.join(cwd, 'app.config.js');
  const appConfigTsPath = path.join(cwd, 'app.config.ts');

  if (fs.existsSync(appJsonPath)) {
    try {
      appConfig = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      configSource = 'app.json';
    } catch { /* skip */ }
  }

  // For JS/TS configs, read raw content for analysis
  let configContent = '';
  for (const p of [appConfigJsPath, appConfigTsPath]) {
    if (fs.existsSync(p)) {
      try {
        configContent = fs.readFileSync(p, 'utf8');
        if (!configSource) configSource = path.basename(p);
      } catch { /* skip */ }
    }
  }

  if (!appConfig && !configContent) return;

  const expo = appConfig?.expo || appConfig || {};
  const plugins = expo.plugins || [];

  // Extract plugin names (plugins can be strings or [string, config] arrays)
  const pluginNames = plugins.map(p => Array.isArray(p) ? p[0] : (typeof p === 'string' ? p : null)).filter(Boolean);

  // Check for duplicate plugins
  const seen = new Map();
  for (const name of pluginNames) {
    if (seen.has(name)) {
      findings.push({
        severity: SEVERITY.warning,
        category: CATEGORY.configConflicts,
        title: `Duplicate plugin: ${name}`,
        detail: `"${name}" appears multiple times in the plugins array. This can cause build conflicts.`,
        fix: `Remove duplicate "${name}" from ${configSource || 'config'} plugins`,
      });
    } else {
      seen.set(name, true);
    }
  }

  // Check known conflict pairs
  const allPlugins = new Set(pluginNames);
  for (const [a, b] of PLUGIN_CONFLICTS) {
    if (allPlugins.has(a) && allPlugins.has(b)) {
      findings.push({
        severity: SEVERITY.critical,
        category: CATEGORY.configConflicts,
        title: `Plugin conflict: ${a} + ${b}`,
        detail: 'Both plugins modify the same native code. This will cause build failures or runtime crashes.',
        fix: `Remove one of ${a} or ${b} from plugins`,
      });
    }
  }

  // Check for newArchEnabled + known incompatible plugins
  let newArchEnabled = false;
  if (expo.newArchEnabled === true) newArchEnabled = true;
  if (configContent.includes('newArchEnabled') && configContent.includes('true')) newArchEnabled = true;

  const INCOMPATIBLE_WITH_NEW_ARCH = ['react-native-push-notification', 'react-native-camera', 'react-native-splash-screen'];
  if (newArchEnabled) {
    for (const plugin of pluginNames) {
      if (INCOMPATIBLE_WITH_NEW_ARCH.includes(plugin)) {
        findings.push({
          severity: SEVERITY.critical,
          category: CATEGORY.configConflicts,
          title: `newArchEnabled conflicts with plugin: ${plugin}`,
          detail: `${plugin} is not compatible with the New Architecture but newArchEnabled is true.`,
          fix: `Replace ${plugin} with a New Architecture-compatible alternative or disable newArchEnabled`,
        });
      }
    }
  }

  if (findings.filter(f => f.category === CATEGORY.configConflicts).length === 0) {
    strengths.push({ category: CATEGORY.configConflicts, title: `No config conflicts detected${pluginNames.length > 0 ? ` (${pluginNames.length} plugins)` : ''}` });
  }
}

// ── Native Module Audit ───────────────────────────────────────────────────

function checkNativeModules(cwd, deps, findings, strengths) {
  const KNOWN_NATIVE = [
    'react-native-reanimated', 'react-native-gesture-handler', 'react-native-screens',
    'react-native-svg', 'react-native-safe-area-context', '@shopify/flash-list',
    'react-native-mmkv', 'expo-camera', 'expo-location', 'expo-notifications',
    'expo-av', 'expo-image', 'react-native-maps', '@sentry/react-native',
    'react-native-ble-plx', 'expo-local-authentication',
    'expo-secure-store', 'expo-file-system', 'expo-media-library',
  ];

  const DEPRECATED_NATIVE = {
    '@react-native-community/async-storage': '@react-native-async-storage/async-storage',
    'react-native-camera': 'expo-camera',
    'react-native-fast-image': 'expo-image',
    'react-native-image-picker': 'expo-image-picker',
    'react-native-push-notification': '@notifee/react-native or expo-notifications',
    'react-native-splash-screen': 'expo-splash-screen',
  };

  // Count installed native modules
  const installedNative = KNOWN_NATIVE.filter(m => {
    // Handle scoped wildcard patterns like @react-native-firebase/*
    if (m.endsWith('/*')) {
      const prefix = m.slice(0, -2);
      return Object.keys(deps).some(d => d.startsWith(prefix));
    }
    return !!deps[m];
  });

  if (installedNative.length > 0) {
    strengths.push({ category: CATEGORY.nativeModules, title: `${installedNative.length} known native module(s) installed` });
  }

  // Check deprecated modules
  let deprecatedCount = 0;
  for (const [dep, replacement] of Object.entries(DEPRECATED_NATIVE)) {
    if (!deps[dep]) continue;
    deprecatedCount++;
    findings.push({
      severity: SEVERITY.warning,
      category: CATEGORY.nativeModules,
      title: `Deprecated native module: ${dep}`,
      detail: `${dep} is deprecated and may not receive updates or New Architecture support.`,
      fix: `Replace with ${replacement}`,
    });
  }

  if (deprecatedCount === 0) {
    strengths.push({ category: CATEGORY.nativeModules, title: 'No deprecated native modules detected' });
  }

  // Scan node_modules for unlisted native modules (top-level only, limit 50)
  const nodeModulesDir = path.join(cwd, 'node_modules');
  if (!fs.existsSync(nodeModulesDir)) return;

  const unlistedNative = [];
  let scanned = 0;

  try {
    const entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true });
    for (const entry of entries) {
      if (scanned >= 50) break;
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;

      // Handle scoped packages
      if (entry.name.startsWith('@')) {
        const scopedDir = path.join(nodeModulesDir, entry.name);
        try {
          const scopedEntries = fs.readdirSync(scopedDir, { withFileTypes: true });
          for (const se of scopedEntries) {
            if (scanned >= 50) break;
            if (!se.isDirectory()) continue;
            const fullName = `${entry.name}/${se.name}`;
            if (deps[fullName] && !KNOWN_NATIVE.includes(fullName)) {
              const pkgDir = path.join(scopedDir, se.name);
              if (hasNativeCode(pkgDir)) {
                unlistedNative.push(fullName);
              }
            }
            scanned++;
          }
        } catch { /* skip */ }
        continue;
      }

      if (deps[entry.name] && !KNOWN_NATIVE.includes(entry.name)) {
        const pkgDir = path.join(nodeModulesDir, entry.name);
        if (hasNativeCode(pkgDir)) {
          unlistedNative.push(entry.name);
        }
      }
      scanned++;
    }
  } catch { /* skip */ }

  if (unlistedNative.length > 0) {
    findings.push({
      severity: SEVERITY.info,
      category: CATEGORY.nativeModules,
      title: `${unlistedNative.length} additional native module(s) found`,
      detail: unlistedNative.slice(0, 10).join(', ') + (unlistedNative.length > 10 ? ` and ${unlistedNative.length - 10} more` : ''),
      fix: 'Review native modules for compatibility with your build setup (EAS Build, prebuild, etc.)',
    });
  }
}

function hasNativeCode(pkgDir) {
  try {
    const iosDir = path.join(pkgDir, 'ios');
    const androidDir = path.join(pkgDir, 'android');
    return fs.existsSync(iosDir) || fs.existsSync(androidDir);
  } catch {
    return false;
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function readPkg(cwd) {
  try {
    return JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  } catch {
    return null;
  }
}

function collectSourceFiles(cwd, limit) {
  const excludeDirs = new Set(['node_modules', 'ios', 'android', '.expo', '.git', 'build', 'dist', '.next', '__tests__']);
  const files = [];
  _collectFiles(cwd, files, excludeDirs, limit, /\.(tsx?|jsx?|mjs)$/);
  return files;
}

function _collectFiles(dir, files, excludeDirs, limit, extPattern) {
  if (files.length >= limit) return;
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (files.length >= limit) return;
    if (entry.name.startsWith('.') || excludeDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      _collectFiles(full, files, excludeDirs, limit, extPattern);
    } else if (extPattern.test(entry.name)) {
      files.push(full);
    }
  }
}

function findLargeComponents(cwd, maxLines) {
  const files = collectSourceFiles(cwd, 100);
  const large = [];
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n').length;
      // Only count component files (contain JSX return)
      if (lines > maxLines && /return\s*\([\s\S]*</.test(content)) {
        large.push({ file, lines });
      }
    } catch { /* skip */ }
  }
  return large.sort((a, b) => b.lines - a.lines).slice(0, 10);
}

function findTestFiles(cwd) {
  const files = [];
  const testDirs = ['__tests__', 'tests', 'test', 'spec'];
  for (const dir of testDirs) {
    const full = path.join(cwd, dir);
    if (fs.existsSync(full)) {
      _collectFiles(full, files, new Set(['node_modules']), 50, /\.(test|spec)\.(tsx?|jsx?|mjs)$/);
    }
  }
  // Also check for .test. files in src/
  const srcDir = path.join(cwd, 'src');
  if (fs.existsSync(srcDir)) {
    _collectFiles(srcDir, files, new Set(['node_modules']), 50, /\.(test|spec)\.(tsx?|jsx?|mjs)$/);
  }
  return files;
}

function checkForPattern(cwd, pattern, maxFiles) {
  const files = collectSourceFiles(cwd, maxFiles);
  for (const file of files) {
    try {
      const content = fs.readFileSync(file, 'utf8');
      if (pattern.test(content)) return true;
    } catch { /* skip */ }
  }
  return false;
}

function calculateScore(findings, strengths) {
  let score = 100;
  for (const f of findings) {
    if (f.severity === SEVERITY.critical) score -= 15;
    else if (f.severity === SEVERITY.warning) score -= 5;
    else score -= 2;
  }
  // Bonus for strengths (up to +10)
  score += Math.min(strengths.length, 10);
  return Math.max(0, Math.min(100, score));
}

// ── Report Generation ───────────────────────────────────────────────────────

function generateMarkdownReport(cwd, detection, findings, strengths, score) {
  const pkg = readPkg(cwd);
  const name = pkg?.name || path.basename(cwd);
  const date = new Date().toISOString().slice(0, 10);

  const critical = findings.filter(f => f.severity === SEVERITY.critical);
  const warnings = findings.filter(f => f.severity === SEVERITY.warning);
  const info = findings.filter(f => f.severity === SEVERITY.info);

  const scoreEmoji = score >= 80 ? 'A' : score >= 60 ? 'B' : score >= 40 ? 'C' : 'D';

  let md = `# ERNE Project Audit — ${name}\n\n`;
  md += `**Score: ${score}/100 (${scoreEmoji})** | Date: ${date}\n\n`;
  md += `---\n\n`;

  // Strengths
  if (strengths.length > 0) {
    md += `## Strengths (${strengths.length})\n\n`;
    for (const s of strengths) {
      md += `- ${s.title}\n`;
    }
    md += '\n';
  }

  // Critical
  if (critical.length > 0) {
    md += `## Critical Issues (${critical.length})\n\n`;
    for (const f of critical) {
      md += `### ${f.title}\n\n`;
      md += `${f.detail}\n\n`;
      md += `**Fix:** \`${f.fix}\`\n\n`;
    }
  }

  // Warnings
  if (warnings.length > 0) {
    md += `## Warnings (${warnings.length})\n\n`;
    for (const f of warnings) {
      md += `- **${f.title}** — ${f.detail}`;
      if (f.fix) md += ` Fix: \`${f.fix}\``;
      md += '\n';
    }
    md += '\n';
  }

  // Info
  if (info.length > 0) {
    md += `## Suggestions (${info.length})\n\n`;
    for (const f of info) {
      md += `- ${f.title} — ${f.detail}`;
      if (f.fix) md += ` Fix: \`${f.fix}\``;
      md += '\n';
    }
    md += '\n';
  }

  // Stack Summary
  md += `## Detected Stack\n\n`;
  md += `| Component | Value |\n|-----------|-------|\n`;
  const s = detection.stack;
  md += `| Framework | ${detection.framework} |\n`;
  md += `| State | ${s.state} |\n`;
  md += `| Navigation | ${s.navigation} |\n`;
  md += `| Styling | ${s.styling} |\n`;
  md += `| Lists | ${s.lists} |\n`;
  md += `| Testing | ${s.testing} |\n`;
  md += `| TypeScript | ${detection.hasTypescript ? 'Yes' : 'No'} |\n`;
  md += `| New Arch | ${detection.hasNewArch ? 'Yes' : 'No'} |\n`;

  md += `\n---\n*Generated by [ERNE](https://erne.dev) v${readPkg(path.resolve(__dirname, '..')).version}*\n`;

  return md;
}

function generateJsonReport(cwd, detection, findings, strengths, score) {
  return {
    version: 1,
    project: readPkg(cwd)?.name || path.basename(cwd),
    date: new Date().toISOString(),
    score,
    strengths: strengths.map(s => ({ category: s.category, title: s.title })),
    findings: findings.map(f => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      detail: f.detail,
      fix: f.fix,
    })),
    stack: detection.stack,
    meta: {
      framework: detection.framework,
      typescript: detection.hasTypescript,
      newArch: detection.hasNewArch,
      monorepo: detection.hasMonorepo,
    },
  };
}

// ── Main Entry ──────────────────────────────────────────────────────────────

function runAudit(cwd) {
  const detection = detectProject(cwd);
  const { findings, strengths, score } = collectFindings(cwd, detection);

  const mdReport = generateMarkdownReport(cwd, detection, findings, strengths, score);
  const jsonReport = generateJsonReport(cwd, detection, findings, strengths, score);

  // Write reports to .erne/
  const erneDir = path.join(cwd, '.erne');
  if (!fs.existsSync(erneDir)) fs.mkdirSync(erneDir, { recursive: true });
  fs.writeFileSync(path.join(erneDir, 'audit.md'), mdReport);
  fs.writeFileSync(path.join(erneDir, 'audit.json'), JSON.stringify(jsonReport, null, 2));

  return { detection, findings, strengths, score, mdReport, jsonReport };
}

module.exports = { runAudit, collectFindings, generateMarkdownReport, generateJsonReport };
