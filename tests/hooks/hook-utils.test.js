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
