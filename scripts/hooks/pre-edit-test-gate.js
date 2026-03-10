'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { readStdin, getEditedFilePath, pass, warn, isTestFile, hasExtension } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) pass();

const JS_TS_EXTS = ['.js', '.jsx', '.ts', '.tsx'];
if (!hasExtension(filePath, JS_TS_EXTS)) pass();
if (isTestFile(filePath)) pass();

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

if (!testFile) pass();

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
    // Jest unavailable or configuration error — skip the gate
    pass('ERNE: Could not run related tests (jest unavailable or error) — skipping gate');
  }
}
