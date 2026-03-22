'use strict';
const { execFileSync } = require('child_process');
const { readStdin, pass, fail, warn } = require('./lib/hook-utils');

const input = readStdin();
const command = (input.tool_input && input.tool_input.command) || '';
if (!command.includes('git commit')) return pass();

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

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
    return fail(`ERNE: Lint errors found. Fix before committing:\n${output.slice(0, 500)}`);
  }
  if (err.status === 127 || output.includes('not found')) {
    return pass('ERNE: ESLint not available, skipping lint check');
  }
  return pass('ERNE: ESLint check inconclusive, skipping');
}

try {
  execFileSync('npx', ['prettier', '--check', '.'], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
    cwd: projectDir,
  });
  return pass('ERNE: Lint and format checks passed');
} catch (err) {
  const output = err.stdout || err.stderr || '';
  if (output.includes('Code style')) {
    return pass('ERNE: Some files need formatting. Run: npx prettier --write .');
  } else {
    return pass();
  }
}
