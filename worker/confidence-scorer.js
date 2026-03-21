'use strict';

const COMPLEX_LABELS = ['architecture', 'breaking', 'migration', 'refactor-large'];

/**
 * Calculate a confidence score for how safely a ticket can be auto-resolved.
 * @param {object} ticket
 * @param {object} auditData
 * @param {object} context - { affectedFiles: string[], knownFiles: string[] }
 * @returns {{ score: number, level: string, factors: Array<{ factor: string, impact: number }> }}
 */
function calculateConfidence(ticket, auditData, context) {
  const factors = [];
  let score = 100;

  // --- Description length ---
  const desc = (ticket && ticket.description) || '';
  if (desc.length < 50) {
    factors.push({ factor: 'Short description (< 50 chars)', impact: -20 });
    score -= 20;
  }
  if (desc.length > 200) {
    factors.push({ factor: 'Detailed description (> 200 chars)', impact: 5 });
    score += 5;
  }

  // --- Affected files ---
  const affected = (context && context.affectedFiles) || [];
  const fileCount = affected.length;

  if (fileCount === 0) {
    factors.push({ factor: 'No affected files identified', impact: -15 });
    score -= 15;
  } else if (fileCount > 20) {
    factors.push({ factor: `Very high file count (${fileCount} > 20)`, impact: -30 });
    score -= 30;
  } else if (fileCount > 10) {
    factors.push({ factor: `High file count (${fileCount} > 10)`, impact: -20 });
    score -= 20;
  }

  // --- Ticket type ---
  const type = (ticket && ticket.type || '').toLowerCase();
  if (type === 'bug') {
    factors.push({ factor: 'Bug ticket type', impact: -10 });
    score -= 10;
  } else if (type === 'story') {
    factors.push({ factor: 'Story ticket type', impact: -15 });
    score -= 15;
  }

  // --- Known files ---
  const knownFiles = (context && context.knownFiles) || [];
  if (fileCount > 0 && knownFiles.length > 0) {
    const allKnown = affected.every((f) => knownFiles.includes(f));
    const noneKnown = affected.every((f) => !knownFiles.includes(f));

    if (allKnown) {
      factors.push({ factor: 'All affected files known in audit', impact: 10 });
      score += 10;
    } else if (noneKnown) {
      factors.push({ factor: 'No affected files known in audit', impact: -20 });
      score -= 20;
    }
  } else if (fileCount > 0 && knownFiles.length === 0) {
    factors.push({ factor: 'No affected files known in audit', impact: -20 });
    score -= 20;
  }

  // --- Complex labels ---
  const labels = (ticket && ticket.labels || []).map((l) => String(l).toLowerCase());
  const hasComplex = labels.some((l) => COMPLEX_LABELS.includes(l));
  if (hasComplex) {
    const matched = labels.filter((l) => COMPLEX_LABELS.includes(l)).join(', ');
    factors.push({ factor: `Complex label(s): ${matched}`, impact: -25 });
    score -= 25;
  }

  // --- Clamp ---
  score = Math.max(0, Math.min(100, score));

  // --- Level ---
  let level;
  if (score >= 80) level = 'high';
  else if (score >= 50) level = 'medium';
  else if (score >= 30) level = 'low';
  else level = 'too-complex';

  return { score, level, factors };
}

module.exports = { calculateConfidence };
