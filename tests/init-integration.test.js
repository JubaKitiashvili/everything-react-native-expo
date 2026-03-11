// tests/init-integration.test.js — Integration tests for `erne init` across project types
// Uses Node.js built-in test runner (node --test)

'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');

const tempDirs = [];

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-init-'));
  tempDirs.push(dir);
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

function cleanupTempDirs() {
  for (const dir of tempDirs) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch { /* ignore */ }
  }
  tempDirs.length = 0;
}

function runInit(cwd) {
  return execSync(`node ${CLI_PATH} init --yes --profile standard --no-mcp`, {
    encoding: 'utf8',
    cwd,
    timeout: 30000,
  });
}

describe('init integration', () => {
  afterEach(() => {
    cleanupTempDirs();
  });

  it('modern Expo project — generates correct config, agents, and rules', () => {
    const tmpDir = createTempProject({
      'package.json': {
        name: 'modern-expo-app',
        dependencies: {
          'react-native': '0.74.0',
          'expo': '~51.0.0',
          'zustand': '^4.5.0',
          '@tanstack/react-query': '^5.0.0',
          'expo-router': '~3.5.0',
          '@shopify/flash-list': '^1.6.0',
          'expo-image': '~1.12.0',
          'expo-secure-store': '~13.0.0',
          'react-hook-form': '^7.50.0',
        },
        devDependencies: {
          '@testing-library/react-native': '^12.4.0',
        },
      },
      'tsconfig.json': '{}',
      'eas.json': '{}',
    });

    runInit(tmpDir);

    // Verify CLAUDE.md exists with ERNE marker and mentions Zustand and Expo Router
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.includes('<!-- ERNE-GENERATED -->'), 'CLAUDE.md should contain ERNE-GENERATED marker');
    assert.ok(claudeMd.includes('Zustand'), 'CLAUDE.md should mention Zustand');
    assert.ok(claudeMd.includes('Expo Router'), 'CLAUDE.md should mention Expo Router');

    // Verify settings.json
    const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.detection.framework, 'expo-managed', 'framework should be expo-managed');
    assert.equal(settings.detection.stack.state, 'zustand', 'state should be zustand');
    assert.equal(settings.detection.stack.navigation, 'expo-router', 'navigation should be expo-router');

    // Verify agents exist
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'ui-designer.md')),
      'ui-designer.md agent should exist',
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'architect.md')),
      'architect.md agent should exist',
    );

    // native-bridge-builder should NOT exist for expo-managed
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'native-bridge-builder.md')),
      'native-bridge-builder.md should NOT exist for expo-managed',
    );

    // Verify rule layers
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'common')),
      '.claude/rules/common/ should exist',
    );
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'expo')),
      '.claude/rules/expo/ should exist',
    );
  });

  it('bare RN project — generates correct config, skips expo agents', () => {
    const tmpDir = createTempProject({
      'package.json': {
        name: 'bare-rn-app',
        dependencies: {
          'react-native': '0.73.0',
          'redux': '^5.0.0',
          'redux-saga': '^1.3.0',
          '@react-navigation/native': '^6.1.0',
        },
        devDependencies: {},
      },
      'ios/AppDelegate.m': '// native iOS file',
      'android/Main.java': '// native Android file',
      'fastlane/Fastfile': '// fastlane config',
    });

    runInit(tmpDir);

    // Verify settings.json
    const settings = JSON.parse(fs.readFileSync(path.join(tmpDir, '.claude', 'settings.json'), 'utf8'));
    assert.equal(settings.detection.framework, 'bare-rn', 'framework should be bare-rn');
    assert.equal(settings.detection.stack.state, 'redux-saga', 'state should be redux-saga');
    assert.equal(settings.detection.stack.navigation, 'react-navigation', 'navigation should be react-navigation');
    assert.equal(settings.detection.stack.build, 'fastlane', 'build should be fastlane');

    // expo-config-resolver should NOT exist for bare-rn
    assert.ok(
      !fs.existsSync(path.join(tmpDir, '.claude', 'agents', 'expo-config-resolver.md')),
      'expo-config-resolver.md should NOT exist for bare-rn',
    );

    // bare-rn rule layer should exist
    assert.ok(
      fs.existsSync(path.join(tmpDir, '.claude', 'rules', 'bare-rn')),
      '.claude/rules/bare-rn/ should exist',
    );
  });

  it('existing CLAUDE.md — appends ERNE config and creates backup', () => {
    const originalContent = '# My Project\n\nThis is my existing CLAUDE.md content.\n';
    const tmpDir = createTempProject({
      'package.json': {
        name: 'existing-claude-md-app',
        dependencies: {
          'react-native': '0.74.0',
          'expo': '~51.0.0',
        },
        devDependencies: {},
      },
    });

    // Write pre-existing CLAUDE.md
    fs.writeFileSync(path.join(tmpDir, 'CLAUDE.md'), originalContent);

    runInit(tmpDir);

    // CLAUDE.md should start with original content
    const claudeMd = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md'), 'utf8');
    assert.ok(claudeMd.startsWith('# My Project'), 'CLAUDE.md should start with original content');

    // CLAUDE.md should also contain ERNE Configuration
    assert.ok(claudeMd.includes('ERNE Configuration'), 'CLAUDE.md should contain ERNE Configuration section');

    // Backup should exist
    assert.ok(
      fs.existsSync(path.join(tmpDir, 'CLAUDE.md.pre-erne')),
      'CLAUDE.md.pre-erne backup should exist',
    );

    // Backup should contain the original content
    const backup = fs.readFileSync(path.join(tmpDir, 'CLAUDE.md.pre-erne'), 'utf8');
    assert.equal(backup, originalContent, 'backup should contain original content');
  });
});
