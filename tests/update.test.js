// tests/update.test.js — Tests for the update command
'use strict';

const { describe, it, afterEach, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const tempDirs = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-update-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── Version comparison logic ───

describe('update — version comparison', () => {
  it('exports a function', () => {
    const update = require('../lib/update');
    assert.equal(typeof update, 'function');
  });

  it('returns early when settings.json is missing', async () => {
    const dir = createTempDir();
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const origCwd = process.cwd;
    process.cwd = () => dir;

    try {
      // Re-require to get a fresh module with mocked cwd
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes('ERNE not found'), 'Should warn about missing ERNE');
      assert.ok(output.includes('erne-universal init'), 'Should suggest init');
    } finally {
      console.log = origLog;
      process.cwd = origCwd;
      delete require.cache[require.resolve('../lib/update')];
    }
  });

  it('reports "Already up to date" when versions match', async () => {
    const dir = createTempDir();
    const claudeDir = path.join(dir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });

    // Get current npm version
    let npmVersion;
    try {
      npmVersion = execSync('npm view erne-universal version', { encoding: 'utf8', timeout: 10000 }).trim();
    } catch {
      // If npm registry is unreachable, skip this test gracefully
      return;
    }

    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ erneVersion: npmVersion })
    );

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const origCwd = process.cwd;
    process.cwd = () => dir;

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes('Already up to date'), 'Should report up to date');
    } finally {
      console.log = origLog;
      process.cwd = origCwd;
      delete require.cache[require.resolve('../lib/update')];
    }
  });
});

// ─── npm registry error handling ───

describe('update — npm registry errors', () => {
  it('handles npm registry failure gracefully', async () => {
    const dir = createTempDir();
    const claudeDir = path.join(dir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ erneVersion: '0.0.1' })
    );

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const origCwd = process.cwd;
    process.cwd = () => dir;

    // Mock execSync to simulate npm failure
    const childProcess = require('child_process');
    const origExecSync = childProcess.execSync;
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('npm view')) {
        throw new Error('network timeout');
      }
      return origExecSync(cmd, opts);
    };

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(
        output.includes('Could not check npm') || output.includes('erne.dev'),
        'Should handle npm error gracefully'
      );
    } finally {
      console.log = origLog;
      process.cwd = origCwd;
      childProcess.execSync = origExecSync;
      delete require.cache[require.resolve('../lib/update')];
    }
  });

  it('reads and displays current version from settings.json', async () => {
    const dir = createTempDir();
    const claudeDir = path.join(dir, '.claude');
    fs.mkdirSync(claudeDir, { recursive: true });
    fs.writeFileSync(
      path.join(claudeDir, 'settings.json'),
      JSON.stringify({ erneVersion: '1.2.3' })
    );

    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const origCwd = process.cwd;
    process.cwd = () => dir;

    // Mock execSync to avoid actual npm call
    const childProcess = require('child_process');
    const origExecSync = childProcess.execSync;
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('npm view')) {
        return '1.2.3\n';
      }
      return origExecSync(cmd, opts);
    };

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes('1.2.3'), 'Should display current version');
    } finally {
      console.log = origLog;
      process.cwd = origCwd;
      childProcess.execSync = origExecSync;
      delete require.cache[require.resolve('../lib/update')];
    }
  });
});
