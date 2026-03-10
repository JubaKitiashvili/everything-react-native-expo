'use strict';
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('session-start.js', () => {
  test('detects expo project from package.json dependencies', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { expo: '~51.0.0', react: '18.2.0' },
      }),
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('expo');
      expect(result.stdout).toContain('common');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects expo from devDependencies', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        devDependencies: { expo: '~51.0.0' },
      }),
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('expo');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects bare-rn project (ios + android dirs, no expo)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'react-native': '0.74.0' },
      }),
      'ios/Podfile': 'platform :ios',
      'android/build.gradle': 'buildscript {}',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bare-rn');
      expect(result.stdout).toContain('common');
      expect(result.stdout).not.toContain('expo');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects native-ios layer from Swift files', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'react-native': '0.74.0' },
      }),
      'ios/App/AppDelegate.swift': 'import UIKit',
      'android/build.gradle': 'buildscript {}',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('native-ios');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects native-android layer from Kotlin files', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'react-native': '0.74.0' },
      }),
      'ios/Podfile': 'platform :ios',
      'android/app/src/main/java/com/app/Main.kt': 'package com.app',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('native-android');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects ejected expo (expo + native code)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' },
      }),
      'ios/App/AppDelegate.swift': 'import UIKit',
      'android/app/src/main/java/com/app/Main.kt': 'package com.app',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('expo');
      expect(result.stdout).not.toContain('bare-rn');
      expect(result.stdout).toContain('native-ios');
      expect(result.stdout).toContain('native-android');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('warns when no project signals found', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('common');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('warns when no package.json found', () => {
    const dir = createTempProject({
      'README.md': '# hello',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2);
    } finally {
      cleanupTempProject(dir);
    }
  });
});
