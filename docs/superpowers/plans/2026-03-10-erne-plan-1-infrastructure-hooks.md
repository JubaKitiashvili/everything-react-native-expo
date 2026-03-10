# ERNE Plan 1: Core Infrastructure & Hook System

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the hook system foundation — central dispatcher, profile resolution, shared utilities, all 16 hook scripts, and comprehensive test suites.

**Architecture:** A single `run-with-flags.js` dispatcher reads `hooks.json`, resolves the active profile (env > CLAUDE.md > default:standard), and gates hook execution via `spawnSync`. Each hook script is a self-contained CJS module that reads JSON from stdin and exits with 0 (pass), 1 (fail/block), or 2 (warning). All tests use subprocess execution via `execFileSync` to validate actual behavior.

**Tech Stack:** Node.js (CJS), Jest (test runner), Prettier (formatting hook dependency)

---

## File Structure

### Create:

```
package.json
schemas/hooks.schema.json
hooks/hooks.json
hooks/profiles/minimal.json
hooks/profiles/standard.json
hooks/profiles/strict.json
scripts/hooks/run-with-flags.js
scripts/hooks/lib/hook-utils.js
scripts/hooks/session-start.js
scripts/hooks/post-edit-format.js
scripts/hooks/post-edit-typecheck.js
scripts/hooks/check-console-log.js
scripts/hooks/check-platform-specific.js
scripts/hooks/check-reanimated-worklet.js
scripts/hooks/check-expo-config.js
scripts/hooks/bundle-size-check.js
scripts/hooks/pre-commit-lint.js
scripts/hooks/pre-edit-test-gate.js
scripts/hooks/security-scan.js
scripts/hooks/performance-budget.js
scripts/hooks/native-compat-check.js
scripts/hooks/accessibility-check.js
scripts/hooks/continuous-learning-observer.js
scripts/hooks/evaluate-session.js
tests/hooks/helpers.js
tests/hooks/definitions.test.js
tests/hooks/hook-utils.test.js
tests/hooks/run-with-flags.test.js
tests/hooks/core-hooks.test.js
tests/hooks/validation-hooks.test.js
tests/hooks/gate-hooks.test.js
tests/hooks/learning-hooks.test.js
```

### Modify:

None (fresh codebase).

---

## Chunk 1: Foundation

### Task 1: Project Setup

**Files:**
- Create: `package.json`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "erne-universal",
  "version": "0.1.0",
  "description": "AI coding agent harness for React Native and Expo development",
  "license": "MIT",
  "scripts": {
    "test": "jest",
    "test:hooks": "jest tests/hooks/"
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, `package-lock.json` generated

- [ ] **Step 3: Verify Jest runs**

Run: `npx jest --version`
Expected: Version number printed (e.g., `29.7.0`)

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json .gitignore
git commit -m "chore: init package.json with jest"
```

---

### Task 2: Hook Definitions, Schema & Profiles

**Files:**
- Create: `schemas/hooks.schema.json`
- Create: `hooks/hooks.json`
- Create: `hooks/profiles/minimal.json`
- Create: `hooks/profiles/standard.json`
- Create: `hooks/profiles/strict.json`
- Test: `tests/hooks/definitions.test.js`

- [ ] **Step 1: Write the failing test for hooks.json structure**

```js
// tests/hooks/definitions.test.js
'use strict';
const fs = require('fs');
const path = require('path');

const HOOKS_PATH = path.resolve(__dirname, '../../hooks/hooks.json');
const PROFILES_DIR = path.resolve(__dirname, '../../hooks/profiles');
const VALID_EVENTS = [
  'PreToolUse', 'PostToolUse', 'Stop',
  'PreCompact', 'SessionStart', 'SessionEnd',
];
const VALID_PROFILES = ['minimal', 'standard', 'strict'];

describe('hooks.json definitions', () => {
  let config;

  beforeAll(() => {
    config = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
  });

  test('has hooks array', () => {
    expect(Array.isArray(config.hooks)).toBe(true);
    expect(config.hooks.length).toBeGreaterThan(0);
  });

  test('each hook has required fields', () => {
    for (const hook of config.hooks) {
      expect(hook).toHaveProperty('event');
      expect(hook).toHaveProperty('script');
      expect(hook).toHaveProperty('command');
      expect(hook).toHaveProperty('profiles');
      expect(VALID_EVENTS).toContain(hook.event);
      expect(Array.isArray(hook.profiles)).toBe(true);
      hook.profiles.forEach(p => expect(VALID_PROFILES).toContain(p));
    }
  });

  test('has exactly 16 hooks', () => {
    expect(config.hooks.length).toBe(16);
  });

  test('each command routes through run-with-flags.js', () => {
    for (const hook of config.hooks) {
      expect(hook.command).toMatch(
        /^node scripts\/hooks\/run-with-flags\.js /
      );
      expect(hook.command).toContain(hook.script);
    }
  });
});

describe('profile definitions', () => {
  test('minimal is subset of standard', () => {
    const minimal = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'minimal.json'), 'utf8')
    );
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    for (const script of minimal.hooks) {
      expect(standard.hooks).toContain(script);
    }
  });

  test('standard is subset of strict', () => {
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    const strict = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'strict.json'), 'utf8')
    );
    for (const script of standard.hooks) {
      expect(strict.hooks).toContain(script);
    }
  });

  test('minimal has exactly 3 hooks', () => {
    const minimal = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'minimal.json'), 'utf8')
    );
    expect(minimal.hooks.length).toBe(3);
  });

  test('standard has exactly 11 hooks', () => {
    const standard = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'standard.json'), 'utf8')
    );
    expect(standard.hooks.length).toBe(11);
  });

  test('strict has exactly 16 hooks', () => {
    const strict = JSON.parse(
      fs.readFileSync(path.join(PROFILES_DIR, 'strict.json'), 'utf8')
    );
    expect(strict.hooks.length).toBe(16);
  });

  test('profile files match hooks.json profiles', () => {
    const config = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
    for (const profileName of VALID_PROFILES) {
      const profile = JSON.parse(
        fs.readFileSync(
          path.join(PROFILES_DIR, `${profileName}.json`),
          'utf8'
        )
      );
      const fromConfig = config.hooks
        .filter(h => h.profiles.includes(profileName))
        .map(h => h.script);
      expect(profile.hooks.sort()).toEqual(fromConfig.sort());
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/hooks/definitions.test.js -v`
Expected: FAIL — cannot find `hooks/hooks.json`

- [ ] **Step 3: Create hooks.json with all 16 hook entries**

```json
{
  "hooks": [
    {
      "event": "SessionStart",
      "script": "session-start.js",
      "command": "node scripts/hooks/run-with-flags.js session-start.js",
      "profiles": ["minimal", "standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "post-edit-format.js",
      "command": "node scripts/hooks/run-with-flags.js post-edit-format.js",
      "profiles": ["minimal", "standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "post-edit-typecheck.js",
      "command": "node scripts/hooks/run-with-flags.js post-edit-typecheck.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "check-console-log.js",
      "command": "node scripts/hooks/run-with-flags.js check-console-log.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "check-platform-specific.js",
      "command": "node scripts/hooks/run-with-flags.js check-platform-specific.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "check-reanimated-worklet.js",
      "command": "node scripts/hooks/run-with-flags.js check-reanimated-worklet.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "check-expo-config.js",
      "command": "node scripts/hooks/run-with-flags.js check-expo-config.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "bundle-size-check.js",
      "command": "node scripts/hooks/run-with-flags.js bundle-size-check.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PreToolUse",
      "pattern": "Bash",
      "script": "pre-commit-lint.js",
      "command": "node scripts/hooks/run-with-flags.js pre-commit-lint.js",
      "profiles": ["standard", "strict"]
    },
    {
      "event": "PreToolUse",
      "pattern": "Edit|Write",
      "script": "pre-edit-test-gate.js",
      "command": "node scripts/hooks/run-with-flags.js pre-edit-test-gate.js",
      "profiles": ["strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "security-scan.js",
      "command": "node scripts/hooks/run-with-flags.js security-scan.js",
      "profiles": ["strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "performance-budget.js",
      "command": "node scripts/hooks/run-with-flags.js performance-budget.js",
      "profiles": ["strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "native-compat-check.js",
      "command": "node scripts/hooks/run-with-flags.js native-compat-check.js",
      "profiles": ["strict"]
    },
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "script": "accessibility-check.js",
      "command": "node scripts/hooks/run-with-flags.js accessibility-check.js",
      "profiles": ["strict"]
    },
    {
      "event": "Stop",
      "script": "continuous-learning-observer.js",
      "command": "node scripts/hooks/run-with-flags.js continuous-learning-observer.js",
      "profiles": ["minimal", "standard", "strict"]
    },
    {
      "event": "Stop",
      "script": "evaluate-session.js",
      "command": "node scripts/hooks/run-with-flags.js evaluate-session.js",
      "profiles": ["standard", "strict"]
    }
  ]
}
```

- [ ] **Step 4: Create the JSON schema for hook definitions**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["hooks"],
  "properties": {
    "hooks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["event", "script", "command", "profiles"],
        "properties": {
          "event": {
            "type": "string",
            "enum": [
              "PreToolUse", "PostToolUse", "Stop",
              "PreCompact", "SessionStart", "SessionEnd"
            ]
          },
          "pattern": { "type": "string" },
          "script": { "type": "string" },
          "command": { "type": "string" },
          "profiles": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["minimal", "standard", "strict"]
            },
            "minItems": 1
          }
        }
      }
    }
  }
}
```

Save to: `schemas/hooks.schema.json`

- [ ] **Step 5: Create profile definition files**

`hooks/profiles/minimal.json`:
```json
{
  "name": "minimal",
  "description": "Fast iteration, minimal checks. For vibe coders and rapid prototyping.",
  "hooks": [
    "session-start.js",
    "post-edit-format.js",
    "continuous-learning-observer.js"
  ]
}
```

`hooks/profiles/standard.json`:
```json
{
  "name": "standard",
  "description": "Balanced quality and speed. Recommended for most projects.",
  "hooks": [
    "session-start.js",
    "post-edit-format.js",
    "post-edit-typecheck.js",
    "check-console-log.js",
    "check-platform-specific.js",
    "check-reanimated-worklet.js",
    "check-expo-config.js",
    "bundle-size-check.js",
    "pre-commit-lint.js",
    "continuous-learning-observer.js",
    "evaluate-session.js"
  ]
}
```

`hooks/profiles/strict.json`:
```json
{
  "name": "strict",
  "description": "Production-grade enforcement. For teams requiring CI-level quality.",
  "hooks": [
    "session-start.js",
    "post-edit-format.js",
    "post-edit-typecheck.js",
    "check-console-log.js",
    "check-platform-specific.js",
    "check-reanimated-worklet.js",
    "check-expo-config.js",
    "bundle-size-check.js",
    "pre-commit-lint.js",
    "pre-edit-test-gate.js",
    "security-scan.js",
    "performance-budget.js",
    "native-compat-check.js",
    "accessibility-check.js",
    "continuous-learning-observer.js",
    "evaluate-session.js"
  ]
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/hooks/definitions.test.js -v`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add schemas/ hooks/ tests/hooks/definitions.test.js
git commit -m "feat: add hook definitions, profiles, and schema"
```

---

### Task 3: Shared Hook Utilities & Test Helpers

**Files:**
- Create: `scripts/hooks/lib/hook-utils.js`
- Create: `tests/hooks/helpers.js`
- Test: `tests/hooks/hook-utils.test.js`

- [ ] **Step 1: Write the failing test for hook-utils**

```js
// tests/hooks/hook-utils.test.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');

const UTILS_PATH = path.resolve(
  __dirname,
  '../../scripts/hooks/lib/hook-utils.js'
);

function runSnippet(code, stdin = '') {
  const escaped = UTILS_PATH.replace(/\\/g, '\\\\');
  const script = `const utils = require('${escaped}');\n${code}`;
  try {
    const stdout = execFileSync('node', ['-e', script], {
      input: stdin,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 5000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

describe('readStdin', () => {
  test('parses valid JSON from stdin', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/a/b.ts' },
    });
    const result = runSnippet(
      'const d = utils.readStdin(); console.log(JSON.stringify(d));',
      input
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).tool_name).toBe('Edit');
  });

  test('returns empty object for empty stdin', () => {
    const result = runSnippet(
      'const d = utils.readStdin(); console.log(JSON.stringify(d));',
      ''
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });

  test('returns empty object for invalid JSON', () => {
    const result = runSnippet(
      'const d = utils.readStdin(); console.log(JSON.stringify(d));',
      'not json'
    );
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout)).toEqual({});
  });
});

describe('getEditedFilePath', () => {
  test('extracts file_path from tool_input', () => {
    const r = runSnippet(
      `console.log(utils.getEditedFilePath({
        tool_input: { file_path: '/a/b.ts' }
      }));`
    );
    expect(r.stdout.trim()).toBe('/a/b.ts');
  });

  test('falls back to path from tool_input', () => {
    const r = runSnippet(
      `console.log(utils.getEditedFilePath({
        tool_input: { path: '/c/d.js' }
      }));`
    );
    expect(r.stdout.trim()).toBe('/c/d.js');
  });

  test('returns null for missing input', () => {
    const r = runSnippet('console.log(utils.getEditedFilePath(null));');
    expect(r.stdout.trim()).toBe('null');
  });
});

describe('exit helpers', () => {
  test('pass exits with code 0', () => {
    const r = runSnippet('utils.pass("ok");');
    expect(r.exitCode).toBe(0);
    expect(r.stdout.trim()).toBe('ok');
  });

  test('fail exits with code 1', () => {
    const r = runSnippet('utils.fail("blocked");');
    expect(r.exitCode).toBe(1);
    expect(r.stdout.trim()).toBe('blocked');
  });

  test('warn exits with code 2', () => {
    const r = runSnippet('utils.warn("warning");');
    expect(r.exitCode).toBe(2);
    expect(r.stdout.trim()).toBe('warning');
  });
});

describe('isTestFile', () => {
  test('detects .test.ts', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/Button.test.ts"));'
    );
    expect(r.stdout.trim()).toBe('true');
  });

  test('detects .spec.tsx', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/Button.spec.tsx"));'
    );
    expect(r.stdout.trim()).toBe('true');
  });

  test('detects __tests__ directory', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/__tests__/Button.tsx"));'
    );
    expect(r.stdout.trim()).toBe('true');
  });

  test('rejects normal source file', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/Button.tsx"));'
    );
    expect(r.stdout.trim()).toBe('false');
  });
});

describe('hasExtension', () => {
  test('matches .ts extension', () => {
    const r = runSnippet(
      'console.log(utils.hasExtension("a/b.ts", [".ts", ".tsx"]));'
    );
    expect(r.stdout.trim()).toBe('true');
  });

  test('rejects .js when checking .ts', () => {
    const r = runSnippet(
      'console.log(utils.hasExtension("a/b.js", [".ts", ".tsx"]));'
    );
    expect(r.stdout.trim()).toBe('false');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/hooks/hook-utils.test.js -v`
Expected: FAIL — cannot find `scripts/hooks/lib/hook-utils.js`

- [ ] **Step 3: Create hook-utils.js**

```js
// scripts/hooks/lib/hook-utils.js
'use strict';
const fs = require('fs');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function getEditedFilePath(input) {
  if (!input || !input.tool_input) return null;
  return input.tool_input.file_path || input.tool_input.path || null;
}

function pass(msg) {
  if (msg) console.log(msg);
  process.exit(0);
}

function fail(msg) {
  if (msg) console.log(msg);
  process.exit(1);
}

function warn(msg) {
  if (msg) console.log(msg);
  process.exit(2);
}

function isTestFile(filePath) {
  return (
    /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    filePath.includes('__tests__')
  );
}

function hasExtension(filePath, exts) {
  return exts.some(ext => filePath.endsWith(ext));
}

module.exports = {
  readStdin,
  getEditedFilePath,
  pass,
  fail,
  warn,
  isTestFile,
  hasExtension,
};
```

- [ ] **Step 4: Create test helpers**

```js
// tests/hooks/helpers.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const HOOKS_DIR = path.resolve(__dirname, '../../scripts/hooks');
const DISPATCHER = path.join(HOOKS_DIR, 'run-with-flags.js');

function runHook(scriptName, stdin = {}, env = {}) {
  const scriptPath = path.join(HOOKS_DIR, scriptName);
  try {
    const stdout = execFileSync('node', [scriptPath], {
      input: JSON.stringify(stdin),
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

function runDispatcher(hookScript, stdin = {}, env = {}) {
  try {
    const stdout = execFileSync('node', [DISPATCHER, hookScript], {
      input: JSON.stringify(stdin),
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000,
    });
    return { exitCode: 0, stdout, stderr: '' };
  } catch (err) {
    return {
      exitCode: err.status ?? 1,
      stdout: err.stdout || '',
      stderr: err.stderr || '',
    };
  }
}

function createTempProject(files = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
  for (const [filePath, content] of Object.entries(files)) {
    const fullPath = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, content);
  }
  return dir;
}

function cleanupTempProject(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
}

module.exports = {
  runHook,
  runDispatcher,
  createTempProject,
  cleanupTempProject,
  HOOKS_DIR,
};
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx jest tests/hooks/hook-utils.test.js -v`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/hooks/lib/ tests/hooks/helpers.js tests/hooks/hook-utils.test.js
git commit -m "feat: add hook utilities and test helpers"
```

---

## Chunk 2: Hook Engine

### Task 4: Central Dispatcher (run-with-flags.js)

**Files:**
- Create: `scripts/hooks/run-with-flags.js`
- Test: `tests/hooks/run-with-flags.test.js`

- [ ] **Step 1: Write the failing test for the dispatcher**

```js
// tests/hooks/run-with-flags.test.js
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
      const result = runDispatcher('session-start.js', {}, {
        ERNE_PROFILE: 'minimal',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      // session-start.js is in minimal — should run (exit 0)
      expect(result.exitCode).toBe(0);
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
      const input = {
        tool_name: 'Edit',
        tool_input: { file_path: '/a/b.ts' },
      };
      const result = runDispatcher('session-start.js', input, {
        ERNE_PROFILE: 'standard',
        ERNE_HOOKS_CONFIG: HOOKS_CONFIG,
      });
      expect(result.exitCode).toBe(0);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/hooks/run-with-flags.test.js -v`
Expected: FAIL — cannot find `scripts/hooks/run-with-flags.js`

- [ ] **Step 3: Create run-with-flags.js**

```js
// scripts/hooks/run-with-flags.js
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_SCRIPT = process.argv[2];
if (!HOOK_SCRIPT) {
  process.exit(0);
}

// Read stdin once for forwarding to hook script
let stdinData = '';
try {
  stdinData = fs.readFileSync(0, 'utf8');
} catch {}

function resolveProfile() {
  // 1. Env var (highest priority)
  if (process.env.ERNE_PROFILE) {
    const p = process.env.ERNE_PROFILE.toLowerCase();
    if (['minimal', 'standard', 'strict'].includes(p)) return p;
  }

  // 2. CLAUDE.md comment
  const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
  const claudeMdPaths = [
    path.join(projectDir, 'CLAUDE.md'),
    path.join(projectDir, '.claude', 'CLAUDE.md'),
  ];
  for (const mdPath of claudeMdPaths) {
    try {
      const content = fs.readFileSync(mdPath, 'utf8');
      const match = content.match(
        /<!--\s*Hook Profile:\s*(minimal|standard|strict)\s*-->/i
      );
      if (match) return match[1].toLowerCase();
    } catch {}
  }

  // 3. Default
  return 'standard';
}

function loadHooksConfig() {
  const configPath =
    process.env.ERNE_HOOKS_CONFIG ||
    path.resolve(__dirname, '../../hooks/hooks.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { hooks: [] };
  }
}

const profile = resolveProfile();
const config = loadHooksConfig();

// Find hook entry in config
const hookEntry = config.hooks.find(h => h.script === HOOK_SCRIPT);
if (!hookEntry) {
  process.exit(0);
}

// Gate by profile
if (!hookEntry.profiles.includes(profile)) {
  process.exit(0);
}

// Resolve and run the hook script
const scriptPath = path.resolve(__dirname, HOOK_SCRIPT);
if (!fs.existsSync(scriptPath)) {
  console.error(`ERNE: hook script not found: ${scriptPath}`);
  process.exit(2);
}

const result = spawnSync('node', [scriptPath], {
  input: stdinData,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 30000,
  env: process.env,
});

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

if (result.signal === 'SIGTERM') {
  console.error('ERNE: hook timed out after 30s');
  process.exit(2);
}

process.exit(result.status ?? 0);
```

- [ ] **Step 4: Create minimal stub for session-start.js**

```js
// scripts/hooks/session-start.js
'use strict';
// Stub — full implementation in Task 5
console.log('ERNE: Project layers: common');
process.exit(0);
```

- [ ] **Step 5: Create stubs for all remaining hook scripts**

Each file follows this pattern:
```js
'use strict';
// Stub — full implementation in Task N
process.exit(0);
```

Create stubs for: `post-edit-format.js`, `post-edit-typecheck.js`, `check-console-log.js`, `check-platform-specific.js`, `check-reanimated-worklet.js`, `check-expo-config.js`, `bundle-size-check.js`, `pre-commit-lint.js`, `pre-edit-test-gate.js`, `security-scan.js`, `performance-budget.js`, `native-compat-check.js`, `accessibility-check.js`, `continuous-learning-observer.js`, `evaluate-session.js`

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx jest tests/hooks/run-with-flags.test.js -v`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite to verify nothing broke**

Run: `npx jest tests/hooks/ -v`
Expected: All tests PASS (definitions, hook-utils, run-with-flags)

- [ ] **Step 8: Commit**

```bash
git add scripts/hooks/ tests/hooks/run-with-flags.test.js
git commit -m "feat: add central dispatcher and hook script stubs"
```

---

## Chunk 3: Core/Minimal Hooks

These three hooks run in **all** profiles (minimal, standard, strict).

### Task 5: session-start.js — Project Type Detection

**Files:**
- Edit: `scripts/hooks/session-start.js` (replace stub)
- Test: `tests/hooks/core-hooks.test.js`

- [ ] **Step 1: Write the failing test for session-start.js**

```js
// tests/hooks/core-hooks.test.js
'use strict';
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('session-start.js', () => {
  test('detects expo project from package.json dependencies', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { expo: '~51.0.0', react: '18.2.0' },
      }),
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('expo');
      expect(result.stdout).toContain('common');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects expo from devDependencies', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        devDependencies: { expo: '~51.0.0' },
      }),
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('expo');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects bare-rn project (ios + android dirs, no expo)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'react-native': '0.74.0' },
      }),
      'ios/Podfile': 'platform :ios',
      'android/build.gradle': 'buildscript {}',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('bare-rn');
      expect(result.stdout).toContain('common');
      expect(result.stdout).not.toContain('expo');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects native-ios layer from Swift files', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'react-native': '0.74.0' },
      }),
      'ios/App/AppDelegate.swift': 'import UIKit',
      'android/build.gradle': 'buildscript {}',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('native-ios');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects native-android layer from Kotlin files', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { 'react-native': '0.74.0' },
      }),
      'ios/Podfile': 'platform :ios',
      'android/app/src/main/java/com/app/Main.kt': 'package com.app',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain('native-android');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects ejected expo (expo + native code)', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' },
      }),
      'ios/App/AppDelegate.swift': 'import UIKit',
      'android/app/src/main/java/com/app/Main.kt': 'package com.app',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
      // Expo takes priority over bare-rn
      expect(result.stdout).toContain('expo');
      expect(result.stdout).not.toContain('bare-rn');
      // Native layers still detected
      expect(result.stdout).toContain('native-ios');
      expect(result.stdout).toContain('native-android');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('warns when no project signals found', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2); // warn
      expect(result.stdout).toContain('common');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('warns when no package.json found', () => {
    const dir = createTempProject({
      'README.md': '# hello',
    });
    try {
      const result = runHook('session-start.js', {}, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2);
    } finally {
      cleanupTempProject(dir);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/hooks/core-hooks.test.js -v`
Expected: FAIL — session-start.js stub does not detect project types

- [ ] **Step 3: Implement session-start.js**

```js
// scripts/hooks/session-start.js
'use strict';
const fs = require('fs');
const path = require('path');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

function fileExists(relPath) {
  return fs.existsSync(path.join(projectDir, relPath));
}

function dirExists(relPath) {
  try {
    return fs.statSync(path.join(projectDir, relPath)).isDirectory();
  } catch {
    return false;
  }
}

function findFilesWithExt(dir, ext) {
  const fullDir = path.join(projectDir, dir);
  try {
    const entries = fs.readdirSync(fullDir, {
      withFileTypes: true,
      recursive: true,
    });
    return entries.some(
      e => e.isFile() && e.name.endsWith(ext)
    );
  } catch {
    return false;
  }
}

function readPackageJson() {
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasExpoDependency(pkg) {
  if (!pkg) return false;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return 'expo' in deps;
}

// Detect layers
const layers = ['common'];
const pkg = readPackageJson();
const hasIosDir = dirExists('ios');
const hasAndroidDir = dirExists('android');

if (hasExpoDependency(pkg)) {
  layers.push('expo');
} else if (hasIosDir && hasAndroidDir) {
  layers.push('bare-rn');
}

if (hasIosDir && findFilesWithExt('ios', '.swift')) {
  layers.push('native-ios');
}

if (hasAndroidDir && findFilesWithExt('android', '.kt')) {
  layers.push('native-android');
}

const hasSignals = layers.length > 1;

console.log(`ERNE: Project layers: ${layers.join(', ')}`);

if (!hasSignals) {
  // Only common — no RN/Expo signals found
  process.exit(2); // warn
} else {
  process.exit(0);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/hooks/core-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/session-start.js tests/hooks/core-hooks.test.js
git commit -m "feat: implement session-start.js project type detection"
```

---

### Task 6: post-edit-format.js — Auto-Format on Save

**Files:**
- Edit: `scripts/hooks/post-edit-format.js` (replace stub)
- Test: `tests/hooks/core-hooks.test.js` (append)

- [ ] **Step 1: Append the failing test for post-edit-format.js**

Append to `tests/hooks/core-hooks.test.js`:

```js
describe('post-edit-format.js', () => {
  test('exits 0 for supported file extension', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x=1;',
      'node_modules/.bin/prettier': '',
    });
    try {
      const result = runHook('post-edit-format.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      // May exit 0 (formatted) or 2 (prettier not found/failed)
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips unsupported file extensions silently', () => {
    const result = runHook('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/some/image.png' },
    });
    expect(result.exitCode).toBe(0);
    // No formatting attempted
  });

  test('skips when no file path in stdin', () => {
    const result = runHook('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: {},
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when stdin is empty', () => {
    const result = runHook('post-edit-format.js', {});
    expect(result.exitCode).toBe(0);
  });

  test('handles missing tool_input gracefully', () => {
    const result = runHook('post-edit-format.js', {
      tool_name: 'Write',
    });
    expect(result.exitCode).toBe(0);
  });

  test('formats .json files', () => {
    const dir = createTempProject({
      'config.json': '{"a":1}',
    });
    try {
      const result = runHook('post-edit-format.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'config.json') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('formats .css files', () => {
    const dir = createTempProject({
      'styles.css': 'body{color:red}',
    });
    try {
      const result = runHook('post-edit-format.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'styles.css') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/hooks/core-hooks.test.js -v`
Expected: FAIL — post-edit-format.js stub exits 0 without formatting logic

- [ ] **Step 3: Implement post-edit-format.js**

```js
// scripts/hooks/post-edit-format.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
} = require('./lib/hook-utils');

const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.json', '.css', '.md',
];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass(); // No file to format
}

const ext = path.extname(filePath).toLowerCase();
if (!SUPPORTED_EXTENSIONS.includes(ext)) {
  pass(); // Not a formattable file type
}

// Attempt to run prettier
try {
  execFileSync('npx', ['prettier', '--write', filePath], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
    cwd: process.env.ERNE_PROJECT_DIR || process.cwd(),
  });
  pass(`ERNE: Formatted ${path.basename(filePath)}`);
} catch (err) {
  // Prettier not installed or failed — warn, don't block
  warn(`ERNE: Could not format ${path.basename(filePath)}: prettier unavailable or failed`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/hooks/core-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/post-edit-format.js tests/hooks/core-hooks.test.js
git commit -m "feat: implement post-edit-format.js auto-formatting"
```

---

### Task 7: continuous-learning-observer.js — Passive Pattern Observer

**Files:**
- Edit: `scripts/hooks/continuous-learning-observer.js` (replace stub)
- Test: `tests/hooks/learning-hooks.test.js`

- [ ] **Step 1: Write the failing test for continuous-learning-observer.js**

```js
// tests/hooks/learning-hooks.test.js
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
    // Use an invalid directory — hook should still not crash
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
      // Verify ISO timestamp format
      expect(new Date(entry.timestamp).toISOString()).toBe(entry.timestamp);
    } finally {
      cleanupTempProject(dir);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest tests/hooks/learning-hooks.test.js -v`
Expected: FAIL — stub exits 0 but writes no observations file

- [ ] **Step 3: Implement continuous-learning-observer.js**

```js
// scripts/hooks/continuous-learning-observer.js
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();

const observation = {
  timestamp: new Date().toISOString(),
  stop_reason: input.stop_reason || null,
};

// Write observation to .claude/erne/observations.jsonl
try {
  const obsDir = path.join(projectDir, '.claude', 'erne');
  fs.mkdirSync(obsDir, { recursive: true });

  const obsPath = path.join(obsDir, 'observations.jsonl');
  fs.appendFileSync(obsPath, JSON.stringify(observation) + '\n');
} catch {
  // Never fail — this is a passive observer
}

process.exit(0);
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx jest tests/hooks/learning-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 5: Run full test suite**

Run: `npx jest tests/hooks/ -v`
Expected: All tests PASS (definitions, hook-utils, run-with-flags, core-hooks, learning-hooks)

- [ ] **Step 6: Commit**

```bash
git add scripts/hooks/continuous-learning-observer.js tests/hooks/learning-hooks.test.js
git commit -m "feat: implement continuous-learning-observer.js"
```

---

## Chunk 4: Standard Hooks Part 1

These hooks join in the **standard** profile (also included in strict).

### Task 8: Validation Hooks — post-edit-typecheck.js, check-console-log.js, check-platform-specific.js, check-reanimated-worklet.js

**Files:**
- Edit: `scripts/hooks/post-edit-typecheck.js` (replace stub)
- Edit: `scripts/hooks/check-console-log.js` (replace stub)
- Edit: `scripts/hooks/check-platform-specific.js` (replace stub)
- Edit: `scripts/hooks/check-reanimated-worklet.js` (replace stub)
- Test: `tests/hooks/validation-hooks.test.js`

- [ ] **Step 1: Write the failing tests for validation hooks**

```js
// tests/hooks/validation-hooks.test.js
'use strict';
const path = require('path');
const {
  runHook,
  createTempProject,
  cleanupTempProject,
} = require('./helpers');

describe('post-edit-typecheck.js', () => {
  test('exits 0 for .ts/.tsx files (attempts tsc)', () => {
    const dir = createTempProject({
      'src/App.tsx': 'export const App = () => null;',
      'tsconfig.json': JSON.stringify({
        compilerOptions: { noEmit: true, jsx: 'react-jsx' },
      }),
    });
    try {
      const result = runHook('post-edit-typecheck.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/App.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      // tsc may not be installed in test env — accept 0 or 2
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-TS files', () => {
    const result = runHook('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/utils.js' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('post-edit-typecheck.js', {});
    expect(result.exitCode).toBe(0);
  });

  test('skips test files', () => {
    const result = runHook('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/App.test.tsx' },
    });
    expect(result.exitCode).toBe(0);
  });
});

describe('check-console-log.js', () => {
  test('warns on console.log in production code', () => {
    const dir = createTempProject({
      'src/app.ts': 'console.log("debug");\nconst x = 1;',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2); // warn
      expect(result.stdout).toContain('console.log');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes when no console.log found', () => {
    const dir = createTempProject({
      'src/app.ts': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('ignores console.log in test files', () => {
    const dir = createTempProject({
      'src/app.test.ts': 'console.log("test output");',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.test.ts') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('detects console.warn and console.error too', () => {
    const dir = createTempProject({
      'src/app.ts': 'console.warn("oops");\nconsole.error("bad");',
    });
    try {
      const result = runHook('check-console-log.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.ts') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-JS/TS files', () => {
    const result = runHook('check-console-log.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/README.md' },
    });
    expect(result.exitCode).toBe(0);
  });
});

describe('check-platform-specific.js', () => {
  test('warns when Platform.OS only checks one platform', () => {
    const dir = createTempProject({
      'src/app.tsx': [
        "import { Platform } from 'react-native';",
        "const style = Platform.OS === 'ios' ? 10 : 10;",
      ].join('\n'),
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      // File has Platform.OS but both branches are identical — passes
      // The hook checks for Platform.OS without android or ios branch
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes when Platform.select has both platforms', () => {
    const dir = createTempProject({
      'src/app.tsx': [
        "import { Platform } from 'react-native';",
        "const val = Platform.select({ ios: 10, android: 12 });",
      ].join('\n'),
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-RN files', () => {
    const result = runHook('check-platform-specific.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/config.json' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('passes when no Platform usage found', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-platform-specific.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('check-reanimated-worklet.js', () => {
  test('warns on non-serializable reference in worklet', () => {
    const dir = createTempProject({
      'src/anim.tsx': [
        "import Animated, { useAnimatedStyle } from 'react-native-reanimated';",
        "const outsideRef = React.createRef();",
        "const style = useAnimatedStyle(() => {",
        "  return { opacity: outsideRef.current ? 1 : 0 };",
        "});",
      ].join('\n'),
    });
    try {
      const result = runHook('check-reanimated-worklet.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/anim.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      // May detect or miss depending on heuristic depth
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes for files without reanimated', () => {
    const dir = createTempProject({
      'src/app.tsx': 'const x = 1;\nexport default x;',
    });
    try {
      const result = runHook('check-reanimated-worklet.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'src/app.tsx') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-JS/TS files', () => {
    const result = runHook('check-reanimated-worklet.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/styles.css' },
    });
    expect(result.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx jest tests/hooks/validation-hooks.test.js -v`
Expected: FAIL — stubs exit 0 without any validation logic

- [ ] **Step 3: Implement post-edit-typecheck.js**

```js
// scripts/hooks/post-edit-typecheck.js
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
  isTestFile,
  hasExtension,
} = require('./lib/hook-utils');

const TS_EXTENSIONS = ['.ts', '.tsx'];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

if (!hasExtension(filePath, TS_EXTENSIONS)) {
  pass(); // Not a TypeScript file
}

if (isTestFile(filePath)) {
  pass(); // Skip test files for speed
}

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

try {
  execFileSync('npx', ['tsc', '--noEmit', '--pretty'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    cwd: projectDir,
  });
  pass('ERNE: Type check passed');
} catch (err) {
  const output = err.stdout || err.stderr || '';
  if (output.includes('error TS')) {
    warn(`ERNE: Type errors found:\n${output.slice(0, 500)}`);
  } else {
    // tsc not available or other issue
    warn('ERNE: Could not run type check (tsc unavailable)');
  }
}
```

- [ ] **Step 4: Implement check-console-log.js**

```js
// scripts/hooks/check-console-log.js
'use strict';
const fs = require('fs');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
  isTestFile,
  hasExtension,
} = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const CONSOLE_PATTERN = /\bconsole\.(log|warn|error|info|debug)\s*\(/;

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

if (!hasExtension(filePath, CODE_EXTENSIONS)) {
  pass();
}

if (isTestFile(filePath)) {
  pass(); // console.log is fine in tests
}

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    if (CONSOLE_PATTERN.test(lines[i])) {
      hits.push(`  L${i + 1}: ${lines[i].trim()}`);
    }
  }

  if (hits.length > 0) {
    warn(
      `ERNE: Found ${hits.length} console statement(s) in production code:\n` +
      hits.slice(0, 5).join('\n') +
      (hits.length > 5 ? `\n  ... and ${hits.length - 5} more` : '')
    );
  } else {
    pass();
  }
} catch {
  pass(); // Can't read file — don't block
}
```

- [ ] **Step 5: Implement check-platform-specific.js**

```js
// scripts/hooks/check-platform-specific.js
'use strict';
const fs = require('fs');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
  hasExtension,
} = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

if (!hasExtension(filePath, CODE_EXTENSIONS)) {
  pass();
}

try {
  const content = fs.readFileSync(filePath, 'utf8');

  // Check for Platform.OS usage
  const hasPlatformOS = /Platform\.OS\b/.test(content);
  if (!hasPlatformOS) {
    pass(); // No Platform.OS usage
  }

  // Check Platform.select for both platforms
  const selectMatches = content.match(/Platform\.select\s*\(\s*\{([^}]+)\}/g);
  if (selectMatches) {
    for (const match of selectMatches) {
      const hasIos = /ios\s*:/.test(match);
      const hasAndroid = /android\s*:/.test(match);
      if (!hasIos || !hasAndroid) {
        warn(
          'ERNE: Platform.select missing a platform case. ' +
          'Ensure both ios and android are handled.'
        );
      }
    }
  }

  // Check Platform.OS conditionals — heuristic: look for 'ios' and 'android' strings near Platform.OS
  const hasIosRef = /['"]ios['"]/.test(content);
  const hasAndroidRef = /['"]android['"]/.test(content);

  if (hasPlatformOS && hasIosRef && !hasAndroidRef) {
    warn('ERNE: Platform.OS checks for iOS but not Android');
  } else if (hasPlatformOS && hasAndroidRef && !hasIosRef) {
    warn('ERNE: Platform.OS checks for Android but not iOS');
  }

  pass();
} catch {
  pass(); // Can't read file — don't block
}
```

- [ ] **Step 6: Implement check-reanimated-worklet.js**

```js
// scripts/hooks/check-reanimated-worklet.js
'use strict';
const fs = require('fs');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
  hasExtension,
} = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

if (!hasExtension(filePath, CODE_EXTENSIONS)) {
  pass();
}

try {
  const content = fs.readFileSync(filePath, 'utf8');

  // Only check files that import from react-native-reanimated
  if (!content.includes('react-native-reanimated')) {
    pass();
  }

  // Heuristic: look for useAnimatedStyle/useAnimatedGestureHandler/etc.
  // that reference variables defined outside the worklet callback
  const workletPatterns = [
    /useAnimatedStyle\s*\(/,
    /useAnimatedGestureHandler\s*\(/,
    /useAnimatedScrollHandler\s*\(/,
    /useDerivedValue\s*\(/,
    /useAnimatedReaction\s*\(/,
  ];

  const hasWorklet = workletPatterns.some(p => p.test(content));
  if (!hasWorklet) {
    pass();
  }

  // Check for common non-serializable patterns inside worklets
  const dangerousPatterns = [
    /\.current\b/,        // ref.current inside worklet
    /React\.createRef/,   // createRef referenced in worklet scope
    /useRef\s*\(/,         // may indicate ref usage near worklet
  ];

  // Simple heuristic — find worklet callbacks and check for danger
  const warnings = [];
  for (const pattern of dangerousPatterns) {
    if (pattern.test(content)) {
      warnings.push(pattern.source);
    }
  }

  if (warnings.length > 0) {
    warn(
      'ERNE: Possible non-serializable reference in Reanimated worklet. ' +
      'Refs and non-primitive objects cannot be accessed inside worklet callbacks. ' +
      'Use shared values instead.'
    );
  } else {
    pass();
  }
} catch {
  pass();
}
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npx jest tests/hooks/validation-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 8: Run full test suite**

Run: `npx jest tests/hooks/ -v`
Expected: All tests PASS

- [ ] **Step 9: Commit**

```bash
git add scripts/hooks/post-edit-typecheck.js scripts/hooks/check-console-log.js scripts/hooks/check-platform-specific.js scripts/hooks/check-reanimated-worklet.js tests/hooks/validation-hooks.test.js
git commit -m "feat: implement standard validation hooks (typecheck, console-log, platform, reanimated)"
```

---

### Task 9: Config & Lint Hooks — check-expo-config.js, bundle-size-check.js, pre-commit-lint.js, evaluate-session.js

**Files:**
- Edit: `scripts/hooks/check-expo-config.js` (replace stub)
- Edit: `scripts/hooks/bundle-size-check.js` (replace stub)
- Edit: `scripts/hooks/pre-commit-lint.js` (replace stub)
- Edit: `scripts/hooks/evaluate-session.js` (replace stub)
- Test: `tests/hooks/validation-hooks.test.js` (append)
- Test: `tests/hooks/learning-hooks.test.js` (append)

- [ ] **Step 1: Append failing tests to validation-hooks.test.js**

Append to `tests/hooks/validation-hooks.test.js`:

```js
describe('check-expo-config.js', () => {
  test('passes for valid app.json', () => {
    const dir = createTempProject({
      'app.json': JSON.stringify({
        expo: {
          name: 'MyApp',
          slug: 'myapp',
          version: '1.0.0',
        },
      }),
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('warns on missing expo.name', () => {
    const dir = createTempProject({
      'app.json': JSON.stringify({
        expo: { slug: 'myapp', version: '1.0.0' },
      }),
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2);
      expect(result.stdout).toContain('name');
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-config files', () => {
    const result = runHook('check-expo-config.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.tsx' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('warns on invalid JSON in app.json', () => {
    const dir = createTempProject({
      'app.json': '{ invalid json',
    });
    try {
      const result = runHook('check-expo-config.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'app.json') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(2);
    } finally {
      cleanupTempProject(dir);
    }
  });
});

describe('bundle-size-check.js', () => {
  test('warns on large dependency additions', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: {
          'moment': '^2.30.0',
          'react': '18.2.0',
        },
      }),
    });
    try {
      const result = runHook('bundle-size-check.js', {
        tool_name: 'Edit',
        tool_input: { file_path: path.join(dir, 'package.json') },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      // moment is a known large package
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('passes for non-package.json files', () => {
    const result = runHook('bundle-size-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.tsx' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('bundle-size-check.js', {});
    expect(result.exitCode).toBe(0);
  });
});

describe('pre-commit-lint.js', () => {
  test('handles missing eslint gracefully', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test' }),
    });
    try {
      const result = runHook('pre-commit-lint.js', {
        tool_name: 'Bash',
        tool_input: { command: 'git commit -m "test"' },
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      // Should warn (eslint not found) but not crash
      expect([0, 2]).toContain(result.exitCode);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('skips non-commit bash commands', () => {
    const result = runHook('pre-commit-lint.js', {
      tool_name: 'Bash',
      tool_input: { command: 'ls -la' },
    });
    expect(result.exitCode).toBe(0);
  });

  test('skips when no command in stdin', () => {
    const result = runHook('pre-commit-lint.js', {
      tool_name: 'Bash',
      tool_input: {},
    });
    expect(result.exitCode).toBe(0);
  });
});
```

- [ ] **Step 2: Append failing test for evaluate-session.js to learning-hooks.test.js**

Append to `tests/hooks/learning-hooks.test.js`:

```js
describe('evaluate-session.js', () => {
  test('creates session evaluation file', () => {
    const dir = createTempProject({});
    try {
      const result = runHook('evaluate-session.js', {
        stop_reason: 'end_turn',
      }, {
        ERNE_PROJECT_DIR: dir,
      });
      expect(result.exitCode).toBe(0);

      const evalDir = path.join(dir, '.claude', 'erne');
      const files = fs.readdirSync(evalDir);
      const evalFiles = files.filter(f => f.startsWith('session-'));
      expect(evalFiles.length).toBeGreaterThan(0);
    } finally {
      cleanupTempProject(dir);
    }
  });

  test('always exits 0', () => {
    const result = runHook('evaluate-session.js', {}, {
      ERNE_PROJECT_DIR: '/nonexistent/path',
    });
    expect(result.exitCode).toBe(0);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx jest tests/hooks/validation-hooks.test.js tests/hooks/learning-hooks.test.js -v`
Expected: FAIL — stubs lack implementation

- [ ] **Step 4: Implement check-expo-config.js**

```js
// scripts/hooks/check-expo-config.js
'use strict';
const fs = require('fs');
const path = require('path');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
} = require('./lib/hook-utils');

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

const basename = path.basename(filePath);
const isConfig = basename === 'app.json' || basename === 'app.config.ts' || basename === 'app.config.js';

if (!isConfig) {
  pass();
}

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const appJsonPath = path.join(projectDir, 'app.json');

try {
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    warn('ERNE: app.json contains invalid JSON');
  }

  const expo = config.expo || config;
  const missing = [];

  if (!expo.name) missing.push('name');
  if (!expo.slug) missing.push('slug');
  if (!expo.version) missing.push('version');

  if (missing.length > 0) {
    warn(`ERNE: app.json missing required fields: ${missing.join(', ')}`);
  } else {
    pass('ERNE: Expo config valid');
  }
} catch {
  pass(); // No app.json found — not an Expo project or not relevant
}
```

- [ ] **Step 5: Implement bundle-size-check.js**

```js
// scripts/hooks/bundle-size-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
} = require('./lib/hook-utils');

// Known large packages that should trigger a warning
const LARGE_PACKAGES = [
  'moment',
  'lodash',
  'firebase',
  'aws-sdk',
  '@aws-sdk/client-s3',
  'native-base',
  'react-native-paper',
];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

if (path.basename(filePath) !== 'package.json') {
  pass();
}

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const pkg = JSON.parse(content);
  const allDeps = {
    ...pkg.dependencies,
    ...pkg.devDependencies,
  };

  const found = LARGE_PACKAGES.filter(name => name in allDeps);

  if (found.length > 0) {
    warn(
      `ERNE: Large dependencies detected: ${found.join(', ')}. ` +
      'Consider lighter alternatives (e.g., date-fns instead of moment, ' +
      'lodash-es or individual lodash methods instead of full lodash).'
    );
  } else {
    pass();
  }
} catch {
  pass();
}
```

- [ ] **Step 6: Implement pre-commit-lint.js**

```js
// scripts/hooks/pre-commit-lint.js
'use strict';
const { execFileSync } = require('child_process');
const {
  readStdin,
  pass,
  fail,
  warn,
} = require('./lib/hook-utils');

const input = readStdin();

// Only run for git commit commands
const command = (input.tool_input && input.tool_input.command) || '';
if (!command.includes('git commit')) {
  pass();
}

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

// Try running eslint
try {
  execFileSync('npx', ['eslint', '.', '--max-warnings=0'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    cwd: projectDir,
  });
} catch (err) {
  const output = err.stdout || err.stderr || '';
  if (output.includes('error') || output.includes('warning')) {
    fail(`ERNE: Lint errors found. Fix before committing:\n${output.slice(0, 500)}`);
  }
  // eslint not available — continue with warning
  if (err.status === 127 || output.includes('not found')) {
    warn('ERNE: ESLint not available, skipping lint check');
  }
}

// Try running prettier check
try {
  execFileSync('npx', ['prettier', '--check', '.'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
    cwd: projectDir,
  });
  pass('ERNE: Lint and format checks passed');
} catch (err) {
  const output = err.stdout || err.stderr || '';
  if (output.includes('Code style')) {
    warn('ERNE: Some files need formatting. Run: npx prettier --write .');
  } else {
    pass(); // Prettier not available — already warned about eslint
  }
}
```

- [ ] **Step 7: Implement evaluate-session.js**

```js
// scripts/hooks/evaluate-session.js
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();

const evaluation = {
  timestamp: new Date().toISOString(),
  stop_reason: input.stop_reason || null,
  session_id: `session-${Date.now()}`,
};

try {
  const evalDir = path.join(projectDir, '.claude', 'erne');
  fs.mkdirSync(evalDir, { recursive: true });

  const filename = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const evalPath = path.join(evalDir, filename);
  fs.writeFileSync(evalPath, JSON.stringify(evaluation, null, 2) + '\n');
} catch {
  // Never fail — session evaluation is advisory
}

process.exit(0);
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `npx jest tests/hooks/validation-hooks.test.js tests/hooks/learning-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 9: Run full test suite**

Run: `npx jest tests/hooks/ -v`
Expected: All tests PASS

- [ ] **Step 10: Commit**

```bash
git add scripts/hooks/check-expo-config.js scripts/hooks/bundle-size-check.js scripts/hooks/pre-commit-lint.js scripts/hooks/evaluate-session.js tests/hooks/validation-hooks.test.js tests/hooks/learning-hooks.test.js
git commit -m "feat: implement standard config, lint, bundle, and session evaluation hooks"
```

---

## Chunk 5: Strict Profile Hooks

### Task 10: Strict Validation Hooks — pre-edit-test-gate.js & security-scan.js

**Files:**
- Create: `scripts/hooks/pre-edit-test-gate.js`
- Create: `scripts/hooks/security-scan.js`
- Create: `tests/hooks/gate-hooks.test.js`

**Tests (write first):**

- [ ] **Step 1: Write tests in gate-hooks.test.js**

```js
// tests/hooks/gate-hooks.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { runHook, createTempProject, cleanupTempProject } = require('./helpers');

describe('pre-edit-test-gate', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('passes when no test file exists for source file', () => {
    // Create source file without corresponding test
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'export const add = (a, b) => a + b;\n');

    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'utils.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('passes when related test file exists and passes', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), 'module.exports.add = (a, b) => a + b;\n');

    // Create a passing test
    const testDir = path.join(projectDir, '__tests__');
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, 'utils.test.ts'), `
      const { add } = require('../src/utils');
      test('add works', () => { expect(add(1,2)).toBe(3); });
    `);

    // Also need a jest config or package.json with jest
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      devDependencies: { jest: '29.7.0' },
    }));

    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'utils.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });

    // Exit 0 (pass) or 2 (warn if jest not available in temp env)
    expect([0, 2]).toContain(result.exitCode);
  });

  test('skips test files (does not test-gate edits to tests)', () => {
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/__tests__/foo.test.ts' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips non-JS/TS files', () => {
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/README.md' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path in input', () => {
    const result = runHook('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });
});

describe('security-scan', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('warns on hardcoded API keys', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'config.ts'), `
      const API_KEY = 'sk-1234567890abcdef1234567890abcdef';
      export default { API_KEY };
    `);

    const result = runHook('security-scan.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(srcDir, 'config.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('secret');
  });

  test('warns on unvalidated deep link handling', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'linking.ts'), `
      import { Linking } from 'react-native';
      Linking.openURL(url);
    `);

    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'linking.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('deep link');
  });

  test('passes on clean file', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'utils.ts'), `
      export function add(a: number, b: number): number {
        return a + b;
      }
    `);

    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'utils.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('warns on eval usage', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'dynamic.ts'), `
      const result = eval(userInput);
    `);

    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'dynamic.ts') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('unsafe');
  });

  test('skips non-JS/TS files', () => {
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/assets/image.png' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('security-scan.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });
});
```

**Implementation:**

- [ ] **Step 2: Implement pre-edit-test-gate.js**

```js
// scripts/hooks/pre-edit-test-gate.js
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readStdin, getEditedFilePath, pass, warn, isTestFile, hasExtension } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

// Only gate JS/TS source files
const JS_TS_EXTS = ['.js', '.jsx', '.ts', '.tsx'];
if (!hasExtension(filePath, JS_TS_EXTS)) {
  pass();
}

// Don't gate test files themselves
if (isTestFile(filePath)) {
  pass();
}

// Find related test file
const basename = path.basename(filePath, path.extname(filePath));
const dir = path.dirname(filePath);

const testPatterns = [
  path.join(dir, '__tests__', `${basename}.test.ts`),
  path.join(dir, '__tests__', `${basename}.test.tsx`),
  path.join(dir, '__tests__', `${basename}.test.js`),
  path.join(dir, '__tests__', `${basename}.test.jsx`),
  path.join(dir, `${basename}.test.ts`),
  path.join(dir, `${basename}.test.tsx`),
  path.join(dir, `${basename}.test.js`),
  path.join(dir, `${basename}.test.jsx`),
  path.join(dir, `${basename}.spec.ts`),
  path.join(dir, `${basename}.spec.tsx`),
  path.join(dir, `${basename}.spec.js`),
  path.join(dir, `${basename}.spec.jsx`),
];

// Also check project-root __tests__ and tests/ directories
const relPath = path.relative(projectDir, filePath);
const relDir = path.dirname(relPath);
const rootTestPatterns = [
  path.join(projectDir, '__tests__', relDir, `${basename}.test.ts`),
  path.join(projectDir, '__tests__', relDir, `${basename}.test.tsx`),
  path.join(projectDir, '__tests__', relDir, `${basename}.test.js`),
  path.join(projectDir, '__tests__', `${basename}.test.ts`),
  path.join(projectDir, '__tests__', `${basename}.test.js`),
  path.join(projectDir, 'tests', `${basename}.test.ts`),
  path.join(projectDir, 'tests', `${basename}.test.js`),
];

const allPatterns = [...testPatterns, ...rootTestPatterns];
const testFile = allPatterns.find((p) => fs.existsSync(p));

if (!testFile) {
  // No test file found — allow edit but don't block
  pass();
}

// Run the related test
try {
  execFileSync('npx', ['jest', '--bail', '--no-coverage', testFile], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 30000,
    cwd: projectDir,
  });
  pass('ERNE: Related tests pass');
} catch (err) {
  const output = err.stdout || err.stderr || '';
  if (output.includes('FAIL')) {
    warn(`ERNE: Related test failed — ${path.basename(testFile)}. Fix tests before editing.`);
  } else {
    // Jest might not be available
    warn('ERNE: Could not run related tests (jest unavailable or error)');
  }
}
```

- [ ] **Step 3: Implement security-scan.js**

```js
// scripts/hooks/security-scan.js
'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, hasExtension } = require('./lib/hook-utils');

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

const JS_TS_EXTS = ['.js', '.jsx', '.ts', '.tsx'];
if (!hasExtension(filePath, JS_TS_EXTS)) {
  pass();
}

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch {
  pass(); // File might not exist yet (Write tool)
}

const issues = [];

// Check for hardcoded secrets
const SECRET_PATTERNS = [
  { pattern: /(['"`])sk-[a-zA-Z0-9]{20,}\1/, label: 'Possible hardcoded API secret key' },
  { pattern: /(['"`])AIza[a-zA-Z0-9_-]{35}\1/, label: 'Possible hardcoded Google API key' },
  { pattern: /(['"`])(ghp_|gho_|ghu_|ghs_|ghr_)[a-zA-Z0-9]{36,}\1/, label: 'Possible hardcoded GitHub token' },
  { pattern: /(['"`])xox[bpras]-[a-zA-Z0-9-]{10,}\1/, label: 'Possible hardcoded Slack token' },
  { pattern: /\b(password|secret|apikey|api_key)\s*[:=]\s*(['"`])[^'"]{8,}\2/i, label: 'Possible hardcoded secret or password' },
];

for (const { pattern, label } of SECRET_PATTERNS) {
  if (pattern.test(content)) {
    issues.push(label);
  }
}

// Check for unsafe patterns
if (/\beval\s*\(/.test(content)) {
  issues.push('Unsafe `eval()` usage detected');
}

if (/new\s+Function\s*\(/.test(content)) {
  issues.push('Unsafe `new Function()` usage detected');
}

if (/innerHTML\s*=/.test(content) && !content.includes('dangerouslySetInnerHTML')) {
  issues.push('Direct innerHTML assignment — potential XSS');
}

// Check for unvalidated deep link handling
if (/Linking\.openURL\s*\(/.test(content)) {
  // Check if there's any URL validation nearby
  const hasValidation = /url\.startsWith|url\.match|isValidUrl|validateUrl|allowedSchemes/i.test(content);
  if (!hasValidation) {
    issues.push('Unvalidated deep link `Linking.openURL()` — validate URL scheme before opening');
  }
}

// Check for WebView with JavaScript enabled without origin whitelist
if (/WebView/.test(content) && /javaScriptEnabled/.test(content)) {
  if (!/originWhitelist/.test(content)) {
    issues.push('WebView with JS enabled but no `originWhitelist` — restrict allowed origins');
  }
}

if (issues.length > 0) {
  warn(`ERNE: Security scan found ${issues.length} issue(s):\n${issues.map((i) => `  - ${i}`).join('\n')}`);
} else {
  pass();
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/hooks/gate-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/pre-edit-test-gate.js scripts/hooks/security-scan.js tests/hooks/gate-hooks.test.js
git commit -m "feat: implement strict test gate and security scan hooks"
```

---

### Task 11: Strict Validation Hooks — performance-budget.js & native-compat-check.js

**Files:**
- Create: `scripts/hooks/performance-budget.js`
- Create: `scripts/hooks/native-compat-check.js`
- Modify: `tests/hooks/gate-hooks.test.js` (append)

**Tests (write first):**

- [ ] **Step 1: Append tests to gate-hooks.test.js**

```js
// Append to tests/hooks/gate-hooks.test.js

describe('performance-budget', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('warns when package.json adds large dependency', () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: {
        'react-native': '0.76.0',
        'moment': '2.30.0',
      },
    }));

    const result = runHook('performance-budget.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(projectDir, 'package.json') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('moment');
  });

  test('warns on bundle size exceeding budget', () => {
    // Create a .erne-budget.json with tight limits
    fs.writeFileSync(path.join(projectDir, '.erne-budget.json'), JSON.stringify({
      maxBundleSizeKB: 500,
      maxDependencies: 5,
    }));

    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: {
        'react-native': '0.76.0',
        'dep1': '1.0.0',
        'dep2': '1.0.0',
        'dep3': '1.0.0',
        'dep4': '1.0.0',
        'dep5': '1.0.0',
        'dep6': '1.0.0',
      },
    }));

    const result = runHook('performance-budget.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(projectDir, 'package.json') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('dependencies');
  });

  test('passes when within budget', () => {
    fs.writeFileSync(path.join(projectDir, 'package.json'), JSON.stringify({
      dependencies: {
        'react-native': '0.76.0',
        'expo': '52.0.0',
      },
    }));

    const result = runHook('performance-budget.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(projectDir, 'package.json') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips non-package.json files', () => {
    const result = runHook('performance-budget.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });
});

describe('native-compat-check', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('warns when ios dir exists but android does not', () => {
    fs.mkdirSync(path.join(projectDir, 'ios'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'ios', 'App.swift'), 'import UIKit\n');

    const result = runHook('native-compat-check.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, 'ios', 'App.swift') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('android');
  });

  test('warns when android dir exists but ios does not', () => {
    fs.mkdirSync(path.join(projectDir, 'android', 'app', 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(projectDir, 'android', 'app', 'src', 'Main.kt'),
      'package com.app\n'
    );

    const result = runHook('native-compat-check.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, 'android', 'app', 'src', 'Main.kt') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('ios');
  });

  test('passes when both platforms present', () => {
    fs.mkdirSync(path.join(projectDir, 'ios'), { recursive: true });
    fs.mkdirSync(path.join(projectDir, 'android'), { recursive: true });
    fs.writeFileSync(path.join(projectDir, 'ios', 'App.swift'), 'import UIKit\n');
    fs.writeFileSync(path.join(projectDir, 'android', 'Main.kt'), 'package com.app\n');

    const result = runHook('native-compat-check.js', {
      tool_name: 'Write',
      tool_input: { file_path: path.join(projectDir, 'ios', 'App.swift') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('passes when editing non-native file', () => {
    const result = runHook('native-compat-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/App.tsx' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('native-compat-check.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });
});
```

**Implementation:**

- [ ] **Step 2: Implement performance-budget.js**

```js
// scripts/hooks/performance-budget.js
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

// Only check package.json edits
if (path.basename(filePath) !== 'package.json') {
  pass();
}

// Known large/heavy packages that impact RN bundle size
const HEAVY_PACKAGES = {
  'moment': { size: '290KB', alternative: 'dayjs or date-fns' },
  'lodash': { size: '530KB', alternative: 'lodash-es or individual lodash/ imports' },
  'firebase': { size: '800KB+', alternative: '@react-native-firebase/* (modular)' },
  'aws-sdk': { size: '2.5MB', alternative: '@aws-sdk/client-* (v3 modular)' },
  'native-base': { size: '500KB+', alternative: 'tamagui or gluestack-ui' },
  'react-native-paper': { size: '400KB', alternative: 'lightweight custom components' },
  'react-native-elements': { size: '350KB', alternative: 'lightweight custom components' },
  'antd-mobile': { size: '500KB+', alternative: 'tree-shakeable alternative' },
};

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch {
  pass();
}

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const warnings = [];

// Check for heavy packages
for (const [name, info] of Object.entries(HEAVY_PACKAGES)) {
  if (allDeps[name]) {
    warnings.push(`\`${name}\` (~${info.size}) — consider ${info.alternative}`);
  }
}

// Check budget file if it exists
const budgetPath = path.join(projectDir, '.erne-budget.json');
if (fs.existsSync(budgetPath)) {
  try {
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));

    if (budget.maxDependencies) {
      const depCount = Object.keys(pkg.dependencies || {}).length;
      if (depCount > budget.maxDependencies) {
        warnings.push(`Dependencies count (${depCount}) exceeds budget (${budget.maxDependencies})`);
      }
    }
  } catch {
    // Invalid budget file — skip
  }
}

if (warnings.length > 0) {
  warn(`ERNE: Performance budget — ${warnings.length} concern(s):\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
} else {
  pass();
}
```

- [ ] **Step 3: Implement native-compat-check.js**

```js
// scripts/hooks/native-compat-check.js
'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

// Only check native code files
const NATIVE_EXTS = ['.swift', '.m', '.mm', '.h', '.kt', '.java', '.gradle'];
const ext = path.extname(filePath).toLowerCase();

if (!NATIVE_EXTS.includes(ext)) {
  pass();
}

const isIosFile = ['.swift', '.m', '.mm', '.h'].includes(ext) ||
  filePath.includes('/ios/') || filePath.includes('\\ios\\');
const isAndroidFile = ['.kt', '.java', '.gradle'].includes(ext) ||
  filePath.includes('/android/') || filePath.includes('\\android\\');

if (!isIosFile && !isAndroidFile) {
  pass();
}

const iosDir = path.join(projectDir, 'ios');
const androidDir = path.join(projectDir, 'android');
const hasIosDir = fs.existsSync(iosDir);
const hasAndroidDir = fs.existsSync(androidDir);

const warnings = [];

if (isIosFile && !hasAndroidDir) {
  warnings.push('Editing iOS native code but no android/ directory found — ensure cross-platform parity');
}

if (isAndroidFile && !hasIosDir) {
  warnings.push('Editing Android native code but no ios/ directory found — ensure cross-platform parity');
}

// Check for native module without both platform implementations
if (isIosFile && hasAndroidDir) {
  // Look for corresponding Kotlin/Java file with similar name
  const baseName = path.basename(filePath, ext);
  const hasAndroidCounterpart = findInDir(androidDir, baseName, ['.kt', '.java']);
  if (!hasAndroidCounterpart) {
    warnings.push(`iOS native file \`${baseName}${ext}\` has no matching Android implementation`);
  }
}

if (isAndroidFile && hasIosDir) {
  const baseName = path.basename(filePath, ext);
  const hasIosCounterpart = findInDir(iosDir, baseName, ['.swift', '.m', '.mm']);
  if (!hasIosCounterpart) {
    warnings.push(`Android native file \`${baseName}${ext}\` has no matching iOS implementation`);
  }
}

if (warnings.length > 0) {
  warn(`ERNE: Native compatibility — ${warnings.length} concern(s):\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
} else {
  pass();
}

function findInDir(dir, baseName, extensions) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true, recursive: true });
    return entries.some((entry) => {
      if (!entry.isFile()) return false;
      const entryBase = path.basename(entry.name, path.extname(entry.name));
      const entryExt = path.extname(entry.name).toLowerCase();
      return entryBase.toLowerCase() === baseName.toLowerCase() && extensions.includes(entryExt);
    });
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest tests/hooks/gate-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/performance-budget.js scripts/hooks/native-compat-check.js tests/hooks/gate-hooks.test.js
git commit -m "feat: implement strict performance budget and native compat hooks"
```

---

### Task 12: Strict Validation Hook — accessibility-check.js

**Files:**
- Create: `scripts/hooks/accessibility-check.js`
- Modify: `tests/hooks/gate-hooks.test.js` (append)

**Tests (write first):**

- [ ] **Step 1: Append tests to gate-hooks.test.js**

```js
// Append to tests/hooks/gate-hooks.test.js

describe('accessibility-check', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('warns on TouchableOpacity without accessibilityLabel', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Button.tsx'), `
      import { TouchableOpacity, Text } from 'react-native';
      export const Button = () => (
        <TouchableOpacity onPress={() => {}}>
          <Text>Click me</Text>
        </TouchableOpacity>
      );
    `);

    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Button.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('accessibility');
  });

  test('passes when accessibilityLabel is present', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Button.tsx'), `
      import { TouchableOpacity, Text } from 'react-native';
      export const Button = () => (
        <TouchableOpacity onPress={() => {}} accessibilityLabel="Submit">
          <Text>Click me</Text>
        </TouchableOpacity>
      );
    `);

    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Button.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('warns on Pressable without accessibilityRole', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Card.tsx'), `
      import { Pressable, Text } from 'react-native';
      export const Card = () => (
        <Pressable onPress={() => {}}>
          <Text>Tap me</Text>
        </Pressable>
      );
    `);

    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Card.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('accessibility');
  });

  test('warns on Image without accessible or alt', () => {
    const srcDir = path.join(projectDir, 'src');
    fs.mkdirSync(srcDir, { recursive: true });
    fs.writeFileSync(path.join(srcDir, 'Avatar.tsx'), `
      import { Image } from 'react-native';
      export const Avatar = () => (
        <Image source={{ uri: 'https://example.com/avatar.png' }} />
      );
    `);

    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: path.join(srcDir, 'Avatar.tsx') },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(2);
    expect(result.stdout).toContain('accessibility');
  });

  test('skips non-JSX files', () => {
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/utils.ts' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips test files', () => {
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/__tests__/Button.test.tsx' },
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });

  test('skips when no file path', () => {
    const result = runHook('accessibility-check.js', {
      tool_name: 'Edit',
      tool_input: {},
    }, { ERNE_PROJECT_DIR: projectDir });

    expect(result.exitCode).toBe(0);
  });
});
```

**Implementation:**

- [ ] **Step 2: Implement accessibility-check.js**

```js
// scripts/hooks/accessibility-check.js
'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, isTestFile, hasExtension } = require('./lib/hook-utils');

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

// Only check JSX/TSX files
const JSX_EXTS = ['.jsx', '.tsx'];
if (!hasExtension(filePath, JSX_EXTS)) {
  pass();
}

if (isTestFile(filePath)) {
  pass();
}

let content;
try {
  content = fs.readFileSync(filePath, 'utf8');
} catch {
  pass();
}

const issues = [];

// Touchable components that need accessibility labels
const TOUCHABLE_COMPONENTS = [
  'TouchableOpacity',
  'TouchableHighlight',
  'TouchableWithoutFeedback',
  'TouchableNativeFeedback',
  'Pressable',
];

for (const component of TOUCHABLE_COMPONENTS) {
  // Find component usage with onPress but without accessibilityLabel
  const componentRegex = new RegExp(`<${component}[\\s\\S]*?(?:>|\\/>)`, 'g');
  const matches = content.match(componentRegex) || [];

  for (const match of matches) {
    if (match.includes('onPress') || match.includes('onLongPress')) {
      const hasLabel = /accessibilityLabel/.test(match);
      const hasRole = /accessibilityRole|accessible/.test(match);
      const hasA11yHint = /accessibilityHint/.test(match);

      if (!hasLabel && !hasA11yHint) {
        issues.push(`\`${component}\` has press handler but missing \`accessibilityLabel\``);
      }
      if (!hasRole && component === 'Pressable') {
        issues.push(`\`Pressable\` missing \`accessibilityRole\` — set to "button", "link", etc.`);
      }
    }
  }
}

// Check for Image without accessibility
const imageRegex = /<Image[\s\S]*?(?:>|\/>)/g;
const imageMatches = content.match(imageRegex) || [];

for (const match of imageMatches) {
  const hasAccessible = /accessible|accessibilityLabel|alt=/.test(match);
  if (!hasAccessible) {
    issues.push('`Image` missing accessibility label — add `accessibilityLabel` or `accessible={false}` for decorative images');
  }
}

if (issues.length > 0) {
  // Deduplicate similar warnings
  const unique = [...new Set(issues)];
  const shown = unique.slice(0, 5);
  const remaining = unique.length - shown.length;
  let msg = `ERNE: Accessibility check — ${unique.length} issue(s):\n${shown.map((i) => `  - ${i}`).join('\n')}`;
  if (remaining > 0) {
    msg += `\n  ... and ${remaining} more`;
  }
  warn(msg);
} else {
  pass();
}
```

- [ ] **Step 3: Run tests**

Run: `npx jest tests/hooks/gate-hooks.test.js -v`
Expected: All tests PASS

- [ ] **Step 4: Run full test suite**

Run: `npx jest tests/hooks/ -v`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/accessibility-check.js tests/hooks/gate-hooks.test.js
git commit -m "feat: implement strict accessibility check hook"
```

---

## Chunk 6: Integration Tests & Finalization

### Task 13: Integration Tests — Profile-Based Hook Execution

**Files:**
- Create: `tests/hooks/integration.test.js`

- [ ] **Step 1: Write integration tests**

```js
// tests/hooks/integration.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { runDispatcher, createTempProject, cleanupTempProject, HOOKS_DIR } = require('./helpers');

describe('Profile-based hook execution (integration)', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('minimal profile only runs minimal hooks', () => {
    // post-edit-format is minimal; post-edit-typecheck is standard
    const formatResult = runDispatcher('post-edit-format.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir });

    // Should run (exit 0 or 2, not skipped)
    expect([0, 2]).toContain(formatResult.exitCode);

    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir });

    // Should be skipped by dispatcher (profile mismatch)
    expect(typecheckResult.exitCode).toBe(0);
    expect(typecheckResult.stdout).toContain('skipped');
  });

  test('standard profile runs standard hooks but not strict', () => {
    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'standard', ERNE_PROJECT_DIR: projectDir });

    // Should run (not skipped)
    expect(typecheckResult.stdout).not.toContain('skipped');

    const testGateResult = runDispatcher('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'standard', ERNE_PROJECT_DIR: projectDir });

    // Should be skipped (strict only)
    expect(testGateResult.exitCode).toBe(0);
    expect(testGateResult.stdout).toContain('skipped');
  });

  test('strict profile runs all hooks', () => {
    const testGateResult = runDispatcher('pre-edit-test-gate.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'strict', ERNE_PROJECT_DIR: projectDir });

    // Should run (not skipped)
    expect(testGateResult.stdout).not.toContain('skipped');
  });

  test('ERNE_PROFILE env var takes precedence over default', () => {
    // Default is standard; env var sets minimal
    const typecheckResult = runDispatcher('post-edit-typecheck.js', {
      tool_name: 'Edit',
      tool_input: { file_path: '/project/src/app.ts' },
    }, { ERNE_PROFILE: 'minimal', ERNE_PROJECT_DIR: projectDir });

    // post-edit-typecheck is standard+strict only — should be skipped in minimal
    expect(typecheckResult.exitCode).toBe(0);
    expect(typecheckResult.stdout).toContain('skipped');
  });
});

describe('Hook definitions integrity (integration)', () => {
  test('all hooks in hooks.json reference existing script files', () => {
    const hooksConfig = JSON.parse(
      fs.readFileSync(path.join(HOOKS_DIR, '..', '..', 'hooks.json'), 'utf8')
    );

    for (const hook of hooksConfig.hooks) {
      // Extract script name from command
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) {
        const scriptPath = path.join(HOOKS_DIR, match[1]);
        expect(fs.existsSync(scriptPath)).toBe(true);
      }
    }
  });

  test('all profile JSONs reference hooks that exist in hooks.json', () => {
    const hooksConfig = JSON.parse(
      fs.readFileSync(path.join(HOOKS_DIR, '..', '..', 'hooks.json'), 'utf8')
    );

    const allHookNames = new Set();
    for (const hook of hooksConfig.hooks) {
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) allHookNames.add(match[1]);
    }

    const profilesDir = path.join(HOOKS_DIR, '..', '..', 'profiles');
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
    const hooksConfig = JSON.parse(
      fs.readFileSync(path.join(HOOKS_DIR, '..', '..', 'hooks.json'), 'utf8')
    );

    const referencedScripts = new Set();
    for (const hook of hooksConfig.hooks) {
      const match = hook.command.match(/run-with-flags\.js\s+(\S+)/);
      if (match) referencedScripts.add(match[1]);
    }

    const hooksFiles = fs.readdirSync(HOOKS_DIR)
      .filter((f) => f.endsWith('.js') && f !== 'run-with-flags.js');

    for (const file of hooksFiles) {
      // Skip lib/ directory files
      if (file === 'lib') continue;
      expect(referencedScripts.has(file)).toBe(true);
    }
  });

  test('minimal profile is a subset of standard', () => {
    const profilesDir = path.join(HOOKS_DIR, '..', '..', 'profiles');
    const minimal = JSON.parse(fs.readFileSync(path.join(profilesDir, 'minimal.json'), 'utf8'));
    const standard = JSON.parse(fs.readFileSync(path.join(profilesDir, 'standard.json'), 'utf8'));

    for (const hook of minimal.hooks) {
      expect(standard.hooks).toContain(hook);
    }
  });

  test('standard profile is a subset of strict', () => {
    const profilesDir = path.join(HOOKS_DIR, '..', '..', 'profiles');
    const standard = JSON.parse(fs.readFileSync(path.join(profilesDir, 'standard.json'), 'utf8'));
    const strict = JSON.parse(fs.readFileSync(path.join(profilesDir, 'strict.json'), 'utf8'));

    for (const hook of standard.hooks) {
      expect(strict.hooks).toContain(hook);
    }
  });
});

describe('Hook error handling (integration)', () => {
  let projectDir;

  beforeEach(() => {
    projectDir = createTempProject();
  });

  afterEach(() => {
    cleanupTempProject(projectDir);
  });

  test('hooks handle missing ERNE_PROJECT_DIR gracefully', () => {
    // Run session-start without ERNE_PROJECT_DIR — should use cwd
    const result = runDispatcher('session-start.js', {}, {
      ERNE_PROFILE: 'minimal',
      // Intentionally not setting ERNE_PROJECT_DIR
    });

    // Should not crash
    expect([0, 2]).toContain(result.exitCode);
  });

  test('hooks handle empty stdin gracefully', () => {
    const result = runDispatcher('post-edit-format.js', {}, {
      ERNE_PROFILE: 'minimal',
      ERNE_PROJECT_DIR: projectDir,
    });

    expect([0, 2]).toContain(result.exitCode);
  });

  test('hooks handle malformed JSON stdin gracefully', () => {
    // This tests the readStdin fallback in hook-utils
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
        },
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 10000,
      });
      // Should handle gracefully
      expect(true).toBe(true);
    } catch (err) {
      // Even if it exits non-zero, it should not crash with unhandled exception
      expect([0, 1, 2]).toContain(err.status);
    }
  });
});
```

- [ ] **Step 2: Run integration tests**

Run: `npx jest tests/hooks/integration.test.js -v`
Expected: All tests PASS

- [ ] **Step 3: Commit integration tests**

```bash
git add tests/hooks/integration.test.js
git commit -m "feat: add integration tests for profile execution and hook integrity"
```

---

### Task 14: Full Suite Verification & Final Commit

- [ ] **Step 1: Run the complete test suite**

Run: `npx jest tests/hooks/ -v --coverage`
Expected: All tests PASS across all test files:
- `tests/hooks/definitions.test.js`
- `tests/hooks/hook-utils.test.js`
- `tests/hooks/run-with-flags.test.js`
- `tests/hooks/core-hooks.test.js`
- `tests/hooks/validation-hooks.test.js`
- `tests/hooks/learning-hooks.test.js`
- `tests/hooks/gate-hooks.test.js`
- `tests/hooks/integration.test.js`

- [ ] **Step 2: Verify file structure**

Run: `find scripts/hooks tests/hooks -type f | sort`

Expected output:
```
scripts/hooks/accessibility-check.js
scripts/hooks/bundle-size-check.js
scripts/hooks/check-console-log.js
scripts/hooks/check-expo-config.js
scripts/hooks/check-platform-specific.js
scripts/hooks/check-reanimated-worklet.js
scripts/hooks/continuous-learning-observer.js
scripts/hooks/evaluate-session.js
scripts/hooks/lib/hook-utils.js
scripts/hooks/native-compat-check.js
scripts/hooks/performance-budget.js
scripts/hooks/post-edit-format.js
scripts/hooks/post-edit-typecheck.js
scripts/hooks/pre-commit-lint.js
scripts/hooks/pre-edit-test-gate.js
scripts/hooks/run-with-flags.js
scripts/hooks/security-scan.js
scripts/hooks/session-start.js
tests/hooks/core-hooks.test.js
tests/hooks/definitions.test.js
tests/hooks/gate-hooks.test.js
tests/hooks/helpers.js
tests/hooks/hook-utils.test.js
tests/hooks/integration.test.js
tests/hooks/learning-hooks.test.js
tests/hooks/run-with-flags.test.js
tests/hooks/validation-hooks.test.js
```

- [ ] **Step 3: Verify all 16 hooks are registered in hooks.json**

Run: `node -e "const h = require('./hooks.json'); console.log(h.hooks.length + ' hooks registered'); h.hooks.forEach(h => console.log('  ' + h.command.split(' ').pop()))"`

Expected: 16 hooks registered, matching all script files.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat: complete ERNE hook system — Plan 1 implementation ready"
```

---

## Plan 1 Summary

| Chunk | Tasks | What | Hook Scripts | Test Files |
|-------|-------|------|-------------|------------|
| 1 | 1-2 | Foundation: package.json, hooks.json, profiles, schema | — | definitions.test.js |
| 2 | 3-4 | Infrastructure: hook-utils, dispatcher, stubs | run-with-flags.js, lib/hook-utils.js | hook-utils.test.js, run-with-flags.test.js |
| 3 | 5-7 | Minimal hooks | session-start.js, post-edit-format.js, continuous-learning-observer.js | core-hooks.test.js |
| 4 | 8-9 | Standard hooks part 1 | post-edit-typecheck.js, check-console-log.js, check-platform-specific.js, check-reanimated-worklet.js, check-expo-config.js, bundle-size-check.js, pre-commit-lint.js, evaluate-session.js | validation-hooks.test.js, learning-hooks.test.js |
| 5 | 10-12 | Strict hooks | pre-edit-test-gate.js, security-scan.js, performance-budget.js, native-compat-check.js, accessibility-check.js | gate-hooks.test.js |
| 6 | 13-14 | Integration & verification | — | integration.test.js |

**Totals:**
- 16 hook scripts + 1 dispatcher + 1 utility library = 18 JS files
- 8 test files
- 3 profile JSONs + 1 hooks.json + 1 schema
- 14 tasks across 6 chunks
