// tests/detect.test.js — Comprehensive tests for deep stack detection
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { detectProject } = require('../lib/detect');

const tempDirs = [];

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
  tempDirs.push(dir);
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Framework Detection ───

describe('Framework detection', () => {
  it('detects expo-managed project', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.isRNProject, true);
    assert.equal(result.framework, 'expo-managed');
  });

  it('detects expo-bare project with iOS native code', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'ios/AppDelegate.swift': 'import UIKit',
    });
    const result = detectProject(dir);
    assert.equal(result.isRNProject, true);
    assert.equal(result.framework, 'expo-bare');
  });

  it('detects expo-bare project with Android native code', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'android/MainActivity.kt': 'package com.test',
    });
    const result = detectProject(dir);
    assert.equal(result.framework, 'expo-bare');
  });

  it('detects expo-bare with .m files', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'ios/AppDelegate.m': '#import <UIKit/UIKit.h>',
    });
    const result = detectProject(dir);
    assert.equal(result.framework, 'expo-bare');
  });

  it('detects expo-bare with .mm files', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'ios/Module.mm': '// obj-c++',
    });
    const result = detectProject(dir);
    assert.equal(result.framework, 'expo-bare');
  });

  it('detects expo-bare with .java files', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'android/app/src/main/java/Main.java': 'public class Main {}',
    });
    const result = detectProject(dir);
    assert.equal(result.framework, 'expo-bare');
  });

  it('detects bare-rn project', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.isRNProject, true);
    assert.equal(result.framework, 'bare-rn');
  });

  it('does not false-positive on app.json without expo dep', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'app.json': { expo: { name: 'test' } },
    });
    const result = detectProject(dir);
    assert.equal(result.framework, 'bare-rn');
  });

  it('returns unknown for non-RN project', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { express: '4.0.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.isRNProject, false);
    assert.equal(result.framework, 'unknown');
  });
});

// ─── Stack Detection ───

describe('Stack detection', () => {
  it('detects zustand + tanstack-query', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: {
          expo: '~51.0.0', 'react-native': '0.74.0',
          zustand: '^4.0.0', '@tanstack/react-query': '^5.0.0',
        },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.state, 'zustand');
    assert.equal(result.stack.serverState, 'tanstack-query');
  });

  it('detects redux-saga', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'redux-saga': '^1.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.state, 'redux-saga');
  });

  it('detects redux-toolkit', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', '@reduxjs/toolkit': '^2.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.state, 'redux-toolkit');
  });

  it('prioritizes zustand over redux when both present', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: {
          'react-native': '0.74.0',
          zustand: '^4.0.0',
          '@reduxjs/toolkit': '^2.0.0',
          'redux-saga': '^1.0.0',
        },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.state, 'zustand');
  });

  it('detects mobx', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'mobx-react-lite': '^4.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.state, 'mobx');
  });

  it('detects swr', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', swr: '^2.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.serverState, 'swr');
  });

  it('detects expo-router', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0', 'expo-router': '~3.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.navigation, 'expo-router');
  });

  it('detects react-navigation', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', '@react-navigation/native': '^6.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.navigation, 'react-navigation');
  });

  it('detects nativewind styling', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', nativewind: '^4.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.styling, 'nativewind');
  });

  it('defaults to stylesheet styling', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.styling, 'stylesheet');
  });

  it('detects tamagui styling', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', tamagui: '^1.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.styling, 'tamagui');
  });

  it('detects unistyles styling', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'react-native-unistyles': '^2.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.styling, 'unistyles');
  });

  it('detects flashlist', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', '@shopify/flash-list': '^1.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.lists, 'flashlist');
  });

  it('defaults to flatlist', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.lists, 'flatlist');
  });

  it('detects expo-image', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0', 'expo-image': '~1.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.images, 'expo-image');
  });

  it('detects fast-image', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'react-native-fast-image': '^8.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.images, 'fast-image');
  });

  it('defaults to rn-image', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.images, 'rn-image');
  });

  it('detects react-hook-form', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'react-hook-form': '^7.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.forms, 'react-hook-form');
  });

  it('detects formik', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', formik: '^2.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.forms, 'formik');
  });

  it('detects redux-form', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'redux-form': '^8.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.forms, 'redux-form');
  });

  it('detects expo-secure-store', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0', 'expo-secure-store': '~12.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.storage, 'expo-secure-store');
  });

  it('detects rn-keychain', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0', 'react-native-keychain': '^8.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.storage, 'rn-keychain');
  });

  it('defaults to async-storage', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.storage, 'async-storage');
  });

  it('detects jest-rntl testing', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0' },
        devDependencies: { '@testing-library/react-native': '^12.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.testing, 'jest-rntl');
  });

  it('detects detox testing', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0' },
        devDependencies: { detox: '^20.0.0' },
      },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.testing, 'jest-detox');
  });

  it('detects EAS build', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'eas.json': { build: { production: {} } },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.build, 'eas');
  });

  it('detects fastlane build', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'fastlane/Fastfile': 'lane :deploy do end',
    });
    const result = detectProject(dir);
    assert.equal(result.stack.build, 'fastlane');
  });

  it('defaults to manual build', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.stack.build, 'manual');
  });
});

// ─── Metadata Detection ───

describe('Metadata detection', () => {
  it('detects lerna monorepo', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'lerna.json': { version: '0.0.0' },
    });
    const result = detectProject(dir);
    assert.equal(result.hasMonorepo, true);
  });

  it('detects pnpm-workspace monorepo (.yaml)', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'pnpm-workspace.yaml': 'packages:\n  - apps/*',
    });
    const result = detectProject(dir);
    assert.equal(result.hasMonorepo, true);
  });

  it('detects pnpm-workspace monorepo (.yml)', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'pnpm-workspace.yml': 'packages:\n  - apps/*',
    });
    const result = detectProject(dir);
    assert.equal(result.hasMonorepo, true);
  });

  it('detects npm workspaces monorepo', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0' },
        workspaces: ['packages/*'],
      },
    });
    const result = detectProject(dir);
    assert.equal(result.hasMonorepo, true);
  });

  it('detects nx monorepo', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'nx.json': { npmScope: 'test' },
    });
    const result = detectProject(dir);
    assert.equal(result.hasMonorepo, true);
  });

  it('detects rush monorepo', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'rush.json': { rushVersion: '5.0.0' },
    });
    const result = detectProject(dir);
    assert.equal(result.hasMonorepo, true);
  });

  it('detects typescript', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'tsconfig.json': { compilerOptions: { strict: true } },
    });
    const result = detectProject(dir);
    assert.equal(result.hasTypescript, true);
  });

  it('detects existing CLAUDE.md', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'CLAUDE.md': '# Project instructions',
    });
    const result = detectProject(dir);
    assert.equal(result.existingClaudeMd, true);
  });

  it('detects functional components', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'src/App.tsx': 'export const App = () => <View />',
      'src/Home.tsx': 'export const Home = () => <Text>Hi</Text>',
    });
    const result = detectProject(dir);
    assert.equal(result.componentStyle, 'functional');
  });

  it('detects mixed components', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'src/App.tsx': 'export const App = () => <View />',
      'src/Home.tsx': 'export const Home = () => <Text>Hi</Text>',
      'src/Legacy.tsx': 'class Legacy extends React.Component { render() { return null; } }',
    });
    const result = detectProject(dir);
    assert.equal(result.componentStyle, 'mixed');
  });

  it('detects class components when majority', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
      'src/A.tsx': 'class A extends Component { render() {} }',
      'src/B.tsx': 'class B extends React.PureComponent { render() {} }',
      'src/C.tsx': 'class C extends React.Component { render() {} }',
      'src/D.tsx': 'export const D = () => <View />',
    });
    const result = detectProject(dir);
    assert.equal(result.componentStyle, 'class');
  });

  it('detects hasNewArch from app.json', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'app.json': { expo: { plugins: [['expo-build-properties', { android: { newArchEnabled: true } }]] } },
    });
    const result = detectProject(dir);
    assert.equal(result.hasNewArch, true);
  });

  it('detects hasNewArch from package.json', () => {
    const dir = createTempProject({
      'package.json': {
        dependencies: { 'react-native': '0.74.0' },
        reactNativeNewArchEnabled: true,
      },
    });
    const result = detectProject(dir);
    assert.equal(result.hasNewArch, true);
  });

  it('detects hasNewArch from iOS native files', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' } },
      'ios/AppDelegate.swift': 'class AppDelegate: RCTAppDelegate { }',
    });
    const result = detectProject(dir);
    assert.equal(result.hasNewArch, true);
  });

  it('hasNewArch defaults to false', () => {
    const dir = createTempProject({
      'package.json': { dependencies: { 'react-native': '0.74.0' } },
    });
    const result = detectProject(dir);
    assert.equal(result.hasNewArch, false);
  });
});

// ─── Error Handling ───

describe('Error handling', () => {
  it('handles missing package.json', () => {
    const dir = createTempProject({});
    const result = detectProject(dir);
    assert.equal(result.isRNProject, false);
    assert.equal(result.framework, 'unknown');
    assert.equal(result.stack.state, 'none');
  });

  it('handles corrupt package.json', () => {
    const dir = createTempProject({
      'package.json': '{ invalid json content !!!',
    });
    const result = detectProject(dir);
    assert.equal(result.isRNProject, false);
    assert.equal(result.framework, 'unknown');
  });
});
