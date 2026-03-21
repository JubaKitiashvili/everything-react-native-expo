'use strict';

const fs = require('fs');
const path = require('path');

const TRACKED_METRICS = ['typeSafety', 'deadCode', 'techDebt', 'testRatio'];

/**
 * Generate a health delta comparing repo state before and after changes.
 * @param {string} repoPath - Original repo path (before)
 * @param {string} worktreePath - Worktree path with changes (after)
 * @param {object} logger
 * @returns {{ metrics: object, improved: boolean }}
 */
function generateHealthDelta(repoPath, worktreePath, logger) {
  const result = { metrics: {}, improved: false };

  // --- Load "before" data from audit-data.json ---
  let beforeData = {};
  try {
    const auditPath = path.join(repoPath, 'erne-docs', 'audit-data.json');
    const raw = fs.readFileSync(auditPath, 'utf8');
    beforeData = JSON.parse(raw);
  } catch (err) {
    if (logger) logger.warn(`Could not read audit-data.json: ${err.message}`);
  }

  // --- Run scan on worktree for "after" data ---
  let afterData = {};
  try {
    const { runScan } = require('../lib/audit-scanner');
    afterData = runScan(worktreePath);
  } catch (err) {
    if (logger) logger.warn(`Could not run audit scan on worktree: ${err.message}`);
  }

  // --- Compare metrics ---
  let improvedCount = 0;
  let degradedCount = 0;

  for (const metric of TRACKED_METRICS) {
    const before = extractMetricValue(beforeData, metric);
    const after = extractMetricValue(afterData, metric);

    if (before === null && after === null) {
      continue;
    }

    const delta = after !== null && before !== null ? after - before : 0;
    const isHigherBetter = metric === 'typeSafety' || metric === 'testRatio';
    const improved = isHigherBetter ? delta > 0 : delta < 0;

    if (delta !== 0) {
      if (improved) improvedCount++;
      else degradedCount++;
    }

    result.metrics[metric] = {
      before: before !== null ? before : 'unknown',
      after: after !== null ? after : 'unknown',
      delta,
      improved: delta === 0 ? 'unchanged' : improved,
    };
  }

  // Overall: improved if at least one metric improved and none degraded,
  // or more improved than degraded
  result.improved = improvedCount > 0 && improvedCount >= degradedCount;

  if (logger) {
    logger.info(`Health delta: ${improvedCount} improved, ${degradedCount} degraded`);
  }

  return result;
}

/**
 * Extract a numeric metric value from audit data.
 * Handles both flat and nested structures.
 */
function extractMetricValue(data, metric) {
  if (!data || typeof data !== 'object') return null;

  // Direct property
  if (typeof data[metric] === 'number') return data[metric];

  // Nested in scores/metrics/summary
  const containers = ['scores', 'metrics', 'summary', 'health'];
  for (const key of containers) {
    if (data[key] && typeof data[key][metric] === 'number') {
      return data[key][metric];
    }
  }

  return null;
}

module.exports = { generateHealthDelta };
