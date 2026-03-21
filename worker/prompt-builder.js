'use strict';

const { interpolate } = require('./interpolate');

const DEFAULT_TEMPLATE = [
  'You are the {agent} agent in the ERNE system.',
  '',
  '## Task',
  '**Ticket**: {id} — {title}',
  '**Provider**: {provider}',
  '',
  '## Description',
  '{description}',
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
  const vars = {
    ...taskVars,
    description: (ticket && ticket.description) || '',
    affected_files: (context && context.affectedFiles || []).join(', ') || 'none detected',
  };

  return interpolate(template, vars);
}

module.exports = { buildPrompt };
