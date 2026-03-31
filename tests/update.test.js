// tests/update.test.js — Tests for the update command
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

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

describe('update — version comparison', () => {
  it('exports a function', () => {
    const update = require('../lib/update');
    assert.equal(typeof update, 'function');
  });

  it('reports "Already up to date" when local matches remote', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    // Mock execSync to return the same version as local package.json
    const localVersion = require('../package.json').version;
    const childProcess = require('child_process');
    const origExecSync = childProcess.execSync;
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('npm view')) return `${localVersion}\n`;
      if (cmd.includes('npm i -g')) throw new Error('should not install');
      return origExecSync(cmd, opts);
    };

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes('Already up to date'), 'Should report up to date');
    } finally {
      console.log = origLog;
      childProcess.execSync = origExecSync;
      delete require.cache[require.resolve('../lib/update')];
    }
  });

  it('displays installed version from package.json', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const localVersion = require('../package.json').version;
    const childProcess = require('child_process');
    const origExecSync = childProcess.execSync;
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('npm view')) return `${localVersion}\n`;
      return origExecSync(cmd, opts);
    };

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes(localVersion), 'Should display installed version');
    } finally {
      console.log = origLog;
      childProcess.execSync = origExecSync;
      delete require.cache[require.resolve('../lib/update')];
    }
  });
});

describe('update — npm registry errors', () => {
  it('handles npm registry failure gracefully', async () => {
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const childProcess = require('child_process');
    const origExecSync = childProcess.execSync;
    childProcess.execSync = (cmd) => {
      if (cmd.includes('npm view')) throw new Error('network timeout');
      throw new Error('unexpected command');
    };

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes('Could not check npm'), 'Should handle npm error gracefully');
    } finally {
      console.log = origLog;
      childProcess.execSync = origExecSync;
      delete require.cache[require.resolve('../lib/update')];
    }
  });

  it('suggests erne init when project has no settings', async () => {
    const dir = createTempDir();
    const logs = [];
    const origLog = console.log;
    console.log = (...args) => logs.push(args.join(' '));

    const origCwd = process.cwd;
    process.cwd = () => dir;

    const childProcess = require('child_process');
    const origExecSync = childProcess.execSync;
    childProcess.execSync = (cmd, opts) => {
      if (cmd.includes('npm view')) return '99.99.99\n';
      if (cmd.includes('npm i -g')) return ''; // mock successful install
      if (cmd === 'erne init') return ''; // mock init
      return origExecSync(cmd, opts);
    };

    try {
      delete require.cache[require.resolve('../lib/update')];
      const update = require('../lib/update');
      await update();

      const output = logs.join('\n');
      assert.ok(output.includes('erne init'), 'Should suggest erne init for uninitialized project');
    } finally {
      console.log = origLog;
      process.cwd = origCwd;
      childProcess.execSync = origExecSync;
      delete require.cache[require.resolve('../lib/update')];
    }
  });
});
