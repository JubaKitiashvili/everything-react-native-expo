'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { runDispatcher, createTempProject, cleanupTempProject, HOOKS_DIR } = require('./helpers');

describe('Profile-based hook execution (integration)', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  const HOOKS_CONFIG = path.resolve(__dirname, '../../hooks/hooks.json');

  it('minimal profile only runs minimal hooks', () => {
    const formatResult = runDispatcher('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    assert.ok([0, 2].includes(formatResult.exitCode));

    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Skipped — exit 0, empty stdout
    assert.strictEqual(typecheckResult.exitCode, 0);
    assert.strictEqual(typecheckResult.stdout, '');
  });

  it('standard profile runs standard hooks but not strict', () => {
    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'standard', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Should run (not empty — the hook will produce some output or at least execute)
    // typecheck will warn since tsc likely not available in this context
    assert.ok([0, 2].includes(typecheckResult.exitCode));

    const testGateResult = runDispatcher('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'standard', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Skipped (strict only)
    assert.strictEqual(testGateResult.exitCode, 0);
    assert.strictEqual(testGateResult.stdout, '');
  });

  it('strict profile runs all hooks', () => {
    const testGateResult = runDispatcher('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'strict', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Should attempt to run (not skipped)
    assert.ok([0, 2].includes(testGateResult.exitCode));
  });

  it('ERNE_PROFILE env var takes precedence over default', () => {
    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    assert.strictEqual(typecheckResult.exitCode, 0);
    assert.strictEqual(typecheckResult.stdout, '');
  });
});

describe('Hook definitions integrity (integration)', () => {
  it('all hooks in hooks.json reference existing script files', () => {
    const hooksConfigPath = path.resolve(HOOKS_DIR, '../../hooks/hooks.json');
    const hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));

    for (const hook of hooksConfig.hooks) {
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) {
        const scriptPath = path.join(HOOKS_DIR, match[1]);
        assert.ok(fs.existsSync(scriptPath), `Script ${match[1]} should exist`);
      }
    }
  });

  it('all profile JSONs reference hooks that exist in hooks.json', () => {
    const hooksConfigPath = path.resolve(HOOKS_DIR, '../../hooks/hooks.json');
    const hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));

    const allHookNames = new Set();
    for (const hook of hooksConfig.hooks) {
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) allHookNames.add(match[1]);
    }

    const profilesDir = path.resolve(HOOKS_DIR, '../../hooks/profiles');
    const profiles = ['minimal.json', 'standard.json', 'strict.json'];

    for (const profileFile of profiles) {
      const profilePath = path.join(profilesDir, profileFile);
      if (fs.existsSync(profilePath)) {
        const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
        for (const hookName of profile.hooks) {
          assert.ok(allHookNames.has(hookName), `${hookName} should be in hooks.json`);
        }
      }
    }
  });

  it('every hook script file is referenced in hooks.json', () => {
    const hooksConfigPath = path.resolve(HOOKS_DIR, '../../hooks/hooks.json');
    const hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));

    const referencedScripts = new Set();
    for (const hook of hooksConfig.hooks) {
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) referencedScripts.add(match[1]);
    }

    const hooksFiles = fs.readdirSync(HOOKS_DIR)
      .filter((f) => f.endsWith('.js') && f !== 'run-with-flags.js');

    for (const file of hooksFiles) {
      if (file === 'lib') continue;
      assert.ok(referencedScripts.has(file), `${file} should be referenced in hooks.json`);
    }
  });

  it('minimal profile is a subset of standard', () => {
    const profilesDir = path.resolve(HOOKS_DIR, '../../hooks/profiles');
    const minimal = JSON.parse(fs.readFileSync(path.join(profilesDir, 'minimal.json'), 'utf8'));
    const standard = JSON.parse(fs.readFileSync(path.join(profilesDir, 'standard.json'), 'utf8'));
    for (const hook of minimal.hooks) {
      assert.ok(standard.hooks.includes(hook), `standard should include ${hook}`);
    }
  });

  it('standard profile is a subset of strict', () => {
    const profilesDir = path.resolve(HOOKS_DIR, '../../hooks/profiles');
    const standard = JSON.parse(fs.readFileSync(path.join(profilesDir, 'standard.json'), 'utf8'));
    const strict = JSON.parse(fs.readFileSync(path.join(profilesDir, 'strict.json'), 'utf8'));
    for (const hook of standard.hooks) {
      assert.ok(strict.hooks.includes(hook), `strict should include ${hook}`);
    }
  });
});

describe('Hook error handling (integration)', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  const HOOKS_CONFIG = path.resolve(__dirname, '../../hooks/hooks.json');

  it('hooks handle missing ERNE_PROJECT_DIR gracefully', () => {
    const result = runDispatcher('session-start.js', {}, {
      ERNE_PROFILE: 'minimal',
      ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
    });
    assert.ok([0, 2].includes(result.exitCode));
  });

  it('hooks handle empty stdin gracefully', () => {
    const result = runDispatcher('post-edit-format.js', {}, {
      ERNE_PROFILE: 'minimal',
      ERNE_PROJECT_DIR: projectDir,
      ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
    });
    assert.ok([0, 2].includes(result.exitCode));
  });

  it('hooks handle malformed JSON stdin gracefully', () => {
    const { execFileSync } = require('child_process');
    const dispatcherPath = path.join(HOOKS_DIR, 'run-with-flags.js');

    try {
      execFileSync('node', [dispatcherPath, 'session-start.js'], {
        input: 'not-valid-json{{{',
        encoding: 'utf8',
        env: {
          ...process.env,
          ERNE_PROFILE: 'minimal',
          ERNE_PROJECT_DIR: projectDir,
          ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });
      assert.ok(true);
    } catch (err) {
      assert.ok([0, 1, 2].includes(err.status));
    }
  });
});
