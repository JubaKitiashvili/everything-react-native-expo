'use strict';

/**
 * Replace {key} placeholders in a template with values from vars.
 */
function interpolate(template, vars) {
  if (typeof template !== 'string') return '';
  if (!vars || typeof vars !== 'object') return template;

  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : match;
  });
}

/**
 * Remove characters that could cause injection issues in titles.
 */
function sanitizeTitle(title) {
  if (typeof title !== 'string') return '';
  return title
    .replace(/[`'$\\]/g, '')
    .replace(/[\r\n]+/g, ' ')
    .trim();
}

/**
 * Build standard template variables from a ticket and agent name.
 */
function buildTaskVars(ticket, agent) {
  const rawId = ticket && ticket.id ? String(ticket.id) : '';
  const id = rawId.replace(/[`'$\\]/g, '').replace(/[\r\n]+/g, ' ').trim();
  const rawTitle = ticket && ticket.title ? String(ticket.title) : '';
  const title = sanitizeTitle(rawTitle);
  const provider = ticket && ticket.provider ? String(ticket.provider) : '';
  const rawUrl = ticket && ticket.url ? String(ticket.url) : '';
  const url = rawUrl.replace(/[`'$\\]/g, '').replace(/[\r\n]+/g, ' ').trim();

  const branchId = id.replace(/[^a-zA-Z0-9-]/g, '-').toLowerCase();
  const branch = `${agent || 'worker'}/task-${branchId}`;

  return {
    id,
    title,
    raw_title: rawTitle,
    branch,
    agent: agent || '',
    provider,
    url,
    date: new Date().toISOString().split('T')[0],
  };
}

module.exports = { interpolate, buildTaskVars, sanitizeTitle };
