'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn, isTestFile, hasExtension } = require('./lib/hook-utils');

const TS_EXTENSIONS = ['.ts', '.tsx'];
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) pass();
if (!hasExtension(filePath, TS_EXTENSIONS)) pass();
if (isTestFile(filePath)) pass();

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
    warn('ERNE: Could not run type check (tsc unavailable)');
  }
}
