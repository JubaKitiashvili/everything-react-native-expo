'use strict';

const BASE_URL = 'https://api.github.com';

/**
 * Retry a function with exponential backoff and jitter.
 * @param {Function} fn - Async function to retry
 * @param {number} [maxRetries=3]
 * @returns {Promise<*>}
 */
async function retryWithBackoff(fn, maxRetries = 3) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt === maxRetries) throw err;
      const baseDelay = Math.pow(2, attempt) * 1000;
      const jitter = Math.random() * 500;
      await new Promise((r) => setTimeout(r, baseDelay + jitter));
    }
  }
}

/**
 * Build authorization headers, redacting token from logs.
 * @param {Object} logger
 * @returns {Object}
 */
function getHeaders(logger) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('GITHUB_TOKEN environment variable is required for GitHub provider');
  }
  logger.debug('Using GITHUB_TOKEN (redacted): ***' + token.slice(-4));
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github.v3+json',
    'Content-Type': 'application/json',
  };
}

/**
 * Handle non-OK responses.
 * @param {Response} res
 * @param {string} context
 * @param {Object} logger
 */
async function handleError(res, context, logger) {
  const body = await res.text();
  logger.error(`GitHub API error [${context}]: ${res.status} — ${body}`);
  throw new Error(`GitHub API ${context} failed with status ${res.status}`);
}

/**
 * Derive ticket type from labels.
 * @param {string[]} labels
 * @returns {string}
 */
function typeFromLabels(labels) {
  const lower = labels.map((l) => l.toLowerCase());
  if (lower.includes('bug')) return 'bug';
  if (lower.includes('feature') || lower.includes('enhancement')) return 'feature';
  return 'task';
}

/**
 * Create a GitHub provider using label-based status pattern.
 * @param {Object} githubConfig
 * @param {string} githubConfig.owner - Repository owner
 * @param {string} githubConfig.repo - Repository name
 * @param {Object} [githubConfig.statuses]
 * @param {string} [githubConfig.statuses.ready] - Label for ready tickets (default: 'agent-ready')
 * @param {string} [githubConfig.statuses.in_progress] - Label for in-progress (default: 'agent-in-progress')
 * @param {Object} logger
 * @returns {import('./types').TicketProvider}
 */
function createGithubProvider(githubConfig, logger) {
  const { owner, repo } = githubConfig;
  const readyLabel = githubConfig.statuses?.ready || 'agent-ready';
  const inProgressLabel = githubConfig.statuses?.in_progress || 'agent-in-progress';

  /** @returns {Promise<import('./types').Ticket[]>} */
  async function fetchReadyTickets() {
    logger.info(`Fetching ready tickets from GitHub ${owner}/${repo} (label: ${readyLabel})`);

    return retryWithBackoff(async () => {
      const url = `${BASE_URL}/repos/${owner}/${repo}/issues?labels=${encodeURIComponent(readyLabel)}&state=open&per_page=10`;
      const res = await fetch(url, { headers: getHeaders(logger) });
      if (!res.ok) await handleError(res, 'fetchReadyTickets', logger);

      const issues = await res.json();
      return issues.map((issue) => {
        const labels = issue.labels.map((l) => (typeof l === 'string' ? l : l.name));
        return {
          id: issue.number,
          identifier: `#${issue.number}`,
          title: issue.title,
          description: issue.body || '',
          labels,
          type: typeFromLabels(labels),
          priority: 'normal',
          url: issue.html_url,
          providerName: 'github',
        };
      });
    });
  }

  /**
   * @param {string|number} id
   * @param {string} status - 'in_progress' | 'done' | 'failed'
   */
  async function transitionStatus(id, status) {
    logger.info(`Transitioning GitHub issue #${id} to "${status}"`);
    const headers = getHeaders(logger);

    return retryWithBackoff(async () => {
      if (status === 'in_progress') {
        // Add in_progress label
        const addUrl = `${BASE_URL}/repos/${owner}/${repo}/issues/${id}/labels`;
        const addRes = await fetch(addUrl, {
          method: 'POST',
          headers,
          body: JSON.stringify({ labels: [inProgressLabel] }),
        });
        if (!addRes.ok) await handleError(addRes, 'addLabel', logger);

        // Remove ready label
        const removeUrl = `${BASE_URL}/repos/${owner}/${repo}/issues/${id}/labels/${encodeURIComponent(readyLabel)}`;
        const removeRes = await fetch(removeUrl, { method: 'DELETE', headers });
        if (!removeRes.ok && removeRes.status !== 404) {
          await handleError(removeRes, 'removeLabel', logger);
        }
      } else if (status === 'done') {
        const url = `${BASE_URL}/repos/${owner}/${repo}/issues/${id}`;
        const res = await fetch(url, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ state: 'closed' }),
        });
        if (!res.ok) await handleError(res, 'closeIssue', logger);
      } else if (status === 'failed') {
        const url = `${BASE_URL}/repos/${owner}/${repo}/issues/${id}/labels`;
        const res = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({ labels: ['agent-failed'] }),
        });
        if (!res.ok) await handleError(res, 'addFailedLabel', logger);
      }
    });
  }

  /**
   * @param {string|number} id
   * @param {string} body
   */
  async function postComment(id, body) {
    logger.info(`Posting comment on GitHub issue #${id}`);

    return retryWithBackoff(async () => {
      const url = `${BASE_URL}/repos/${owner}/${repo}/issues/${id}/comments`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(logger),
        body: JSON.stringify({ body }),
      });
      if (!res.ok) await handleError(res, 'postComment', logger);
    });
  }

  return { fetchReadyTickets, transitionStatus, postComment };
}

module.exports = { createGithubProvider };
