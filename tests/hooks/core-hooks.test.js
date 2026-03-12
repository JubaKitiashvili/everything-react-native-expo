'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('session-start.js', () => {
  it('detects expo project from package.json dependencies', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { expo: '~51.0.0', react: '18.2.0' },
      }),
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('expo'));
      assert.ok(result.stdout.includes('common'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('detects expo from devDependencies', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        devDependencies: { expo: '~51.0.0' },
      }),
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('expo'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('detects bare-rn project (ios + android dirs, no expo)', () => {
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
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('bare-rn'));
      assert.ok(result.stdout.includes('common'));
      assert.ok(!result.stdout.includes('expo'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('detects native-ios layer from Swift files', () => {
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
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('native-ios'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('detects native-android layer from Kotlin files', () => {
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
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('native-android'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('detects ejected expo (expo + native code)', () => {
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
      assert.strictEqual(result.exitCode, 0);
      assert.ok(result.stdout.includes('expo'));
      assert.ok(!result.stdout.includes('bare-rn'));
      assert.ok(result.stdout.includes('native-ios'));
      assert.ok(result.stdout.includes('native-android'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('warns when no project signals found', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 2);
      assert.ok(result.stdout.includes('common'));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('warns when no package.json found', () => {
    const dir = createTempProject({
      'README.md': '# hello',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 2);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('post-edit-format.js', () => {
  it('exits 0 for supported file extension', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x=1;',
      'node_modules/.bin/prettier': '',
    });
    try {
      const result = runHook('post-edit-format.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('skips unsupported file extensions silently', () => {
    const result = runHook('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/some/image.png' },
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when no file path in stdin', () => {
    const result = runHook('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: {},
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('skips when stdin is empty', () => {
    const result = runHook('post-edit-format.js', {});
    assert.strictEqual(result.exitCode, 0);
  });

  it('handles missing tool_input gracefully', () => {
    const result = runHook('post-edit-format.js', {
      tool_name: 'Write',
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('formats .json files', () => {
    const dir = createTempProject({
      'config.json': '{"a":1}',
    });
    try {
      const result = runHook('post-edit-format.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'config.json') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('formats .css files', () => {
    const dir = createTempProject({
      'styles.css': 'body{color:red}',
    });
    try {
      const result = runHook('post-edit-format.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'styles.css') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.ok([0, 2].includes(result.exitCode));
    } finally {
      cleanupTempProject(dir);
    }
  });
});
