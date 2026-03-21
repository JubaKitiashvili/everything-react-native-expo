'use strict';

const VAGUE_TITLE_RE = /^(fix|update|change|do|make|add)\s+\w{0,10}$/i;
const BUG_REPRO_RE = /steps|reproduce|expected|actual|when i/i;

/**
 * Validate a ticket for quality before processing.
 * @param {object} ticket
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validateTicket(ticket) {
  const issues = [];

  if (!ticket || typeof ticket !== 'object') {
    return { valid: false, issues: ['Ticket is missing or not an object'] };
  }

  // Description checks
  const desc = ticket.description || '';
  if (!desc || desc.trim().length < 20) {
    issues.push('Description is missing or too short (minimum 20 characters)');
  }

  // Title specificity check
  const title = ticket.title || '';
  if (!title.trim()) {
    issues.push('Title is missing');
  } else if (VAGUE_TITLE_RE.test(title.trim())) {
    issues.push(`Title is too vague: "${title}" — be more specific`);
  }

  // Bug tickets need reproduction info
  const type = (ticket.type || '').toLowerCase();
  const labels = (ticket.labels || []).map((l) => String(l).toLowerCase());
  const isBug = type === 'bug' || labels.includes('bug');

  if (isBug) {
    if (!BUG_REPRO_RE.test(desc)) {
      issues.push('Bug ticket should include reproduction steps (steps, reproduce, expected, actual, when i)');
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

module.exports = { validateTicket };
