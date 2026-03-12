'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
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
  it('parses valid JSON from stdin', () => {
    const input = JSON.stringify({
      tool_name: 'Edit',
      tool_input: { file_path: '/a/b.ts' },
    });
    const result = runSnippet(
      'const d = utils.readStdin(); console.log(JSON.stringify(d));',
      input
    );
    assert.strictEqual(result.exitCode, 0);
    assert.strictEqual(JSON.parse(result.stdout).tool_name, 'Edit');
  });

  it('returns empty object for empty stdin', () => {
    const result = runSnippet(
      'const d = utils.readStdin(); console.log(JSON.stringify(d));',
      ''
    );
    assert.strictEqual(result.exitCode, 0);
    assert.deepStrictEqual(JSON.parse(result.stdout), {});
  });

  it('returns empty object for invalid JSON', () => {
    const result = runSnippet(
      'const d = utils.readStdin(); console.log(JSON.stringify(d));',
      'not json'
    );
    assert.strictEqual(result.exitCode, 0);
    assert.deepStrictEqual(JSON.parse(result.stdout), {});
  });
});

describe('getEditedFilePath', () => {
  it('extracts file_path from tool_input', () => {
    const r = runSnippet(
      `console.log(utils.getEditedFilePath({
        tool_input: { file_path: '/a/b.ts' }
      }));`
    );
    assert.strictEqual(r.stdout.trim(), '/a/b.ts');
  });

  it('falls back to path from tool_input', () => {
    const r = runSnippet(
      `console.log(utils.getEditedFilePath({
        tool_input: { path: '/c/d.js' }
      }));`
    );
    assert.strictEqual(r.stdout.trim(), '/c/d.js');
  });

  it('returns null for missing input', () => {
    const r = runSnippet('console.log(utils.getEditedFilePath(null));');
    assert.strictEqual(r.stdout.trim(), 'null');
  });
});

describe('exit helpers', () => {
  it('pass exits with code 0', () => {
    const r = runSnippet('utils.pass("ok");');
    assert.strictEqual(r.exitCode, 0);
    assert.strictEqual(r.stdout.trim(), 'ok');
  });

  it('fail exits with code 1', () => {
    const r = runSnippet('utils.fail("blocked");');
    assert.strictEqual(r.exitCode, 1);
    assert.strictEqual(r.stdout.trim(), 'blocked');
  });

  it('warn exits with code 2', () => {
    const r = runSnippet('utils.warn("warning");');
    assert.strictEqual(r.exitCode, 2);
    assert.strictEqual(r.stdout.trim(), 'warning');
  });
});

describe('isTestFile', () => {
  it('detects .test.ts', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/Button.test.ts"));'
    );
    assert.strictEqual(r.stdout.trim(), 'true');
  });

  it('detects .spec.tsx', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/Button.spec.tsx"));'
    );
    assert.strictEqual(r.stdout.trim(), 'true');
  });

  it('detects __tests__ directory', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/__tests__/Button.tsx"));'
    );
    assert.strictEqual(r.stdout.trim(), 'true');
  });

  it('rejects normal source file', () => {
    const r = runSnippet(
      'console.log(utils.isTestFile("src/Button.tsx"));'
    );
    assert.strictEqual(r.stdout.trim(), 'false');
  });
});

describe('hasExtension', () => {
  it('matches .ts extension', () => {
    const r = runSnippet(
      'console.log(utils.hasExtension("a/b.ts", [".ts", ".tsx"]));'
    );
    assert.strictEqual(r.stdout.trim(), 'true');
  });

  it('rejects .js when checking .ts', () => {
    const r = runSnippet(
      'console.log(utils.hasExtension("a/b.js", [".ts", ".tsx"]));'
    );
    assert.strictEqual(r.stdout.trim(), 'false');
  });
});
