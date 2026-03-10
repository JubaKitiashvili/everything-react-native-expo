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
