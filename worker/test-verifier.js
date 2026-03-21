'use strict';

const { execSync } = require('child_process');

/**
 * Run tests in a worktree and return results.
 *
 * @param {string} worktreePath - Absolute path to the worktree
 * @param {object} [config] - May contain test_command override
 * @param {object} [logger]
 * @returns {{ passed: boolean, output: string, error: string|null }}
 */
function runTests(worktreePath, config, logger) {
  const testCommand = (config && config.test_command) || 'npm test -- --ci --passWithNoTests 2>&1';

  if (logger) logger.info(`Running tests: ${testCommand}`);

  try {
    const output = execSync(testCommand, {
      cwd: worktreePath,
      stdio: 'pipe',
      timeout: 120000,
      encoding: 'utf8',
    });

    if (logger) logger.info('Tests passed');
    return { passed: true, output: output.slice(-2000), error: null };
  } catch (err) {
    const output = (err.stdout || '') + (err.stderr || '');
    if (logger) logger.warn(`Tests failed: ${output.slice(-500)}`);
    return { passed: false, output: output.slice(-2000), error: output.slice(-1000) };
  }
}

module.exports = { runTests };
