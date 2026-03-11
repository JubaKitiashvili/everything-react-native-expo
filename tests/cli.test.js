// tests/cli.test.js — CLI entry point tests
// Uses Node.js built-in test runner (node --test)

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');

describe('CLI', () => {
  it('shows version', () => {
    const output = execSync(`node ${CLI_PATH} version`, { encoding: 'utf8' });
    assert.match(output, /erne v\d+\.\d+\.\d+/);
  });

  it('shows help', () => {
    const output = execSync(`node ${CLI_PATH} help`, { encoding: 'utf8' });
    assert.ok(output.includes('erne'));
    assert.ok(output.includes('init'));
    assert.ok(output.includes('update'));
  });

  it('shows help for no arguments', () => {
    const output = execSync(`node ${CLI_PATH}`, { encoding: 'utf8' });
    assert.ok(output.includes('erne'));
  });

  it('errors on unknown command', () => {
    assert.throws(() => {
      execSync(`node ${CLI_PATH} nonexistent`, { encoding: 'utf8' });
    });
  });
});

// ─── Command recognition ───

describe('CLI — command recognition', () => {
  it('recognizes "init" command (module loads)', () => {
    // init requires interactive input, so we just verify the module loads
    const init = require('../lib/init');
    assert.equal(typeof init, 'function');
  });

  it('recognizes "update" command (module loads)', () => {
    const update = require('../lib/update');
    assert.equal(typeof update, 'function');
  });

  it('recognizes "dashboard" command (module loads)', () => {
    const dashboard = require('../lib/dashboard');
    assert.equal(typeof dashboard, 'function');
  });

  it('recognizes "start" command (module loads)', () => {
    const start = require('../lib/start');
    assert.equal(typeof start, 'function');
  });

  it('help output lists all commands', () => {
    const output = execSync(`node ${CLI_PATH} help`, { encoding: 'utf8' });
    assert.ok(output.includes('init'), 'Help should mention init');
    assert.ok(output.includes('update'), 'Help should mention update');
    assert.ok(output.includes('dashboard'), 'Help should mention dashboard');
    assert.ok(output.includes('start'), 'Help should mention start');
    assert.ok(output.includes('version'), 'Help should mention version');
    assert.ok(output.includes('help'), 'Help should mention help');
  });

  it('unknown command exits with non-zero code', () => {
    try {
      execSync(`node ${CLI_PATH} foobar`, { encoding: 'utf8', stdio: 'pipe' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.status !== 0, 'Should exit with non-zero status');
      assert.ok(err.stderr.includes('Unknown command'), 'Should mention unknown command');
    }
  });

  it('unknown command suggests help', () => {
    try {
      execSync(`node ${CLI_PATH} badcmd`, { encoding: 'utf8', stdio: 'pipe' });
      assert.fail('Should have thrown');
    } catch (err) {
      assert.ok(err.stderr.includes('help'), 'Should suggest running help');
    }
  });
});
