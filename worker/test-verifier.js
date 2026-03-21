'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Run test verification in a worktree.
 * @param {string} worktreePath
 * @param {object} logger
 * @returns {{ passed: boolean, testsPassed: number, testsFailed: number, output: string, skipped: boolean }}
 */
function runTestVerification(worktreePath, logger) {
  const result = { passed: false, testsPassed: 0, testsFailed: 0, output: '', skipped: false };

  // Check if test script exists
  let pkg;
  try {
    const pkgPath = path.join(worktreePath, 'package.json');
    const raw = fs.readFileSync(pkgPath, 'utf8');
    pkg = JSON.parse(raw);
  } catch (err) {
    if (logger) logger.warn(`Could not read package.json: ${err.message}`);
    result.skipped = true;
    result.passed = true;
    return result;
  }

  if (!pkg.scripts || !pkg.scripts.test) {
    if (logger) logger.info('No test script found in package.json, skipping');
    result.skipped = true;
    result.passed = true;
    return result;
  }

  // Run tests
  try {
    const output = execSync('npm test -- --forceExit --no-coverage', {
      cwd: worktreePath,
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    result.output = output;
    result.passed = true;
  } catch (err) {
    // Tests failed but we still want to parse the output
    result.output = (err.stdout || '') + (err.stderr || '');
    result.passed = false;
  }

  // Parse jest output
  const passedMatch = result.output.match(/Tests:\s+(\d+)\s+passed/);
  const failedMatch = result.output.match(/Tests:\s+(?:\d+\s+\w+,\s+)*?(\d+)\s+failed/);

  if (passedMatch) {
    result.testsPassed = parseInt(passedMatch[1], 10);
  }
  if (failedMatch) {
    result.testsFailed = parseInt(failedMatch[1], 10);
  }

  // If we couldn't parse but exit was 0, assume passed
  if (result.passed && result.testsPassed === 0 && result.testsFailed === 0) {
    result.testsPassed = -1; // Unknown count, but passed
  }

  if (logger) {
    logger.info(`Tests: ${result.testsPassed} passed, ${result.testsFailed} failed`);
  }

  return result;
}

module.exports = { runTestVerification };
