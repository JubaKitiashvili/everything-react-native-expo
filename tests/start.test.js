// tests/start.test.js — Tests for the start command
'use strict';

const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');

// ─── Module basics ───

describe('start — module', () => {
  it('exports a function', () => {
    const start = require('../lib/start');
    assert.equal(typeof start, 'function');
  });

  it('exported function is async (returns promise-like)', () => {
    const start = require('../lib/start');
    assert.equal(start.constructor.name, 'AsyncFunction');
  });

  it('module loads without errors', () => {
    assert.doesNotThrow(() => {
      require('../lib/start');
    });
  });
});

// ─── Constants ───

describe('start — internal constants', () => {
  it('references dashboard server.js path', () => {
    const serverPath = path.resolve(__dirname, '..', 'dashboard', 'server.js');
    assert.ok(fs.existsSync(serverPath), 'dashboard/server.js should exist');
  });

  it('references init module', () => {
    assert.doesNotThrow(() => {
      require('../lib/init');
    });
  });
});

// ─── Integration ───

describe('start — integration', () => {
  it('dashboard module should export a function', () => {
    const dashboard = require('../lib/dashboard');
    assert.equal(typeof dashboard, 'function');
  });

  it('init module should export a function', () => {
    const init = require('../lib/init');
    assert.equal(typeof init, 'function');
  });

  it('default port should be 3333', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'start.js'), 'utf8');
    assert.ok(src.includes('3333'), 'Default port should be 3333');
  });

  it('should use fork for process management', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'start.js'), 'utf8');
    assert.ok(src.includes('fork'), 'Should use child_process.fork');
    assert.ok(src.includes('detached: true'), 'Should run detached');
    assert.ok(src.includes('child.unref()'), 'Should unref the child process');
  });

  it('should set ERNE_DASHBOARD_PORT env var', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'lib', 'start.js'), 'utf8');
    assert.ok(src.includes('ERNE_DASHBOARD_PORT'), 'Should pass port via env');
  });
});
