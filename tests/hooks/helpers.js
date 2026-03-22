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
  const { spawnSync } = require('child_process');
  const result = spawnSync('node', [scriptPath], {
    input: JSON.stringify(stdin),
    encoding: 'utf8',
    env: { ...process.env, ...env },
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 10000,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    output: (result.stdout || '') + (result.stderr || ''),
  };
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
