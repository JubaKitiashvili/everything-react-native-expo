# ERNE Adaptive Init Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace ERNE's static init with deep stack detection and variant-based content generation so every project gets perfectly matched configuration.

**Architecture:** Extract detection logic into `lib/detect.js`, variant selection into `lib/generate.js`, CLAUDE.md handling into `lib/claude-md.js`. Create variant template files under `rules/variants/` and `agents/variants/`. Slim down `lib/init.js` to an orchestrator.

**Tech Stack:** Node.js (no external deps), Node built-in test runner (`node --test`), fs/path for file ops.

---

## Chunk 1: Deep Stack Detection

### Task 1: Create `lib/detect.js` with tests

**Files:**
- Create: `lib/detect.js`
- Create: `tests/detect.test.js`
- Delete: `tests/detection.test.js` (old detection tests — replaced by new comprehensive tests)

- [ ] **Step 1: Write failing tests for framework detection**

```javascript
// tests/detect.test.js
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { detectProject } = require('../lib/detect');

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function cleanupDir(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

describe('detectProject', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanupDir(tmpDir); });

  describe('framework detection', () => {
    it('detects expo-managed (expo in deps, no ios/android)', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'app.json': JSON.stringify({ expo: { name: 'test' } }),
      });
      const result = detectProject(tmpDir);
      assert.equal(result.framework, 'expo-managed');
      assert.equal(result.isRNProject, true);
    });

    it('detects expo-bare (expo in deps + ios/ with native code)', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'app.json': '{}',
        'ios/MyApp/AppDelegate.swift': 'import UIKit',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.framework, 'expo-bare');
    });

    it('detects bare-rn (react-native, no expo)', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.77.3' } },
        'ios/MyApp/AppDelegate.m': '#import <UIKit/UIKit.h>',
        'android/app/src/main/java/com/app/Main.java': 'package com.app;',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.framework, 'bare-rn');
      assert.equal(result.isRNProject, true);
    });

    it('does NOT treat app.json without expo dep as expo', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.77.3' } },
        'app.json': '{}',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.framework, 'bare-rn');
    });

    it('returns unknown for non-RN project', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'express': '4.0.0' } },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.framework, 'unknown');
      assert.equal(result.isRNProject, false);
    });

    it('handles missing package.json gracefully', () => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
      const result = detectProject(tmpDir);
      assert.equal(result.isRNProject, false);
      assert.equal(result.framework, 'unknown');
    });

    it('handles corrupt package.json gracefully', () => {
      tmpDir = createTempProject({
        'package.json': 'this is not valid json {{{',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.isRNProject, false);
      assert.equal(result.framework, 'unknown');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/detect.test.js`
Expected: FAIL — `Cannot find module '../lib/detect'`

- [ ] **Step 3: Implement framework detection**

```javascript
// lib/detect.js
'use strict';

const fs = require('fs');
const path = require('path');

function detectProject(cwd) {
  const result = {
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

  // Read package.json
  const pkg = readPackageJson(cwd);
  if (!pkg) return result;

  const deps = { ...pkg.dependencies, ...pkg.devDependencies };

  // Framework detection
  const hasExpo = !!deps['expo'];
  const hasRN = !!deps['react-native'];

  if (!hasRN && !hasExpo) return result;
  result.isRNProject = true;

  if (hasExpo) {
    const hasNativeCode = hasNativeDirs(cwd);
    result.framework = hasNativeCode ? 'expo-bare' : 'expo-managed';
  } else {
    result.framework = 'bare-rn';
  }

  return result;
}

function readPackageJson(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasNativeDirs(cwd) {
  const nativeExts = ['.swift', '.m', '.mm', '.kt', '.java'];
  for (const dir of ['ios', 'android']) {
    const fullDir = path.join(cwd, dir);
    if (!fs.existsSync(fullDir)) continue;
    try {
      const entries = fs.readdirSync(fullDir, { recursive: true });
      if (entries.some(e => nativeExts.some(ext => String(e).endsWith(ext)))) {
        return true;
      }
    } catch { /* skip */ }
  }
  return false;
}

module.exports = { detectProject };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/detect.test.js`
Expected: All 5 tests PASS

- [ ] **Step 5: Commit**

```bash
git rm tests/detection.test.js
git add lib/detect.js tests/detect.test.js
git commit -m "feat(detect): add framework detection with tests

Replaces old detection.test.js with comprehensive detect.test.js"
```

---

### Task 2: Add stack detection (state, navigation, styling, etc.)

**Files:**
- Modify: `tests/detect.test.js`
- Modify: `lib/detect.js`

- [ ] **Step 1: Write failing tests for stack detection**

Add to `tests/detect.test.js`:

```javascript
  describe('stack detection', () => {
    it('detects zustand + tanstack-query', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'zustand': '^4.5.0', '@tanstack/react-query': '^5.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.state, 'zustand');
      assert.equal(result.stack.serverState, 'tanstack-query');
    });

    it('detects redux-saga (no tanstack)', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.77.3',
            'redux': '^4.0.0', 'redux-saga': '^1.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.state, 'redux-saga');
      assert.equal(result.stack.serverState, 'none');
    });

    it('detects redux-toolkit', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.73.4', 'expo': '~50.0.0',
            '@reduxjs/toolkit': '^2.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.state, 'redux-toolkit');
    });

    it('detects expo-router navigation', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'expo-router': '~4.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.navigation, 'expo-router');
    });

    it('detects react-navigation', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.77.3',
            '@react-navigation/native': '^6.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.navigation, 'react-navigation');
    });

    it('detects nativewind styling', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'nativewind': '^4.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.styling, 'nativewind');
    });

    it('defaults to stylesheet when no styling lib', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.styling, 'stylesheet');
    });

    it('detects flashlist', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            '@shopify/flash-list': '^1.6.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.lists, 'flashlist');
    });

    it('detects expo-image', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'expo-image': '~1.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.images, 'expo-image');
    });

    it('detects react-hook-form', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'react-hook-form': '^7.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.forms, 'react-hook-form');
    });

    it('detects expo-secure-store', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'expo-secure-store': '~13.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.storage, 'expo-secure-store');
    });

    it('detects jest + rntl testing', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' },
          devDependencies: { '@testing-library/react-native': '^12.0.0' },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.testing, 'jest-rntl');
    });

    it('detects detox testing', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' },
          devDependencies: { 'detox': '^20.0.0' },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.testing, 'jest-detox');
    });

    it('detects EAS build', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' },
        },
        'eas.json': '{}',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.build, 'eas');
    });

    it('detects fastlane build', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: { 'react-native': '0.77.3' },
        },
        'fastlane/Fastfile': 'lane :deploy do end',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.build, 'fastlane');
    });

    it('prioritizes zustand over redux-toolkit when both present', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: {
            'react-native': '0.83.2', 'expo': '~55.0.0',
            'zustand': '^4.0.0', '@reduxjs/toolkit': '^2.0.0',
          },
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.stack.state, 'zustand');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/detect.test.js`
Expected: FAIL — stack values all default

- [ ] **Step 3: Implement stack detection**

Add to `detectProject()` in `lib/detect.js`, after framework detection:

```javascript
  // Stack detection (priority-based)
  result.stack.state = detectFirst(deps, [
    ['zustand', 'zustand'],
    ['@reduxjs/toolkit', 'redux-toolkit'],
    ['redux-saga', 'redux-saga'],
    ['mobx-react', 'mobx'],
    ['mobx-react-lite', 'mobx'],
  ]) || 'none';

  result.stack.serverState = detectFirst(deps, [
    ['@tanstack/react-query', 'tanstack-query'],
    ['swr', 'swr'],
  ]) || 'none';

  result.stack.navigation = detectFirst(deps, [
    ['expo-router', 'expo-router'],
    ['@react-navigation/native', 'react-navigation'],
  ]) || 'none';

  result.stack.styling = detectFirst(deps, [
    ['nativewind', 'nativewind'],
    ['tamagui', 'tamagui'],
    ['react-native-unistyles', 'unistyles'],
  ]) || 'stylesheet';

  result.stack.lists = deps['@shopify/flash-list'] ? 'flashlist' : 'flatlist';

  result.stack.images = detectFirst(deps, [
    ['expo-image', 'expo-image'],
    ['react-native-fast-image', 'fast-image'],
  ]) || 'rn-image';

  result.stack.forms = detectFirst(deps, [
    ['react-hook-form', 'react-hook-form'],
    ['formik', 'formik'],
    ['redux-form', 'redux-form'],
  ]) || 'none';

  result.stack.storage = detectFirst(deps, [
    ['expo-secure-store', 'expo-secure-store'],
    ['react-native-keychain', 'rn-keychain'],
  ]) || 'async-storage';

  // Testing (deps already includes devDependencies from merge above)
  result.stack.testing = detectFirst(deps, [
    ['@testing-library/react-native', 'jest-rntl'],
    ['detox', 'jest-detox'],
  ]) || 'none';

  // Build system
  if (fs.existsSync(path.join(cwd, 'eas.json'))) {
    result.stack.build = 'eas';
  } else if (fs.existsSync(path.join(cwd, 'fastlane'))) {
    result.stack.build = 'fastlane';
  } else {
    result.stack.build = 'manual';
  }
```

Add the helper function:

```javascript
function detectFirst(deps, checks) {
  for (const [pkg, value] of checks) {
    if (deps[pkg]) return value;
  }
  return null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/detect.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/detect.js tests/detect.test.js
git commit -m "feat(detect): add stack detection for all library dimensions"
```

---

### Task 3: Add metadata detection (monorepo, typescript, componentStyle, etc.)

**Files:**
- Modify: `tests/detect.test.js`
- Modify: `lib/detect.js`

- [ ] **Step 1: Write failing tests for metadata detection**

Add to `tests/detect.test.js`:

```javascript
  describe('metadata detection', () => {
    it('detects lerna monorepo', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.77.3' } },
        'lerna.json': '{}',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasMonorepo, true);
    });

    it('detects pnpm-workspace monorepo', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'pnpm-workspace.yaml': 'packages:\n  - packages/*',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasMonorepo, true);
    });

    it('detects npm workspaces monorepo', () => {
      tmpDir = createTempProject({
        'package.json': {
          dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' },
          workspaces: ['packages/*'],
        },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasMonorepo, true);
    });

    it('detects nx monorepo', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2' } },
        'nx.json': '{}',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasMonorepo, true);
    });

    it('detects typescript', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'tsconfig.json': '{}',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasTypescript, true);
    });

    it('detects newArchEnabled in app.json', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'app.json': JSON.stringify({ expo: { name: 'test', plugins: [['expo-build-properties', { ios: { newArchEnabled: true } }]] } }),
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasNewArch, true);
    });

    it('defaults hasNewArch to false when not specified', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.73.4', 'expo': '~50.0.0' } },
      });
      const result = detectProject(tmpDir);
      assert.equal(result.hasNewArch, false);
    });

    it('detects existing CLAUDE.md', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'CLAUDE.md': '# My Project\n\nSome docs...',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.existingClaudeMd, true);
    });

    it('detects functional component style', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' } },
        'src/screens/Home.tsx': 'export const Home = () => { return null; }',
        'src/screens/Profile.tsx': 'export const Profile = () => { return null; }',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.componentStyle, 'functional');
    });

    it('detects mixed component style', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.77.3' } },
        'src/screens/Home.tsx': 'export const Home = () => { return null; }',
        'src/screens/Legacy.tsx': 'class Legacy extends Component { render() {} }',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.componentStyle, 'mixed');
    });

    it('detects class component style (majority class)', () => {
      tmpDir = createTempProject({
        'package.json': { dependencies: { 'react-native': '0.77.3' } },
        'src/A.tsx': 'class A extends Component { render() {} }',
        'src/B.tsx': 'class B extends React.Component { render() {} }',
        'src/C.tsx': 'class C extends PureComponent { render() {} }',
      });
      const result = detectProject(tmpDir);
      assert.equal(result.componentStyle, 'class');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/detect.test.js`
Expected: FAIL — metadata values all default

- [ ] **Step 3: Implement metadata detection**

Add to `detectProject()` in `lib/detect.js`:

```javascript
  // Monorepo detection
  const monorepoIndicators = [
    'lerna.json', 'pnpm-workspace.yaml', 'pnpm-workspace.yml',
    'nx.json', 'rush.json',
  ];
  result.hasMonorepo = monorepoIndicators.some(f =>
    fs.existsSync(path.join(cwd, f))
  ) || !!(pkg.workspaces);

  // New Architecture
  result.hasNewArch = detectNewArch(cwd, pkg);

  // TypeScript
  result.hasTypescript = fs.existsSync(path.join(cwd, 'tsconfig.json'));

  // Existing CLAUDE.md
  result.existingClaudeMd = fs.existsSync(path.join(cwd, 'CLAUDE.md'));

  // Component style detection
  result.componentStyle = detectComponentStyle(cwd);
```

Add the helper:

```javascript
function detectComponentStyle(cwd) {
  const extensions = ['.tsx', '.ts'];
  const excludeDirs = ['node_modules', 'ios', 'android', '.expo', '.git', 'build', 'dist'];
  const classPattern = /class\s+\w+\s+extends\s+(React\.)?(Component|PureComponent)/;
  let total = 0;
  let classCount = 0;
  const maxFiles = 30;

  function scan(dir) {
    if (total >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); }
    catch { return; }

    for (const entry of entries) {
      if (total >= maxFiles) return;
      if (excludeDirs.includes(entry.name)) continue;

      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scan(fullPath);
      } else if (extensions.some(ext => entry.name.endsWith(ext))) {
        total++;
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (classPattern.test(content)) classCount++;
        } catch { /* skip unreadable files */ }
      }
    }
  }

  scan(cwd);
  if (total === 0) return 'functional';
  const ratio = classCount / total;
  if (ratio > 0.5) return 'class';
  if (classCount > 0) return 'mixed';
  return 'functional';
}

function detectNewArch(cwd, pkg) {
  // Check app.json for expo-build-properties plugin with newArchEnabled
  try {
    const appJsonPath = path.join(cwd, 'app.json');
    if (fs.existsSync(appJsonPath)) {
      const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
      const content = JSON.stringify(appJson);
      if (content.includes('newArchEnabled') && content.includes('true')) return true;
    }
  } catch { /* ignore */ }

  // Check package.json for reactNativeNewArchEnabled
  if (pkg?.reactNativeNewArchEnabled) return true;

  // Check for RCTAppDelegate in iOS code (New Arch indicator)
  try {
    const iosDir = path.join(cwd, 'ios');
    if (fs.existsSync(iosDir)) {
      const entries = fs.readdirSync(iosDir, { recursive: true });
      for (const entry of entries) {
        if (String(entry).endsWith('.swift') || String(entry).endsWith('.m') || String(entry).endsWith('.mm')) {
          const content = fs.readFileSync(path.join(iosDir, String(entry)), 'utf8');
          if (content.includes('RCTAppDelegate')) return true;
        }
      }
    }
  } catch { /* ignore */ }

  return false;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/detect.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/detect.js tests/detect.test.js
git commit -m "feat(detect): add monorepo, typescript, componentStyle detection"
```

---

## Chunk 2: CLAUDE.md Handling

### Task 4: Create `lib/claude-md.js` with tests

**Files:**
- Create: `lib/claude-md.js`
- Create: `tests/claude-md.test.js`

- [ ] **Step 1: Write failing tests for all 3 scenarios**

```javascript
// tests/claude-md.test.js
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { handleClaudeMd } = require('../lib/claude-md');

function createTmpDir(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-claude-'));
  for (const [p, content] of Object.entries(files)) {
    const full = path.join(dir, p);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
  return dir;
}

function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

const mockDetection = {
  isRNProject: true,
  framework: 'expo-managed',
  stack: {
    state: 'zustand', serverState: 'tanstack-query',
    navigation: 'expo-router', styling: 'stylesheet',
    lists: 'flashlist', images: 'expo-image',
    forms: 'react-hook-form', storage: 'expo-secure-store',
    testing: 'jest-rntl', build: 'eas',
  },
  hasMonorepo: false, hasNewArch: true, hasTypescript: true,
  existingClaudeMd: false, componentStyle: 'functional',
};

describe('handleClaudeMd', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  it('Scenario A: generates new CLAUDE.md when none exists', () => {
    tmpDir = createTmpDir({ 'package.json': '{"name":"test-app"}' });
    handleClaudeMd(tmpDir, mockDetection, 'standard', ['common', 'expo']);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('<!-- ERNE-GENERATED -->'));
    assert.ok(content.includes('Zustand'));
    assert.ok(content.includes('Expo Router'));
    assert.ok(content.includes('@import .claude/rules/common/'));
    assert.ok(content.includes('@import .claude/rules/expo/'));
  });

  it('Scenario B: appends to existing non-ERNE CLAUDE.md', () => {
    const original = '# My Project\n\nThis is my custom documentation.\n';
    tmpDir = createTmpDir({
      'CLAUDE.md': original,
      'package.json': '{"name":"test-app"}',
    });
    handleClaudeMd(tmpDir, { ...mockDetection, existingClaudeMd: true }, 'standard', ['common', 'expo']);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    // Original content preserved
    assert.ok(content.startsWith('# My Project'));
    assert.ok(content.includes('This is my custom documentation.'));
    // ERNE section appended
    assert.ok(content.includes('# ERNE Configuration'));
    assert.ok(content.includes('@import .claude/rules/'));
    // Backup created
    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md.pre-erne')));
  });

  it('Scenario C: regenerates ERNE-generated CLAUDE.md', () => {
    tmpDir = createTmpDir({
      'CLAUDE.md': '<!-- ERNE-GENERATED -->\n# Old ERNE Config\nold content',
      'package.json': '{"name":"test-app"}',
    });
    handleClaudeMd(tmpDir, { ...mockDetection, existingClaudeMd: true }, 'standard', ['common', 'expo']);

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('<!-- ERNE-GENERATED -->'));
    assert.ok(!content.includes('old content'));
    assert.ok(content.includes('Zustand'));
    // No backup for ERNE-generated files
    assert.ok(!fs.existsSync(path.join(tmpDir, 'CLAUDE.md.pre-erne')));
  });

  it('does not overwrite existing backup', () => {
    tmpDir = createTmpDir({
      'CLAUDE.md': '# New custom stuff',
      'CLAUDE.md.pre-erne': '# Original precious content',
      'package.json': '{"name":"test-app"}',
    });
    handleClaudeMd(tmpDir, { ...mockDetection, existingClaudeMd: true }, 'standard', ['common']);

    const backup = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md.pre-erne'), 'utf8');
    assert.ok(backup.includes('Original precious content'));
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/claude-md.test.js`
Expected: FAIL — `Cannot find module '../lib/claude-md'`

- [ ] **Step 3: Implement claude-md.js**

```javascript
// lib/claude-md.js
'use strict';

const fs = require('fs');
const path = require('path');

const ERNE_MARKER = '<!-- ERNE-GENERATED -->';

function handleClaudeMd(cwd, detection, profile, ruleLayers) {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const backupPath = path.join(cwd, 'CLAUDE.md.pre-erne');

  if (detection.existingClaudeMd && fs.existsSync(claudeMdPath)) {
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    const isErneGenerated = content.includes(ERNE_MARKER);

    if (isErneGenerated) {
      // Scenario C: regenerate
      fs.writeFileSync(claudeMdPath, generateFullClaudeMd(cwd, detection, profile, ruleLayers));
      return 'regenerated';
    } else {
      // Scenario B: backup + append
      if (!fs.existsSync(backupPath)) {
        fs.copyFileSync(claudeMdPath, backupPath);
      }
      const erneSection = generateAppendSection(ruleLayers);
      fs.writeFileSync(claudeMdPath, content + '\n\n' + erneSection);
      return 'appended';
    }
  } else {
    // Scenario A: generate new
    fs.writeFileSync(claudeMdPath, generateFullClaudeMd(cwd, detection, profile, ruleLayers));
    return 'generated';
  }
}

function generateFullClaudeMd(cwd, detection, profile, ruleLayers) {
  const projectName = getProjectName(cwd);
  const s = detection.stack;

  const stateLabel = formatStateLabel(s.state, s.serverState);
  const navLabel = formatLabel(s.navigation, {
    'expo-router': 'Expo Router (file-based)',
    'react-navigation': 'React Navigation',
  });
  const stylingLabel = formatLabel(s.styling, {
    'stylesheet': 'StyleSheet.create',
    'nativewind': 'NativeWind (Tailwind CSS)',
    'tamagui': 'Tamagui',
    'unistyles': 'Unistyles',
  });
  const listsLabel = formatLabel(s.lists, {
    'flashlist': 'FlashList',
    'flatlist': 'FlatList',
  });
  const imagesLabel = formatLabel(s.images, {
    'expo-image': 'expo-image',
    'fast-image': 'react-native-fast-image',
    'rn-image': 'React Native Image',
  });
  const testingLabel = formatLabel(s.testing, {
    'jest-rntl': 'Jest + React Native Testing Library',
    'jest-detox': 'Jest + Detox',
    'none': 'Not configured',
  });
  const buildLabel = formatLabel(s.build, {
    'eas': 'EAS Build',
    'fastlane': 'Fastlane',
    'manual': 'Manual',
  });

  const keyRules = generateKeyRules(detection);
  const ruleImports = ruleLayers.map(l => `@import .claude/rules/${l}/`).join('\n');

  return `${ERNE_MARKER}
# ${projectName} — ERNE Configuration

## Project Stack
- **Framework**: ${detection.framework}
- **Language**: ${detection.hasTypescript ? 'TypeScript' : 'JavaScript'}
- **Navigation**: ${navLabel}
- **State**: ${stateLabel}
- **Styling**: ${stylingLabel}
- **Lists**: ${listsLabel}
- **Images**: ${imagesLabel}
- **Testing**: ${testingLabel}
- **Build**: ${buildLabel}

## Key Rules
${keyRules}

## Available Commands
/plan, /code-review, /tdd, /build-fix, /perf, /upgrade, /debug, /deploy,
/component, /navigate, /animate, /quality-gate, /security-review

## Rules
${ruleImports}

## Skills
@import .claude/skills/
`;
}

function generateAppendSection(ruleLayers) {
  const ruleImports = ruleLayers.map(l => `@import .claude/rules/${l}/`).join('\n');
  return `---

# ERNE Configuration (auto-generated)

## Rules
${ruleImports}

## Skills
@import .claude/skills/

## Available Commands
/plan, /code-review, /tdd, /build-fix, /perf, /upgrade, /debug, /deploy,
/component, /navigate, /animate, /quality-gate, /security-review
`;
}

function getProjectName(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    return pkg.name || path.basename(cwd);
  } catch {
    return path.basename(cwd);
  }
}

function formatStateLabel(state, serverState) {
  const stateNames = {
    'zustand': 'Zustand', 'redux-toolkit': 'Redux Toolkit',
    'redux-saga': 'Redux + Saga', 'mobx': 'MobX', 'none': 'None',
  };
  const serverNames = {
    'tanstack-query': 'TanStack Query', 'swr': 'SWR',
    'rtk-query': 'RTK Query', 'none': '',
  };
  const s = stateNames[state] || state;
  const ss = serverNames[serverState];
  return ss ? `${s} (client) + ${ss} (server)` : s;
}

function formatLabel(value, map) {
  return map[value] || value;
}

function generateKeyRules(detection) {
  const rules = [];
  const s = detection.stack;

  if (detection.componentStyle === 'functional') {
    rules.push('- Functional components with `const` + arrow functions');
  } else {
    rules.push('- Prefer functional components; class components accepted in legacy code');
  }

  rules.push('- Named exports only (no default exports)');

  if (s.state === 'zustand') {
    rules.push('- Zustand: selective subscriptions, one store per domain');
  } else if (s.state === 'redux-toolkit' || s.state === 'redux-saga') {
    rules.push('- Redux: use slices/sagas by domain, avoid deeply nested state');
  }

  if (s.navigation === 'expo-router') {
    rules.push('- File-based routing with Expo Router');
  } else if (s.navigation === 'react-navigation') {
    rules.push('- React Navigation with typed route params');
  }

  if (s.lists === 'flashlist') {
    rules.push('- FlashList over FlatList for lists with 100+ items');
  }

  if (s.storage === 'expo-secure-store') {
    rules.push('- `expo-secure-store` for tokens, never AsyncStorage');
  } else if (s.storage === 'rn-keychain') {
    rules.push('- `react-native-keychain` for secure credential storage');
  } else {
    rules.push('- Migrate sensitive data from AsyncStorage to a secure store');
  }

  rules.push('- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`');

  return rules.join('\n');
}

module.exports = { handleClaudeMd };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/claude-md.test.js`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/claude-md.js tests/claude-md.test.js
git commit -m "feat(claude-md): add 3-scenario CLAUDE.md handling with backup"
```

---

## Chunk 3: Variant Selection and Content Generation

### Task 5: Create `lib/generate.js` with variant map and tests

**Files:**
- Create: `lib/generate.js`
- Create: `tests/generate.test.js`

- [ ] **Step 1: Write failing tests for variant selection**

```javascript
// tests/generate.test.js
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { selectVariant, VARIANT_MAP } = require('../lib/generate');

describe('selectVariant', () => {
  it('selects zustand+tanstack-query for state-management', () => {
    const detection = {
      stack: { state: 'zustand', serverState: 'tanstack-query' },
    };
    const result = selectVariant('rules/common/state-management.md', detection);
    assert.equal(result, 'state-management/zustand-tanstack.md');
  });

  it('selects redux-saga for state-management', () => {
    const detection = {
      stack: { state: 'redux-saga', serverState: 'none' },
    };
    const result = selectVariant('rules/common/state-management.md', detection);
    assert.equal(result, 'state-management/redux-saga.md');
  });

  it('falls back to default for unknown combo', () => {
    const detection = {
      stack: { state: 'mobx', serverState: 'swr' },
    };
    const result = selectVariant('rules/common/state-management.md', detection);
    assert.equal(result, 'state-management/zustand-tanstack.md'); // default
  });

  it('selects expo-router for navigation', () => {
    const detection = { stack: { navigation: 'expo-router' } };
    const result = selectVariant('rules/common/navigation.md', detection);
    assert.equal(result, 'navigation/expo-router.md');
  });

  it('selects react-navigation for navigation', () => {
    const detection = { stack: { navigation: 'react-navigation' } };
    const result = selectVariant('rules/common/navigation.md', detection);
    assert.equal(result, 'navigation/react-navigation.md');
  });

  it('selects modern performance for flashlist+expo-image', () => {
    const detection = { stack: { lists: 'flashlist', images: 'expo-image' } };
    const result = selectVariant('rules/common/performance.md', detection);
    assert.equal(result, 'performance/modern.md');
  });

  it('selects legacy performance for flatlist+rn-image', () => {
    const detection = { stack: { lists: 'flatlist', images: 'rn-image' } };
    const result = selectVariant('rules/common/performance.md', detection);
    assert.equal(result, 'performance/legacy.md');
  });

  it('selects nativewind ui-designer', () => {
    const detection = { stack: { styling: 'nativewind' } };
    const result = selectVariant('agents/ui-designer.md', detection);
    assert.equal(result, 'ui-designer/nativewind.md');
  });

  it('selects monorepo architect', () => {
    const detection = { stack: { state: 'zustand' }, hasMonorepo: true };
    const result = selectVariant('agents/architect.md', detection);
    assert.equal(result, 'architect/monorepo.md');
  });

  it('selects stylesheet ui-designer for stylesheet projects', () => {
    const detection = { stack: { styling: 'stylesheet' } };
    const result = selectVariant('agents/ui-designer.md', detection);
    assert.equal(result, 'ui-designer/stylesheet.md');
  });

  it('returns null for unmapped target', () => {
    const detection = { stack: {} };
    const result = selectVariant('agents/code-reviewer.md', detection);
    assert.equal(result, null);
  });
});

describe('VARIANT_MAP', () => {
  it('has entries for all expected targets', () => {
    const expectedTargets = [
      'rules/common/state-management.md',
      'rules/common/navigation.md',
      'rules/common/performance.md',
      'rules/common/coding-style.md',
      'rules/common/security.md',
      'rules/common/styling.md',
      'agents/ui-designer.md',
      'agents/architect.md',
      'agents/senior-developer.md',
      'agents/feature-builder.md',
    ];
    for (const target of expectedTargets) {
      assert.ok(VARIANT_MAP[target], `Missing VARIANT_MAP entry for ${target}`);
    }
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test tests/generate.test.js`
Expected: FAIL — `Cannot find module '../lib/generate'`

- [ ] **Step 3: Implement generate.js with VARIANT_MAP and selectVariant**

```javascript
// lib/generate.js
'use strict';

const fs = require('fs');
const path = require('path');

const VARIANT_MAP = {
  'rules/common/state-management.md': {
    fields: ['state', 'serverState'],
    variants: {
      'zustand+tanstack-query': 'state-management/zustand-tanstack.md',
      'zustand+none':           'state-management/zustand-only.md',
      'zustand+swr':            'state-management/zustand-tanstack.md',  // SWR is a server-state lib like TQ
      'redux-saga+none':        'state-management/redux-saga.md',
      'redux-saga+tanstack-query': 'state-management/redux-saga.md',
      'redux-toolkit+rtk-query':'state-management/redux-toolkit.md',
      'redux-toolkit+tanstack-query': 'state-management/redux-toolkit.md',
      'redux-toolkit+none':     'state-management/redux-toolkit.md',
    },
    default: 'state-management/zustand-tanstack.md',
  },
  'rules/common/navigation.md': {
    fields: ['navigation'],
    variants: {
      'expo-router':      'navigation/expo-router.md',
      'react-navigation': 'navigation/react-navigation.md',
    },
    default: 'navigation/expo-router.md',
  },
  'rules/common/performance.md': {
    fields: ['lists', 'images'],
    variants: {
      'flashlist+expo-image':  'performance/modern.md',
      'flashlist+rn-image':    'performance/modern.md',
      'flashlist+fast-image':  'performance/modern.md',
      'flatlist+expo-image':   'performance/modern.md',
      'flatlist+rn-image':     'performance/legacy.md',
      'flatlist+fast-image':   'performance/legacy.md',
    },
    default: 'performance/modern.md',
  },
  'rules/common/coding-style.md': {
    fields: ['componentStyle'],
    variants: {
      'functional': 'coding-style/functional.md',
      'class':      'coding-style/mixed.md',
      'mixed':      'coding-style/mixed.md',
    },
    default: 'coding-style/functional.md',
  },
  'rules/common/security.md': {
    fields: ['storage'],
    variants: {
      'expo-secure-store': 'security/expo-secure.md',
      'rn-keychain':       'security/rn-keychain.md',
      'async-storage':     'security/async-storage.md',
    },
    default: 'security/async-storage.md',
  },
  'rules/common/styling.md': {
    fields: ['styling'],
    variants: {
      'stylesheet':  'styling/stylesheet.md',
      'nativewind':  'styling/nativewind.md',
      'tamagui':     'styling/stylesheet.md',
      'unistyles':   'styling/stylesheet.md',
    },
    default: 'styling/stylesheet.md',
  },
  'agents/ui-designer.md': {
    fields: ['styling'],
    variants: {
      'stylesheet':  'ui-designer/stylesheet.md',
      'nativewind':  'ui-designer/nativewind.md',
      'tamagui':     'ui-designer/stylesheet.md',
      'unistyles':   'ui-designer/stylesheet.md',
    },
    default: 'ui-designer/stylesheet.md',
  },
  'agents/architect.md': {
    fields: ['state', 'hasMonorepo'],
    variants: {
      'zustand+false':       'architect/zustand.md',
      'zustand+true':        'architect/monorepo.md',
      'redux-toolkit+false': 'architect/redux.md',
      'redux-toolkit+true':  'architect/monorepo.md',
      'redux-saga+false':    'architect/redux.md',
      'redux-saga+true':     'architect/monorepo.md',
      'mobx+false':          'architect/zustand.md',
      'mobx+true':           'architect/monorepo.md',
    },
    default: 'architect/zustand.md',
  },
  'agents/senior-developer.md': {
    fields: ['framework', 'state'],
    variants: {
      'expo-managed+zustand':       'senior-developer/modern-expo.md',
      'expo-managed+redux-toolkit': 'senior-developer/legacy-bare.md',
      'expo-managed+redux-saga':    'senior-developer/legacy-bare.md',
      'expo-bare+zustand':          'senior-developer/modern-expo.md',
      'expo-bare+redux-toolkit':    'senior-developer/legacy-bare.md',
      'expo-bare+redux-saga':       'senior-developer/legacy-bare.md',
      'bare-rn+redux-saga':         'senior-developer/legacy-bare.md',
      'bare-rn+redux-toolkit':      'senior-developer/legacy-bare.md',
      'bare-rn+zustand':            'senior-developer/modern-expo.md',
    },
    default: 'senior-developer/modern-expo.md',
  },
  'agents/feature-builder.md': {
    fields: ['framework', 'state'],
    variants: {
      'expo-managed+zustand':       'feature-builder/modern-expo.md',
      'expo-managed+redux-toolkit': 'feature-builder/legacy-bare.md',
      'expo-managed+redux-saga':    'feature-builder/legacy-bare.md',
      'expo-bare+zustand':          'feature-builder/modern-expo.md',
      'expo-bare+redux-toolkit':    'feature-builder/legacy-bare.md',
      'expo-bare+redux-saga':       'feature-builder/legacy-bare.md',
      'bare-rn+redux-saga':         'feature-builder/legacy-bare.md',
      'bare-rn+redux-toolkit':      'feature-builder/legacy-bare.md',
      'bare-rn+zustand':            'feature-builder/modern-expo.md',
    },
    default: 'feature-builder/modern-expo.md',
  },
};

function selectVariant(targetPath, detection) {
  const mapping = VARIANT_MAP[targetPath];
  if (!mapping) return null;

  const key = mapping.fields.map(field => {
    if (field === 'componentStyle') return detection.componentStyle;
    if (field === 'hasMonorepo') return String(detection.hasMonorepo);
    if (field === 'framework') return detection.framework;
    return detection.stack?.[field];
  }).join('+');

  return mapping.variants[key] || mapping.default;
}

function generateConfig(erneRoot, targetDir, detection, profile, mcpSelections) {
  const claudeDir = path.join(targetDir, '.claude');
  fs.mkdirSync(claudeDir, { recursive: true });

  // 1. Copy universal content
  copyDir(path.join(erneRoot, 'commands'), path.join(claudeDir, 'commands'));
  copyDir(path.join(erneRoot, 'contexts'), path.join(claudeDir, 'contexts'));
  copyDir(path.join(erneRoot, 'skills'), path.join(claudeDir, 'skills'));
  const scriptsTarget = path.join(claudeDir, 'scripts', 'hooks');
  copyDir(path.join(erneRoot, 'scripts', 'hooks'), scriptsTarget);

  // 2. Copy base rules (common + framework layer)
  const ruleLayers = determineRuleLayers(detection);
  const rulesTarget = path.join(claudeDir, 'rules');
  fs.mkdirSync(rulesTarget, { recursive: true });
  for (const layer of ruleLayers) {
    copyDir(path.join(erneRoot, 'rules', layer), path.join(rulesTarget, layer));
  }

  // 3. Apply rule variants
  for (const [target, mapping] of Object.entries(VARIANT_MAP)) {
    if (!target.startsWith('rules/')) continue;
    const variantFile = selectVariant(target, detection);
    if (!variantFile) continue;

    const variantSrc = path.join(erneRoot, 'rules', 'variants', variantFile);
    const destFile = path.join(claudeDir, target);

    if (fs.existsSync(variantSrc)) {
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(variantSrc, destFile);
    }
  }

  // 4. Copy agents with variants
  const agentsTarget = path.join(claudeDir, 'agents');
  copyDir(path.join(erneRoot, 'agents'), agentsTarget);

  // Skip irrelevant agents
  if (detection.framework !== 'bare-rn') {
    safeDelete(path.join(agentsTarget, 'native-bridge-builder.md'));
  }
  if (detection.framework === 'bare-rn') {
    safeDelete(path.join(agentsTarget, 'expo-config-resolver.md'));
  }

  // Apply agent variants
  for (const [target, mapping] of Object.entries(VARIANT_MAP)) {
    if (!target.startsWith('agents/')) continue;
    const variantFile = selectVariant(target, detection);
    if (!variantFile) continue;

    const variantSrc = path.join(erneRoot, 'agents', 'variants', variantFile);
    const destFile = path.join(claudeDir, target);

    if (fs.existsSync(variantSrc)) {
      fs.copyFileSync(variantSrc, destFile);
    }
  }

  // 5. Apply hook profile
  const hooksSource = path.join(erneRoot, 'hooks');
  const profileSource = path.join(hooksSource, 'profiles', `${profile}.json`);
  if (fs.existsSync(path.join(hooksSource, 'hooks.json')) && fs.existsSync(profileSource)) {
    const masterHooks = JSON.parse(fs.readFileSync(path.join(hooksSource, 'hooks.json'), 'utf8'));
    const profileHooks = JSON.parse(fs.readFileSync(profileSource, 'utf8'));
    const mergedHooks = mergeHookProfile(masterHooks, profileHooks, profile);
    fs.writeFileSync(path.join(claudeDir, 'hooks.json'), JSON.stringify(mergedHooks, null, 2));
  }

  // 6. MCP configs
  const mcpTarget = path.join(claudeDir, 'mcp-configs');
  fs.mkdirSync(mcpTarget, { recursive: true });
  let mcpCount = 0;
  for (const [key, enabled] of Object.entries(mcpSelections)) {
    if (enabled) {
      const src = path.join(erneRoot, 'mcp-configs', `${key}.json`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(mcpTarget, `${key}.json`));
        mcpCount++;
      }
    }
  }

  // 7. Settings
  const settings = {
    hookProfile: profile,
    erneVersion: getErneVersion(erneRoot),
    detection: {
      framework: detection.framework,
      stack: detection.stack,
      hasMonorepo: detection.hasMonorepo,
      hasNewArch: detection.hasNewArch,
      hasTypescript: detection.hasTypescript,
      componentStyle: detection.componentStyle,
    },
    installedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(claudeDir, 'settings.json'), JSON.stringify(settings, null, 2));

  return { ruleLayers, mcpCount };
}

function determineRuleLayers(detection) {
  const layers = ['common'];
  if (detection.framework === 'expo-managed' || detection.framework === 'expo-bare') {
    layers.push('expo');
  }
  if (detection.framework === 'bare-rn' || detection.framework === 'expo-bare') {
    layers.push('bare-rn');
  }
  return layers;
}

function mergeHookProfile(masterHooks, profileHooks, profileName) {
  const result = {};
  for (const [event, hooks] of Object.entries(masterHooks)) {
    if (event === '_meta') {
      result._meta = { ...masterHooks._meta, activeProfile: profileName };
      continue;
    }
    if (Array.isArray(hooks)) {
      result[event] = hooks.filter(hook => {
        const hookProfiles = hook.profiles || ['minimal', 'standard', 'strict'];
        return hookProfiles.includes(profileName);
      });
      if (result[event].length === 0) delete result[event];
    }
  }
  return result;
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}

function safeDelete(filePath) {
  try { fs.unlinkSync(filePath); } catch { /* ignore */ }
}

function getErneVersion(erneRoot) {
  try {
    return require(path.join(erneRoot, 'package.json')).version;
  } catch {
    return 'unknown';
  }
}

module.exports = { selectVariant, generateConfig, VARIANT_MAP, determineRuleLayers };
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `node --test tests/generate.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add lib/generate.js tests/generate.test.js
git commit -m "feat(generate): add variant selection map and config generation"
```

---

## Chunk 4: Rewire Init + Write Variant Content

### Task 6: Rewrite `lib/init.js` as orchestrator

**Files:**
- Modify: `lib/init.js`

- [ ] **Step 1: Rewrite init.js to use new modules**

Replace the contents of `lib/init.js`:

```javascript
// lib/init.js — Orchestrator for ERNE project initialization
// Uses detect.js for scanning, generate.js for file copying, claude-md.js for CLAUDE.md

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const { detectProject } = require('./detect');
const { generateConfig, determineRuleLayers } = require('./generate');
const { handleClaudeMd } = require('./claude-md');

function parseArgs() {
  const args = process.argv.slice(3);
  const opts = { profile: null, mcp: null, yes: false, noMcp: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--profile': case '-p':
        opts.profile = args[++i]; break;
      case '--mcp': case '-m':
        opts.mcp = args[++i] ? args[i].split(',').map(s => s.trim()) : []; break;
      case '--no-mcp':
        opts.noMcp = true; break;
      case '--yes': case '-y':
        opts.yes = true; break;
    }
  }
  return opts;
}

module.exports = async function init() {
  const opts = parseArgs();
  const nonInteractive = opts.yes || opts.profile || opts.mcp !== null || opts.noMcp;

  let rl;
  if (!nonInteractive) {
    rl = readline.createInterface({ input: stdin, output: stdout });
  }

  const cwd = process.cwd();
  const erneRoot = path.resolve(__dirname, '..');

  console.log('\n  erne — Setting up AI agent harness for React Native & Expo\n');

  // ─── Step 1: Deep scan ───
  console.log('  Scanning project...\n');
  const detection = detectProject(cwd);
  printDetectionReport(detection);

  if (!detection.isRNProject) {
    if (nonInteractive) {
      console.log('  ⚠ No React Native project detected — continuing (non-interactive mode).\n');
    } else {
      console.log('  ⚠ No React Native project detected in current directory.');
      const proceed = await rl.question('  Continue anyway? (y/N) ');
      if (proceed.toLowerCase() !== 'y') {
        console.log('  Aborted.');
        rl.close();
        return;
      }
    }
  }

  // ─── Step 2: Hook profile ───
  let profile;
  const validProfiles = ['minimal', 'standard', 'strict'];

  if (opts.profile && validProfiles.includes(opts.profile)) {
    profile = opts.profile;
    console.log(`  Hook profile: ${profile}\n`);
  } else if (nonInteractive) {
    profile = 'standard';
    console.log('  Hook profile: standard (default)\n');
  } else {
    console.log('  Select hook profile:\n');
    console.log('    (a) minimal  — fast iteration, minimal checks');
    console.log('    (b) standard — balanced quality + speed [recommended]');
    console.log('    (c) strict   — production-grade enforcement\n');

    let choice = await rl.question('  Profile (a/b/c) [b]: ');
    choice = choice.toLowerCase() || 'b';
    const map = { a: 'minimal', b: 'standard', c: 'strict' };
    profile = map[choice] || 'standard';
  }

  // ─── Step 3: MCP selection ───
  const mcpSelections = {};
  const allMcpKeys = ['agent-device', 'github', 'supabase', 'firebase', 'figma', 'sentry'];
  const defaultMcpKeys = ['agent-device', 'github'];

  if (opts.noMcp) {
    console.log('  MCP servers: none\n');
    for (const key of allMcpKeys) mcpSelections[key] = false;
  } else if (opts.mcp !== null) {
    console.log(`  MCP servers: ${opts.mcp.join(', ') || 'none'}\n`);
    for (const key of allMcpKeys) mcpSelections[key] = opts.mcp.includes(key);
  } else if (opts.yes) {
    console.log(`  MCP servers: ${defaultMcpKeys.join(', ')} (defaults)\n`);
    for (const key of allMcpKeys) mcpSelections[key] = defaultMcpKeys.includes(key);
  } else {
    console.log('  MCP server integrations:\n');
    console.log('  Recommended:');
    const ad = await rl.question('    [Y/n] agent-device — Control iOS Simulator & Android Emulator: ');
    mcpSelections['agent-device'] = ad.toLowerCase() !== 'n';
    const gh = await rl.question('    [Y/n] GitHub — PR management, issue tracking: ');
    mcpSelections['github'] = gh.toLowerCase() !== 'n';

    console.log('\n  Optional (press Enter to skip):');
    for (const s of [
      { key: 'supabase', label: 'Supabase — Database & auth' },
      { key: 'firebase', label: 'Firebase — Analytics & push' },
      { key: 'figma', label: 'Figma — Design token sync' },
      { key: 'sentry', label: 'Sentry — Error tracking' },
    ]) {
      const a = await rl.question(`    [y/N] ${s.label}: `);
      mcpSelections[s.key] = a.toLowerCase() === 'y';
    }
  }

  if (rl) rl.close();

  // ─── Step 4: Generate ───
  console.log('  Generating configuration...\n');

  const { ruleLayers, mcpCount } = generateConfig(
    erneRoot, cwd, detection, profile, mcpSelections
  );

  // Count what was installed
  const agentsDir = path.join(cwd, '.claude', 'agents');
  const agentCount = fs.existsSync(agentsDir) ?
    fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).length : 0;

  console.log(`    ✓ .claude/agents/ (${agentCount} agents)`);
  console.log(`    ✓ .claude/commands/`);
  console.log(`    ✓ .claude/rules/ (layers: ${ruleLayers.join(', ')})`);
  console.log(`    ✓ .claude/hooks.json (${profile} profile)`);
  console.log(`    ✓ .claude/scripts/hooks/`);
  console.log(`    ✓ .claude/contexts/`);
  console.log(`    ✓ .claude/mcp-configs/ (${mcpCount} servers)`);
  console.log(`    ✓ .claude/skills/`);

  // Handle CLAUDE.md
  const claudeMdAction = handleClaudeMd(cwd, detection, profile, ruleLayers);
  if (claudeMdAction === 'appended') {
    console.log('    ✓ CLAUDE.md (appended — original backed up to CLAUDE.md.pre-erne)');
  } else if (claudeMdAction === 'regenerated') {
    console.log('    ✓ CLAUDE.md (regenerated for detected stack)');
  } else {
    console.log('    ✓ CLAUDE.md (generated for detected stack)');
  }

  console.log(`    ✓ .claude/settings.json`);
  console.log('\n  Done! Run /plan to start your first feature.\n');
};

function printDetectionReport(detection) {
  const s = detection.stack;
  const labels = {
    state: { zustand: 'Zustand', 'redux-toolkit': 'Redux Toolkit', 'redux-saga': 'Redux + Saga', mobx: 'MobX', none: 'None' },
    serverState: { 'tanstack-query': 'TanStack Query', swr: 'SWR', none: '' },
    navigation: { 'expo-router': 'Expo Router', 'react-navigation': 'React Navigation', none: 'None' },
    styling: { stylesheet: 'StyleSheet.create', nativewind: 'NativeWind', tamagui: 'Tamagui', unistyles: 'Unistyles' },
    lists: { flashlist: 'FlashList', flatlist: 'FlatList' },
    images: { 'expo-image': 'expo-image', 'fast-image': 'react-native-fast-image', 'rn-image': 'React Native Image' },
    forms: { 'react-hook-form': 'React Hook Form', formik: 'Formik', 'redux-form': 'Redux Form', none: 'None' },
    storage: { 'expo-secure-store': 'expo-secure-store', 'rn-keychain': 'react-native-keychain', 'async-storage': 'AsyncStorage' },
    testing: { 'jest-rntl': 'Jest + RNTL', 'jest-detox': 'Jest + Detox', none: 'Not configured' },
    build: { eas: 'EAS Build', fastlane: 'Fastlane', manual: 'Manual' },
  };

  const l = (cat, val) => labels[cat]?.[val] || val;
  const stateStr = l('state', s.state) + (s.serverState !== 'none' ? ` + ${l('serverState', s.serverState)}` : '');

  console.log(`    Framework:   ${detection.framework}`);
  console.log(`    State:       ${stateStr}`);
  console.log(`    Navigation:  ${l('navigation', s.navigation)}`);
  console.log(`    Styling:     ${l('styling', s.styling)}`);
  console.log(`    Lists:       ${l('lists', s.lists)}`);
  console.log(`    Images:      ${l('images', s.images)}`);
  console.log(`    Forms:       ${l('forms', s.forms)}`);
  console.log(`    Storage:     ${l('storage', s.storage)}`);
  console.log(`    Testing:     ${l('testing', s.testing)}`);
  console.log(`    Build:       ${l('build', s.build)}`);
  console.log(`    TypeScript:  ${detection.hasTypescript ? 'Yes' : 'No'}`);
  console.log(`    New Arch:    ${detection.hasNewArch ? 'Yes' : 'No'}`);
  console.log(`    Monorepo:    ${detection.hasMonorepo ? 'Yes' : 'No'}`);
  console.log(`    Components:  ${detection.componentStyle}`);
  if (detection.existingClaudeMd) {
    console.log(`    CLAUDE.md:   Exists (will append, backup to CLAUDE.md.pre-erne)`);
  }
  console.log();
}
```

- [ ] **Step 2: Run existing CLI tests to verify nothing breaks**

Run: `node --test tests/cli.test.js`
Expected: All 4 existing tests PASS

- [ ] **Step 3: Run all tests**

Run: `node --test tests/*.test.js`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add lib/init.js
git commit -m "refactor(init): rewrite as orchestrator using detect/generate/claude-md modules"
```

---

### Task 7: Create variant template files (rules)

**Files:**
- Create: `rules/variants/state-management/zustand-tanstack.md`
- Create: `rules/variants/state-management/zustand-only.md`
- Create: `rules/variants/state-management/redux-saga.md`
- Create: `rules/variants/state-management/redux-toolkit.md`
- Create: `rules/variants/navigation/expo-router.md`
- Create: `rules/variants/navigation/react-navigation.md`
- Create: `rules/variants/performance/modern.md`
- Create: `rules/variants/performance/legacy.md`
- Create: `rules/variants/styling/stylesheet.md`
- Create: `rules/variants/styling/nativewind.md`
- Create: `rules/variants/coding-style/functional.md`
- Create: `rules/variants/coding-style/mixed.md`
- Create: `rules/variants/security/expo-secure.md`
- Create: `rules/variants/security/rn-keychain.md`
- Create: `rules/variants/security/async-storage.md`

- [ ] **Step 1: Create state-management variants**

Copy existing `rules/common/state-management.md` as `rules/variants/state-management/zustand-tanstack.md` (it already matches this variant).

Create `rules/variants/state-management/zustand-only.md` — same as zustand-tanstack but remove TanStack Query section, replace with `useState`/`useReducer` for server data.

Create `rules/variants/state-management/redux-saga.md` — Redux + Saga patterns (action creators, saga generators, connect() for class components).

Create `rules/variants/state-management/redux-toolkit.md` — RTK patterns (createSlice, createAsyncThunk, RTK listeners).

- [ ] **Step 2: Create navigation variants**

Copy existing `rules/common/navigation.md` as `rules/variants/navigation/expo-router.md` (already matches).

Create `rules/variants/navigation/react-navigation.md` — React Navigation v6/v7 patterns (Stack.Navigator, Tab.Navigator, useNavigation typed hook, navigation.navigate()).

- [ ] **Step 3: Create performance, styling, coding-style, security variants**

**Performance:** Copy existing as `modern.md`. Create `legacy.md` — FlatList optimization tips, React Native Image best practices, no FlashList/expo-image references.

**Styling:** Create `stylesheet.md` — StyleSheet.create patterns, theme tokens, dark mode with useColorScheme. Create `nativewind.md` — className prop, Tailwind utility classes, dark: prefix.

**Coding style:** Copy existing as `functional.md`. Create `mixed.md` — same rules but with "class components accepted in legacy code, prefer functional for new code" guidance.

**Security:** Copy existing as `expo-secure.md`. Create `rn-keychain.md` — react-native-keychain patterns. Create `async-storage.md` — AsyncStorage with warnings about sensitivity.

- [ ] **Step 4: Verify all variant files exist**

Run: `ls -R rules/variants/`
Expected: 15 files across 6 directories

- [ ] **Step 5: Commit**

```bash
git add rules/variants/
git commit -m "feat(variants): add rule variant templates for all stack combinations"
```

---

### Task 8: Create variant template files (agents)

**Files:**
- Create: `agents/variants/ui-designer/stylesheet.md`
- Create: `agents/variants/ui-designer/nativewind.md`
- Create: `agents/variants/architect/zustand.md`
- Create: `agents/variants/architect/redux.md`
- Create: `agents/variants/architect/monorepo.md`
- Create: `agents/variants/senior-developer/modern-expo.md`
- Create: `agents/variants/senior-developer/legacy-bare.md`
- Create: `agents/variants/feature-builder/modern-expo.md`
- Create: `agents/variants/feature-builder/legacy-bare.md`

- [ ] **Step 1: Create ui-designer variants**

`stylesheet.md` — Rewrite current ui-designer agent: replace all NativeWind/className references with StyleSheet.create patterns. Keep Reanimated and Gesture Handler sections. Dark mode via useColorScheme + theme tokens.

`nativewind.md` — Copy current ui-designer agent as-is (it already uses NativeWind).

- [ ] **Step 2: Create architect variants**

`zustand.md` — Copy current architect, replace Jotai reference, explicitly state "Zustand for client state, TanStack Query for server state — no other state management libraries."

`redux.md` — Rewrite state section: Redux Toolkit slices, Redux Saga for side effects, connected components. Remove Zustand/Jotai references.

`monorepo.md` — Based on zustand variant, add monorepo-specific guidance: shared packages, cross-package imports, lerna/pnpm workspace commands.

- [ ] **Step 3: Create senior-developer and feature-builder variants**

`modern-expo.md` — Copy current senior-developer/feature-builder, ensure all examples use Expo Router, Zustand, TanStack Query, FlashList, expo-image, expo-secure-store.

`legacy-bare.md` — Rewrite: React Navigation with useNavigation(), Redux with useSelector/useDispatch (or connect), FlatList, react-native-keychain or AsyncStorage, manual build process.

- [ ] **Step 4: Verify all variant files exist**

Run: `ls -R agents/variants/`
Expected: 9 files across 4 directories

- [ ] **Step 5: Commit**

```bash
git add agents/variants/
git commit -m "feat(variants): add agent variant templates for all stack combinations"
```

---

## Chunk 5: Integration Test + Package Update

### Task 9: Add integration test

**Files:**
- Create: `tests/init-integration.test.js`

- [ ] **Step 1: Write integration test**

```javascript
// tests/init-integration.test.js
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-init-'));
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function cleanup(dir) { fs.rmSync(dir, { recursive: true, force: true }); }

describe('init integration', () => {
  let tmpDir;
  afterEach(() => { if (tmpDir) cleanup(tmpDir); });

  it('produces correct config for modern Expo project', () => {
    tmpDir = createTempProject({
      'package.json': {
        name: 'test-expo-app',
        dependencies: {
          'react-native': '0.83.2', 'expo': '~55.0.0',
          'zustand': '^4.5.0', '@tanstack/react-query': '^5.0.0',
          'expo-router': '~4.0.0', '@shopify/flash-list': '^1.6.0',
          'expo-image': '~1.0.0', 'expo-secure-store': '~13.0.0',
          'react-hook-form': '^7.0.0',
        },
        devDependencies: { '@testing-library/react-native': '^12.0.0' },
      },
      'tsconfig.json': '{}',
      'eas.json': '{}',
    });

    execSync(`node ${CLI_PATH} init --yes --profile standard --no-mcp`, {
      encoding: 'utf8',
      cwd: tmpDir,
    });

    // Verify CLAUDE.md
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes('<!-- ERNE-GENERATED -->'));
    assert.ok(claudeMd.includes('Zustand'));
    assert.ok(claudeMd.includes('Expo Router'));

    // Verify settings.json
    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8')
    );
    assert.equal(settings.detection.framework, 'expo-managed');
    assert.equal(settings.detection.stack.state, 'zustand');
    assert.equal(settings.detection.stack.navigation, 'expo-router');

    // Verify agents exist
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'ui-designer.md')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'architect.md')));
    // native-bridge-builder should be skipped for expo-managed
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'native-bridge-builder.md')));

    // Verify rules exist
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'common')));
    assert.ok(fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'expo')));
  });

  it('produces correct config for bare RN project', () => {
    tmpDir = createTempProject({
      'package.json': {
        name: 'test-bare-app',
        dependencies: {
          'react-native': '0.77.3',
          'redux': '^4.0.0', 'redux-saga': '^1.0.0',
          '@react-navigation/native': '^6.0.0',
        },
      },
      'ios/App/AppDelegate.m': '#import <UIKit/UIKit.h>',
      'android/app/src/main/java/com/app/Main.java': 'package com.app;',
      'fastlane/Fastfile': 'lane :deploy do end',
    });

    execSync(`node ${CLI_PATH} init --yes --profile minimal --no-mcp`, {
      encoding: 'utf8',
      cwd: tmpDir,
    });

    const settings = JSON.parse(
      fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8')
    );
    assert.equal(settings.detection.framework, 'bare-rn');
    assert.equal(settings.detection.stack.state, 'redux-saga');
    assert.equal(settings.detection.stack.navigation, 'react-navigation');
    assert.equal(settings.detection.stack.build, 'fastlane');

    // expo-config-resolver should be skipped for bare-rn
    assert.ok(!fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'expo-config-resolver.md')));
  });

  it('appends to existing CLAUDE.md', () => {
    const original = '# My Project\n\nImportant documentation here.\n';
    tmpDir = createTempProject({
      'package.json': {
        name: 'existing-project',
        dependencies: { 'react-native': '0.83.2', 'expo': '~55.0.0' },
      },
      'CLAUDE.md': original,
    });

    execSync(`node ${CLI_PATH} init --yes --no-mcp`, {
      encoding: 'utf8',
      cwd: tmpDir,
    });

    const content = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.startsWith('# My Project'));
    assert.ok(content.includes('Important documentation here.'));
    assert.ok(content.includes('ERNE Configuration'));
    assert.ok(fs.existsSync(path.join(tmpDir, 'CLAUDE.md.pre-erne')));
  });
});
```

- [ ] **Step 2: Run integration test**

Run: `node --test tests/init-integration.test.js`
Expected: All 3 tests PASS

- [ ] **Step 3: Run full test suite**

Run: `node --test tests/*.test.js`
Expected: All tests PASS (cli + detect + claude-md + generate + init-integration)

- [ ] **Step 4: Commit**

```bash
git add tests/init-integration.test.js
git commit -m "test: add integration tests for adaptive init across project types"
```

---

### Task 10: Update package.json and clean up

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Update package.json files array to include variants**

Add `"rules/variants/"` and `"agents/variants/"` to the `files` array in `package.json`.

- [ ] **Step 2: Bump version**

Update version from `"0.4.0"` to `"0.5.0"` in package.json.

- [ ] **Step 3: Run full test suite one final time**

Run: `node --test tests/*.test.js`
Expected: All tests PASS

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "chore: bump to v0.5.0, include variant directories in package"
```
