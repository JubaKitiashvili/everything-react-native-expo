'use strict';

/**
 * Calculate a health delta after task execution.
 * Compares before/after signals to produce a summary.
 *
 * @param {object} options
 * @param {object} options.testResults - { passed, output }
 * @param {object} options.selfReview - { passed, issues }
 * @param {number} options.confidence - Confidence score
 * @param {object} [options.logger]
 * @returns {{ improved: boolean, delta: object[], summary: string }}
 */
function calculateHealthDelta({ testResults, selfReview, confidence, logger }) {
  const delta = [];

  // Tests
  if (testResults) {
    delta.push({
      metric: 'tests',
      status: testResults.passed ? 'pass' : 'fail',
      impact: testResults.passed ? +1 : -1,
    });
  }

  // Self-review
  if (selfReview) {
    delta.push({
      metric: 'self-review',
      status: selfReview.passed ? 'clean' : 'issues',
      impact: selfReview.passed ? +1 : -1,
    });
  }

  // Confidence
  if (typeof confidence === 'number') {
    delta.push({
      metric: 'confidence',
      status: confidence >= 50 ? 'adequate' : 'low',
      impact: confidence >= 50 ? 0 : -1,
    });
  }

  const totalImpact = delta.reduce((sum, d) => sum + d.impact, 0);
  const improved = totalImpact > 0;

  const summary = delta
    .map((d) => `${d.metric}: ${d.status} (${d.impact >= 0 ? '+' : ''}${d.impact})`)
    .join(', ');

  if (logger) logger.info(`Health delta: ${summary}`);

  return { improved, delta, summary };
}

module.exports = { calculateHealthDelta };
