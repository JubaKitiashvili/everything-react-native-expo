'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');


describe('continuous-learning-observer.js', () => {
  it('creates observations file and appends entry', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('continuous-learning-observer.js', {
        stop_reason: 'end_turn',
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 0);

      const obsPath = path.join(dir, '.claude', 'erne', 'observations.jsonl');
      assert.ok(fs.existsSync(obsPath));

      const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
      assert.strictEqual(lines.length, 1);

      const entry = JSON.parse(lines[0]);
      assert.ok(entry.timestamp !== undefined, 'entry should have timestamp');
      assert.strictEqual(entry.stop_reason, 'end_turn');
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('appends to existing observations file', () => {
    const dir = createTempProject({
      '.claude/erne/observations.jsonl':
        JSON.stringify({ timestamp: '2025-01-01', stop_reason: 'old' }) + '\n',
    });
    try {
      const result = runHook('continuous-learning-observer.js', {
        stop_reason: 'end_turn',
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 0);

      const obsPath = path.join(dir, '.claude', 'erne', 'observations.jsonl');
      const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
      assert.strictEqual(lines.length, 2);

      const latest = JSON.parse(lines[1]);
      assert.strictEqual(latest.stop_reason, 'end_turn');
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('always exits 0 even with empty stdin', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('continuous-learning-observer.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      assert.strictEqual(result.exitCode, 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('always exits 0 even if write fails (read-only dir)', () => {
    const result = runHook('continuous-learning-observer.js', {
      stop_reason: 'end_turn',
    }, {
      ERNE_PROJECT_DIR: '/nonexistent/path/that/does/not/exist',
    });
    assert.strictEqual(result.exitCode, 0);
  });

  it('records timestamp in ISO format', () => {
    const dir = createTempProject({});
    try {
      runHook('continuous-learning-observer.js', {
        stop_reason: 'end_turn',
      }, {
        ERNE_PROJECT_DIR: dir,
      });

      const obsPath = path.join(dir, '.claude', 'erne', 'observations.jsonl');
      const entry = JSON.parse(
        fs.readFileSync(obsPath, 'utf8').trim()
      );
      assert.strictEqual(new Date(entry.timestamp).toISOString(), entry.timestamp);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('evaluate-session.js', () => {
  it('creates session evaluation file', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('evaluate-session.js', {
        stop_reason: 'end_turn',
      }, { ERNE_PROJECT_DIR: dir });
      assert.strictEqual(result.exitCode, 0);

      const evalDir = path.join(dir, '.claude', 'erne');
      const files = fs.readdirSync(evalDir);
      const evalFiles = files.filter(f => f.startsWith('session-'));
      assert.ok(evalFiles.length > 0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  it('always exits 0', () => {
    const result = runHook('evaluate-session.js', {}, {
      ERNE_PROJECT_DIR: '/nonexistent/path',
    });
    assert.strictEqual(result.exitCode, 0);
  });
});
