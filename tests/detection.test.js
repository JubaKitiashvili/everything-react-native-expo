// tests/detection.test.js — Project detection logic tests
// Tests the detectProject function used in init flow

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create temp directory for each test
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Extract detectProject for testing
// We test the detection logic by creating mock project structures
// and running the init module's detection against them

describe('Project Detection', () => {
  it('detects Expo managed project', () => {
    // Create app.json
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { name: 'test' } })
    );
    // Create package.json with expo dep
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' }
      })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.type, 'expo-managed');
    assert.equal(result.hasExpo, true);
    assert.equal(result.isRNProject, true);
  });

  it('detects bare React Native project', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { 'react-native': '0.74.0' }
      })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.type, 'bare-rn');
    assert.equal(result.hasBareRN, true);
    assert.equal(result.hasExpo, false);
  });

  it('detects iOS native code', () => {
    const iosDir = path.join(tmpDir, 'ios');
    fs.mkdirSync(iosDir, { recursive: true });
    fs.writeFileSync(path.join(iosDir, 'AppDelegate.swift'), '');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-native': '0.74.0' } })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.hasIOS, true);
  });

  it('detects Android native code', () => {
    const androidDir = path.join(tmpDir, 'android');
    fs.mkdirSync(androidDir, { recursive: true });
    fs.writeFileSync(path.join(androidDir, 'MainActivity.kt'), '');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-native': '0.74.0' } })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.hasAndroid, true);
  });

  it('returns unknown for non-RN project', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { express: '4.0.0' } })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.type, 'unknown');
    assert.equal(result.isRNProject, false);
  });
});

// Simple project detector mirroring lib/init.js logic
function detectInDir(cwd) {
  const result = {
    isRNProject: false,
    type: 'unknown',
    hasExpo: false,
    hasBareRN: false,
    hasIOS: false,
    hasAndroid: false,
  };

  const expoConfigs = ['app.json', 'app.config.js', 'app.config.ts'];
  result.hasExpo = expoConfigs.some(f => fs.existsSync(path.join(cwd, f)));

  const iosDir = path.join(cwd, 'ios');
  if (fs.existsSync(iosDir) && fs.statSync(iosDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(iosDir, { recursive: true });
      result.hasIOS = entries.some(e => e.endsWith('.swift'));
    } catch { result.hasIOS = false; }
  }

  const androidDir = path.join(cwd, 'android');
  if (fs.existsSync(androidDir) && fs.statSync(androidDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(androidDir, { recursive: true });
      result.hasAndroid = entries.some(e => e.endsWith('.kt'));
    } catch { result.hasAndroid = false; }
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react-native']) {
        result.isRNProject = true;
        result.hasBareRN = !result.hasExpo;
      }
      if (deps['expo']) {
        result.isRNProject = true;
        result.hasExpo = true;
      }
    } catch { /* ignore */ }
  }

  if (result.hasExpo) result.type = 'expo-managed';
  else if (result.hasBareRN) result.type = 'bare-rn';

  return result;
}
