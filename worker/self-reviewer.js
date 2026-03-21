'use strict';

/**
 * Run a self-review pass on the executor output.
 * Parses the output for quality signals.
 *
 * @param {string} output - The raw output from Claude Code execution
 * @param {object} [logger]
 * @returns {{ passed: boolean, summary: string, issues: string[] }}
 */
function selfReview(output, logger) {
  const issues = [];

  if (!output || typeof output !== 'string') {
    return { passed: true, summary: 'No output to review', issues };
  }

  // Check for common warning signals
  if (/TODO|FIXME|HACK/i.test(output)) {
    issues.push('Output contains TODO/FIXME/HACK markers');
  }

  if (/console\.(log|warn|error)\(/.test(output)) {
    issues.push('Output contains console.log statements');
  }

  if (/\bany\b/.test(output) && /typescript|\.ts\b/i.test(output)) {
    issues.push('Possible use of `any` type in TypeScript');
  }

  const passed = issues.length === 0;
  const summary = passed
    ? 'Self-review passed — no issues detected'
    : `Self-review found ${issues.length} issue(s)`;

  if (logger && !passed) {
    logger.warn(summary);
  }

  return { passed, summary, issues };
}

module.exports = { selfReview };
