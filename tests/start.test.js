// tests/start.test.js — Tests for the start command
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

// ─── Module basics ───

describe('start — module', () => {
  it('exports a function', () => {
    const start = require('../lib/start');
    assert.equal(typeof start, 'function');
  });

  it('exported function is async (returns promise-like)', () => {
    const start = require('../lib/start');
    // Async functions have constructor name AsyncFunction
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
    const fs = require('fs');
    const serverPath = path.resolve(__dirname, '..', 'dashboard', 'server.js');
    // The server.js file should exist for start to work
    assert.ok(fs.existsSync(serverPath), 'dashboard/server.js should exist');
  });

  it('references init module', () => {
    // init module should be loadable
    assert.doesNotThrow(() => {
      require('../lib/init');
    });
  });
});
