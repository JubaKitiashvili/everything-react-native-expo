'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runHook, createTempProject, cleanupTempProject } = require('./helpers');

describe('pre-edit-test-gate', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  it('passes when no test file exists for source file', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export const add = (a, b) => a + b;\n');
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'utils.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('passes when related test file exists and passes', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'module.exports.add = (a, b) => a + b;\n');
    const testDir = path.join(projectDir, '__tests__');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'utils.test.ts'), `
      const { add } = require('../src/utils');
      test('add works', () => { expect(add(1,2)).toBe(3); });
    `);
    // Create a fake jest binary so npx resolves locally (avoids download timeout on CI)
    const binDir = path.join(projectDir, 'node_modules', '.bin');
    fs.mkdirSync(binDir, { recursive: true });
    fs.writeFileSync(path.join(binDir, 'jest'), '#!/usr/bin/env node\nprocess.exit(0);\n', { mode: 0o755 });
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      devDependencies: { jest: '29.7.0' },
    }));
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'utils.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.ok([0, 2].includes(result.exitCode));
  });

  it('skips test files', () => {
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/__tests__/foo.test.ts' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips non-JS/TS files', () => {
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/README.md' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path in input', () => {
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('security-scan', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  it('warns on hardcoded API keys', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'config.ts'), `
      const API_KEY = 'sk-1234567890abcdef1234567890abcdef';
      export default { API_KEY };
    `);
    const result = runHook('security-scan.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(srcDir, 'config.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('secret'));
  });

  it('warns on unvalidated deep link handling', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'linking.ts'), `
      import { Linking } from 'react-native';
      Linking.openURL(url);
    `);
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'linking.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('deep link'));
  });

  it('passes on clean file', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `);
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'utils.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('warns on eval usage', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'dynamic.ts'), `
      const result = eval(userInput);
    `);
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'dynamic.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('unsafe'));
  });

  it('skips non-JS/TS files', () => {
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/assets/image.png' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path', () => {
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('bundle-size-check (merged performance-budget)', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  it('warns when package.json adds large dependency', () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: { 'react-native': '0.76.0', 'moment': '2.30.0' },
    }));
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(projectDir, 'package.json') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('moment'));
  });

  it('warns on bundle size exceeding budget', () => {
    fs.writeFileSync(path.join(projectDir, '.erne-budget.json'), JSON.stringify({
      maxBundleSizeKB: 500, maxDependencies: 5,
    }));
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: { 'react-native': '0.76.0', 'dep1': '1.0.0', 'dep2': '1.0.0', 'dep3': '1.0.0', 'dep4': '1.0.0', 'dep5': '1.0.0', 'dep6': '1.0.0' },
    }));
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(projectDir, 'package.json') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('dependencies'));
  });

  it('passes when within budget', () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: { 'react-native': '0.76.0', 'expo': '52.0.0' },
    }));
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(projectDir, 'package.json') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips non-package.json files', () => {
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('native-compat-check', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  it('warns when ios dir exists but android does not', () => {
    fs.mkdirSync(path.join(projectDir, 'ios'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'ios', 'App.swift'), 'import UIKit\n');
    const result = runHook('native-compat-check.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, 'ios', 'App.swift') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('android'));
  });

  it('warns when android dir exists but ios does not', () => {
    fs.mkdirSync(path.join(projectDir, 'android', 'app', 'src'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'android', 'app', 'src', 'Main.kt'), 'package com.app\n');
    const result = runHook('native-compat-check.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, 'android', 'app', 'src', 'Main.kt') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('ios'));
  });

  it('passes when both platforms present', () => {
    fs.mkdirSync(path.join(projectDir, 'ios'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'android'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'ios', 'App.swift'), 'import UIKit\n');
    fs.writeFileSync(path.join(projectDir, 'android', 'Main.kt'), 'package com.app\n');
    const result = runHook('native-compat-check.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, 'ios', 'App.swift') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('passes when editing non-native file', () => {
    const result = runHook('native-compat-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/App.tsx' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path', () => {
    const result = runHook('native-compat-check.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });
});

describe('accessibility-check', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  it('warns on TouchableOpacity without accessibilityLabel', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Button.tsx'), `
      import { TouchableOpacity, Text } from 'react-native';
      export const Button = () => (
        <TouchableOpacity onPress={() => {}}>
          <Text>Click me</Text>
        </TouchableOpacity>
      );
    `);
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Button.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('accessibility'));
  });

  it('passes when accessibilityLabel is present', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Button.tsx'), `
      import { TouchableOpacity, Text } from 'react-native';
      export const Button = () => (
        <TouchableOpacity onPress={() => {}} accessibilityLabel="Submit">
          <Text>Click me</Text>
        </TouchableOpacity>
      );
    `);
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Button.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('warns on Pressable without accessibilityRole', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Card.tsx'), `
      import { Pressable, Text } from 'react-native';
      export const Card = () => (
        <Pressable onPress={() => {}}>
          <Text>Tap me</Text>
        </Pressable>
      );
    `);
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Card.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('accessibility'));
  });

  it('warns on Image without accessible or alt', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Avatar.tsx'), `
      import { Image } from 'react-native';
      export const Avatar = () => (
        <Image source={{ uri: 'https://example.com/avatar.png' }} />
      );
    `);
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Avatar.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 2);
    assert.ok(result.stderr.includes('accessibility'));
  });

  it('skips non-JSX files', () => {
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/utils.ts' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips test files', () => {
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/__tests__/Button.test.tsx' },
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path', () => {
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });
    assert.strictEqual(result.exitCode, 0);
  });
});
