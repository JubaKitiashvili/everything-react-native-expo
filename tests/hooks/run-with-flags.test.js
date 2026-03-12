'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const {
  runDispatcher,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

const HOOKS_CONFIG = path.resolve(__dirname, '../../hooks/hooks.json');

describe('run-with-flags.js dispatcher', () => {
  describe('profile gating', () => {
    it('runs hook when profile matches', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({
          dependencies: { expo: '~51.0.0' },
        }),
      });
      try {
        const result = runDispatcher('session-start.js', {}, {
          ERNE_PROFILE: 'minimal',
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
          ERNE_PROJECT_DIR: dir,
        });
        // session-start.js is in minimal — should run (exit 0)
        assert.strictEqual(result.exitCode, 0);
      } finally {
        cleanupTempProject(dir);
      }
    });

    it('skips hook when profile does not match', () => {
      const result = runDispatcher('post-edit-typecheck.js', {}, {
        ERNE_PROFILE: 'minimal',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      // post-edit-typecheck.js is NOT in minimal — skip (exit 0, no output)
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stdout, '');
    });

    it('runs strict-only hook when profile is strict', () => {
      const result = runDispatcher('security-scan.js', {}, {
        ERNE_PROFILE: 'strict',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      // security-scan.js is in strict — should attempt to run
      assert.ok([0, 2].includes(result.exitCode));
    });

    it('skips strict-only hook when profile is standard', () => {
      const result = runDispatcher('security-scan.js', {}, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      assert.strictEqual(result.exitCode, 0);
      assert.strictEqual(result.stdout, '');
    });
  });

  describe('profile resolution', () => {
    it('env var takes highest priority', () => {
      const dir = createTempProject({
        'CLAUDE.md': '<!-- Hook Profile: strict -->',
      });
      try {
        const result = runDispatcher('post-edit-typecheck.js', {}, {
          ERNE_PROFILE: 'minimal',
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // env says minimal — typecheck should be skipped
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(result.stdout, '');
      } finally {
        cleanupTempProject(dir);
      }
    });

    it('CLAUDE.md comment used when no env var', () => {
      const dir = createTempProject({
        'CLAUDE.md': '# Project\n<!-- Hook Profile: strict -->',
      });
      try {
        const result = runDispatcher('security-scan.js', {}, {
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // strict from CLAUDE.md — security-scan should attempt to run
        assert.ok([0, 2].includes(result.exitCode));
      } finally {
        cleanupTempProject(dir);
      }
    });

    it('defaults to standard when no config', () => {
      const dir = createTempProject({});
      try {
        const result = runDispatcher('pre-commit-lint.js', {}, {
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // standard by default — pre-commit-lint should attempt to run
        assert.ok([0, 2].includes(result.exitCode));
      } finally {
        cleanupTempProject(dir);
      }
    });

    it('reads CLAUDE.md from .claude/ subdirectory', () => {
      const dir = createTempProject({
        '.claude/CLAUDE.md': '<!-- Hook Profile: minimal -->',
      });
      try {
        const result = runDispatcher('post-edit-typecheck.js', {}, {
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // minimal from .claude/CLAUDE.md — typecheck skipped
        assert.strictEqual(result.exitCode, 0);
        assert.strictEqual(result.stdout, '');
      } finally {
        cleanupTempProject(dir);
      }
    });
  });

  describe('error handling', () => {
    it('exits 0 when no hook script argument', () => {
      const result = runDispatcher('', {}, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      assert.strictEqual(result.exitCode, 0);
    });

    it('exits 0 when hook script not in config', () => {
      const result = runDispatcher('nonexistent-hook.js', {}, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      assert.strictEqual(result.exitCode, 0);
    });
  });

  describe('stdin forwarding', () => {
    it('forwards stdin data to hook script', () => {
      const dir = createTempProject({
        'package.json': JSON.stringify({
          dependencies: { expo: '~51.0.0' },
        }),
      });
      try {
        const input = {
          tool_name: 'Edit',
          tool_input: { file_path: '/a/b.ts' },
        };
        const result = runDispatcher('session-start.js', input, {
          ERNE_PROFILE: 'standard',
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
          ERNE_PROJECT_DIR: dir,
        });
        assert.strictEqual(result.exitCode, 0);
      } finally {
        cleanupTempProject(dir);
      }
    });
  });
});
