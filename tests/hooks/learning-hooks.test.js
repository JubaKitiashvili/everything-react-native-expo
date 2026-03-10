'use strict';
const fs = require('fs');
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('continuous-learning-observer.js', () => {
  test('creates observations file and appends entry', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('continuous-learning-observer.js', {
        stop_reason: 'end_turn',
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);

      const obsPath = path.join(dir, '.claude', 'erne', 'observations.jsonl');
      expect(fs.existsSync(obsPath)).toBe(true);

      const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
      expect(lines.length).toBe(1);

      const entry = JSON.parse(lines[0]);
      expect(entry).toHaveProperty('timestamp');
      expect(entry).toHaveProperty('stop_reason', 'end_turn');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('appends to existing observations file', () => {
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
      expect(result.exitCode).toBe(0);

      const obsPath = path.join(dir, '.claude', 'erne', 'observations.jsonl');
      const lines = fs.readFileSync(obsPath, 'utf8').trim().split('\n');
      expect(lines.length).toBe(2);

      const latest = JSON.parse(lines[1]);
      expect(latest.stop_reason).toBe('end_turn');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('always exits 0 even with empty stdin', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('continuous-learning-observer.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('always exits 0 even if write fails (read-only dir)', () => {
    const result = runHook('continuous-learning-observer.js', {
      stop_reason: 'end_turn',
    }, {
      ERNE_PROJECT_DIR: '/nonexistent/path/that/does/not/exist',
    });
    expect(result.exitCode).toBe(0);
  });

  test('records timestamp in ISO format', () => {
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
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    } finally {
      cleanupTempProject(dir);
    }
  });
});
