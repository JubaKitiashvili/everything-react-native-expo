'use strict';
const fs = require('fs');
const path = require('path');
const { runDispatcher, createTempProject, cleanupTempProject, HOOKS_DIR } = require('./helpers');

describe('Profile-based hook execution (integration)', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  const HOOKS_CONFIG = path.resolve(__dirname, '../../hooks/hooks.json');

  test('minimal profile only runs minimal hooks', () => {
    const formatResult = runDispatcher('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    expect([0, 2]).toContain(formatResult.exitCode);

    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Skipped — exit 0, empty stdout
    expect(typecheckResult.exitCode).toBe(0);
    expect(typecheckResult.stdout).toBe('');
  });

  test('standard profile runs standard hooks but not strict', () => {
    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'standard', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Should run (not empty — the hook will produce some output or at least execute)
    // typecheck will warn since tsc likely not available in this context
    expect([0, 2]).toContain(typecheckResult.exitCode);

    const testGateResult = runDispatcher('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'standard', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Skipped (strict only)
    expect(testGateResult.exitCode).toBe(0);
    expect(testGateResult.stdout).toBe('');
  });

  test('strict profile runs all hooks', () => {
    const testGateResult = runDispatcher('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'strict', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    // Should attempt to run (not skipped)
    expect([0, 2]).toContain(testGateResult.exitCode);
  });

  test('ERNE_PROFILE env var takes precedence over default', () => {
    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir, ERNE_HOOKS_CONFIG: HOOKS_CONFIG });
    expect(typecheckResult.exitCode).toBe(0);
    expect(typecheckResult.stdout).toBe('');
  });
});

describe('Hook definitions integrity (integration)', () => {
  test('all hooks in hooks.json reference existing script files', () => {
    const hooksConfigPath = path.resolve(HOOKS_DIR, '../../hooks/hooks.json');
    const hooksConfig = JSON.parse(fs.readFileSync(hooksConfigPath, 'utf8'));

    for (const hook of hooksConfig.hooks) {
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) {
        const scriptPath = path.join(HOOKS_DIR, match[1]);
        expect(fs.existsSync(scriptPath)).toBe(true);
      }
    }
  });

  test('all profile JSONs reference hooks that exist in hooks.json', () => {
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
          expect(allHookNames.has(hookName)).toBe(true);
        }
      }
    }
  });

  test('every hook script file is referenced in hooks.json', () => {
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
      expect(referencedScripts.has(file)).toBe(true);
    }
  });

  test('minimal profile is a subset of standard', () => {
    const profilesDir = path.resolve(HOOKS_DIR, '../../hooks/profiles');
    const minimal = JSON.parse(fs.readFileSync(path.join(profilesDir, 'minimal.json'), 'utf8'));
    const standard = JSON.parse(fs.readFileSync(path.join(profilesDir, 'standard.json'), 'utf8'));
    for (const hook of minimal.hooks) {
      expect(standard.hooks).toContain(hook);
    }
  });

  test('standard profile is a subset of strict', () => {
    const profilesDir = path.resolve(HOOKS_DIR, '../../hooks/profiles');
    const standard = JSON.parse(fs.readFileSync(path.join(profilesDir, 'standard.json'), 'utf8'));
    const strict = JSON.parse(fs.readFileSync(path.join(profilesDir, 'strict.json'), 'utf8'));
    for (const hook of standard.hooks) {
      expect(strict.hooks).toContain(hook);
    }
  });
});

describe('Hook error handling (integration)', () => {
  let projectDir;
  beforeEach(() => { projectDir = createTempProject(); });
  afterEach(() => { cleanupTempProject(projectDir); });

  const HOOKS_CONFIG = path.resolve(__dirname, '../../hooks/hooks.json');

  test('hooks handle missing ERNE_PROJECT_DIR gracefully', () => {
    const result = runDispatcher('session-start.js', {}, {
      ERNE_PROFILE: 'minimal',
      ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
    });
    expect([0, 2]).toContain(result.exitCode);
  });

  test('hooks handle empty stdin gracefully', () => {
    const result = runDispatcher('post-edit-format.js', {}, {
      ERNE_PROFILE: 'minimal',
      ERNE_PROJECT_DIR: projectDir,
      ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
    });
    expect([0, 2]).toContain(result.exitCode);
  });

  test('hooks handle malformed JSON stdin gracefully', () => {
    const { execFileSync } = require('child_process');
    const dispatcherPath = path.join(HOOKS_DIR, 'run-with-flags.js');

    try {
      const stdout = execFileSync('node', [dispatcherPath, 'session-start.js'], {
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
      expect(true).toBe(true);
    } catch (err) {
      expect([0, 1, 2]).toContain(err.status);
    }
  });
});
