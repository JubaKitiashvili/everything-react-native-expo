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
