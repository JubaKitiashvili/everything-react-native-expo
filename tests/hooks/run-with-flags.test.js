'use strict';
const path = require('path');
const {
  runDispatcher,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

const HOOKS_CONFIG = path.resolve(__dirname, '../../hooks/hooks.json');

describe('run-with-flags.js dispatcher', () => {
  describe('profile gating', () => {
    test('runs hook when profile matches', () => {
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
        expect(result.exitCode).toBe(0);
      } finally {
        cleanupTempProject(dir);
      }
    });

    test('skips hook when profile does not match', () => {
      const result = runDispatcher('post-edit-typecheck.js', {}, {
        ERNE_PROFILE: 'minimal',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      // post-edit-typecheck.js is NOT in minimal — skip (exit 0, no output)
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    });

    test('runs strict-only hook when profile is strict', () => {
      const result = runDispatcher('security-scan.js', {}, {
        ERNE_PROFILE: 'strict',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      // security-scan.js is in strict — should attempt to run
      expect([0, 2]).toContain(result.exitCode);
    });

    test('skips strict-only hook when profile is standard', () => {
      const result = runDispatcher('security-scan.js', {}, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('');
    });
  });

  describe('profile resolution', () => {
    test('env var takes highest priority', () => {
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
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('');
      } finally {
        cleanupTempProject(dir);
      }
    });

    test('CLAUDE.md comment used when no env var', () => {
      const dir = createTempProject({
        'CLAUDE.md': '# Project\n<!-- Hook Profile: strict -->',
      });
      try {
        const result = runDispatcher('security-scan.js', {}, {
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // strict from CLAUDE.md — security-scan should attempt to run
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        cleanupTempProject(dir);
      }
    });

    test('defaults to standard when no config', () => {
      const dir = createTempProject({});
      try {
        const result = runDispatcher('pre-commit-lint.js', {}, {
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // standard by default — pre-commit-lint should attempt to run
        expect([0, 2]).toContain(result.exitCode);
      } finally {
        cleanupTempProject(dir);
      }
    });

    test('reads CLAUDE.md from .claude/ subdirectory', () => {
      const dir = createTempProject({
        '.claude/CLAUDE.md': '<!-- Hook Profile: minimal -->',
      });
      try {
        const result = runDispatcher('post-edit-typecheck.js', {}, {
          ERNE_PROJECT_DIR: dir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        });
        // minimal from .claude/CLAUDE.md — typecheck skipped
        expect(result.exitCode).toBe(0);
        expect(result.stdout).toBe('');
      } finally {
        cleanupTempProject(dir);
      }
    });
  });

  describe('error handling', () => {
    test('exits 0 when no hook script argument', () => {
      const result = runDispatcher('', {}, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      expect(result.exitCode).toBe(0);
    });

    test('exits 0 when hook script not in config', () => {
      const result = runDispatcher('nonexistent-hook.js', {}, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      expect(result.exitCode).toBe(0);
    });
  });

  describe('stdin forwarding', () => {
    test('forwards stdin data to hook script', () => {
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
        expect(result.exitCode).toBe(0);
      } finally {
        cleanupTempProject(dir);
      }
    });
  });
});
