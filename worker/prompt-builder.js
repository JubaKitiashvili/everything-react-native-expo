'use strict';

const { interpolate } = require('./interpolate');

const MAX_DESCRIPTION_LENGTH = 4000;

const DEFAULT_TEMPLATE = [
  'You are the {agent} agent in the ERNE system.',
  '',
  '## Task',
  '**Ticket**: {id} — {title}',
  '**Provider**: {provider}',
  '',
  '--- BEGIN USER TICKET ---',
  '{description}',
  '--- END USER TICKET ---',
  '',
  '## Affected Files',
  '{affected_files}',
  '',
  '## Instructions',
  '- Work on branch `{branch}`',
  "- Follow the project's CLAUDE.md coding standards",
  '- Commit with conventional commit messages',
  '- Include tests for any new or changed behavior',
].join('\n');

/**
 * Sanitize ticket description to prevent prompt injection.
 * Strips patterns that attempt to override system instructions or roles.
 * Truncates to MAX_DESCRIPTION_LENGTH.
 */
function sanitizeDescription(desc) {
  if (typeof desc !== 'string') return '';

  let sanitized = desc;

  // Strip prompt injection patterns: system instructions, role overrides
  const injectionPatterns = [
    /(?:^|\n)\s*(?:system\s*(?:prompt|instruction|message)\s*[:：])/gi,
    /(?:^|\n)\s*(?:you\s+are\s+(?:now|a|an)\s)/gi,
    /(?:^|\n)\s*(?:ignore\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?))/gi,
    /(?:^|\n)\s*(?:forget\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?))/gi,
    /(?:^|\n)\s*(?:disregard\s+(?:all\s+)?(?:previous|above|prior)\s+(?:instructions?|prompts?|rules?))/gi,
    /(?:^|\n)\s*(?:new\s+(?:system\s+)?instructions?\s*[:：])/gi,
    /(?:^|\n)\s*(?:override\s+(?:system|instructions?|rules?)\s*[:：])/gi,
    /(?:^|\n)\s*(?:---\s*(?:BEGIN|END)\s+SYSTEM\s*---)/gi,
  ];

  for (const pattern of injectionPatterns) {
    sanitized = sanitized.replace(pattern, '\n[SANITIZED]');
  }

  // Truncate to max length
  if (sanitized.length > MAX_DESCRIPTION_LENGTH) {
    sanitized = sanitized.slice(0, MAX_DESCRIPTION_LENGTH) + '\n[...truncated]';
  }

  return sanitized;
}

/**
 * Build a prompt for Claude Code from ticket data, agent, and context.
 *
 * @param {object} options
 * @param {object} options.ticket - The ticket object
 * @param {string} options.agent - Agent name
 * @param {object} options.taskVars - Interpolation variables
 * @param {object} options.context - Resolved context { affectedFiles, knownFiles }
 * @param {object} [options.config] - Worker config (may contain prompt_template)
 * @returns {string} The built prompt
 */
function buildPrompt({ ticket, agent, taskVars, context, config }) {
  const template = (config && config.prompt_template) || DEFAULT_TEMPLATE;
  const rawDesc = (ticket && ticket.description) || '';
  const vars = {
    ...taskVars,
    description: sanitizeDescription(rawDesc),
    affected_files: (context && context.affectedFiles || []).join(', ') || 'none detected',
  };

  return interpolate(template, vars);
}

module.exports = { buildPrompt, sanitizeDescription };
