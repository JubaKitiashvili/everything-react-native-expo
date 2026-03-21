'use strict';

const { execSync } = require('child_process');
const { interpolate, buildTaskVars } = require('./interpolate');
const { executeClaudeCode } = require('./executor');

/**
 * Self-review the changes made in a worktree.
 * @param {string} worktreePath
 * @param {object} ticket
 * @param {string} agent
 * @param {object} executorConfig
 * @param {object} logger
 * @returns {Promise<{ passed: boolean, issues: { critical: string[], warning: string[] }, summary: string }>}
 */
async function selfReview(worktreePath, ticket, agent, executorConfig, logger) {
  const result = { passed: true, issues: { critical: [], warning: [] }, summary: '' };

  // --- Get diff ---
  let diff = '';
  try {
    diff = execSync('git diff HEAD~1', {
      cwd: worktreePath,
      encoding: 'utf8',
      timeout: 30000,
      maxBuffer: 5 * 1024 * 1024,
    });
  } catch (err) {
    if (logger) logger.warn(`Failed to get diff for self-review: ${err.message}`);
    result.summary = 'Could not obtain diff for review';
    return result;
  }

  if (!diff.trim()) {
    result.summary = 'No changes to review';
    return result;
  }

  // --- Build review prompt ---
  const vars = buildTaskVars(ticket, agent);
  const reviewPrompt = [
    'You are a senior code reviewer. Review the following diff for a task.',
    `Task: ${vars.title || 'Unknown'}`,
    `Task ID: ${vars.id || 'Unknown'}`,
    '',
    'Mark any issues as:',
    '- CRITICAL: <description> (blocks merge)',
    '- WARNING: <description> (should fix but not blocking)',
    '',
    'If the code looks good, say "No issues found."',
    '',
    'Diff:',
    '```',
    diff.slice(0, 8000),
    '```',
  ].join('\n');

  // --- Execute review ---
  const config = { ...executorConfig, timeout_seconds: 300 };
  const reviewResult = await executeClaudeCode(reviewPrompt, worktreePath, config, logger);

  if (!reviewResult.success) {
    if (logger) logger.warn('Self-review execution failed');
    result.summary = 'Self-review execution failed';
    return result;
  }

  const output = reviewResult.output || '';

  // --- Parse output ---
  const criticalMatches = output.match(/CRITICAL:\s*(.+)/gi) || [];
  const warningMatches = output.match(/WARNING:\s*(.+)/gi) || [];

  result.issues.critical = criticalMatches.map((m) => m.replace(/^CRITICAL:\s*/i, '').trim());
  result.issues.warning = warningMatches.map((m) => m.replace(/^WARNING:\s*/i, '').trim());

  if (result.issues.critical.length > 0) {
    result.passed = false;

    // --- Attempt one fix ---
    if (logger) logger.info(`Found ${result.issues.critical.length} critical issue(s), attempting fix`);

    const fixPrompt = [
      'Fix the following critical issues in this codebase:',
      '',
      ...result.issues.critical.map((c, i) => `${i + 1}. ${c}`),
      '',
      'Apply minimal targeted fixes. Commit when done.',
    ].join('\n');

    const fixResult = await executeClaudeCode(fixPrompt, worktreePath, config, logger);

    if (fixResult.success) {
      if (logger) logger.info('Fix attempt completed, re-checking');
      // Re-check after fix
      let fixDiff = '';
      try {
        fixDiff = execSync('git diff HEAD~1', {
          cwd: worktreePath,
          encoding: 'utf8',
          timeout: 30000,
          maxBuffer: 5 * 1024 * 1024,
        });
      } catch (_) {
        // ignore
      }

      if (fixDiff.trim()) {
        const recheckPrompt = [
          'Re-review this diff. Only output CRITICAL lines if blocking issues remain.',
          '',
          '```',
          fixDiff.slice(0, 8000),
          '```',
        ].join('\n');

        const recheckResult = await executeClaudeCode(recheckPrompt, worktreePath, config, logger);
        const recheckOutput = recheckResult.output || '';
        const remaining = recheckOutput.match(/CRITICAL:\s*(.+)/gi) || [];

        if (remaining.length === 0) {
          result.passed = true;
          result.issues.critical = [];
          result.summary = 'Issues found and auto-fixed';
          return result;
        }
      }
    }

    result.summary = `${result.issues.critical.length} critical issue(s) remain after fix attempt`;
  } else {
    result.summary = result.issues.warning.length > 0
      ? `Passed with ${result.issues.warning.length} warning(s)`
      : 'Clean review — no issues found';
  }

  return result;
}

module.exports = { selfReview };
