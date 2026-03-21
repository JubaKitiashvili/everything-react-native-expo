'use strict';

const DEFAULT_BASE_URL = 'https://gitlab.com/api/v4';

/**
 * Retry a function with exponential backoff and jitter.
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
 * Build authorization headers.
 */
function getHeaders(logger) {
  const token = process.env.GITLAB_TOKEN;
  if (!token) {
    throw new Error('GITLAB_TOKEN environment variable is required for GitLab provider');
  }
  logger.debug('Using GITLAB_TOKEN (redacted): ***' + token.slice(-4));
  return {
    'PRIVATE-TOKEN': token,
    'Content-Type': 'application/json',
  };
}

/**
 * Handle non-OK responses.
 */
async function handleError(res, context, logger) {
  const body = await res.text();
  logger.error(`GitLab API error [${context}]: ${res.status} — ${body}`);
  throw new Error(`GitLab API ${context} failed with status ${res.status}`);
}

/**
 * Create a GitLab provider using REST API v4.
 * @param {Object} gitlabConfig
 * @param {string|number} gitlabConfig.projectId - GitLab project ID
 * @param {string} [gitlabConfig.baseUrl] - Self-hosted GitLab URL (default: https://gitlab.com/api/v4)
 * @param {Object} [gitlabConfig.statuses]
 * @param {string} [gitlabConfig.statuses.ready] - Label for ready issues (default: 'agent-ready')
 * @param {string} [gitlabConfig.statuses.in_progress] - Label for in-progress (default: 'agent-in-progress')
 * @param {string} [gitlabConfig.statuses.failed] - Label for failed (default: 'agent-failed')
 * @param {Object} logger
 * @returns {import('./types').TicketProvider}
 */
function createGitlabProvider(gitlabConfig, logger) {
  const { projectId } = gitlabConfig;
  const baseUrl = gitlabConfig.baseUrl || DEFAULT_BASE_URL;
  const readyLabel = gitlabConfig.statuses?.ready || 'agent-ready';
  const inProgressLabel = gitlabConfig.statuses?.in_progress || 'agent-in-progress';
  const failedLabel = gitlabConfig.statuses?.failed || 'agent-failed';

  /** @returns {Promise<import('./types').Ticket[]>} */
  async function fetchReadyTickets() {
    logger.info(`Fetching ready issues from GitLab project ${projectId} (label: "${readyLabel}")`);

    return retryWithBackoff(async () => {
      const url = `${baseUrl}/projects/${encodeURIComponent(projectId)}/issues?labels=${encodeURIComponent(readyLabel)}&state=opened&per_page=10`;
      const res = await fetch(url, { headers: getHeaders(logger) });
      if (!res.ok) await handleError(res, 'fetchReadyTickets', logger);

      const issues = await res.json();
      return issues.map((issue) => ({
        id: issue.iid,
        identifier: `#${issue.iid}`,
        title: issue.title,
        description: issue.description || '',
        labels: issue.labels || [],
        type: issue.labels.includes('bug') ? 'bug' : issue.labels.includes('feature') ? 'feature' : 'task',
        priority: 'normal',
        url: issue.web_url,
        providerName: 'gitlab',
      }));
    });
  }

  /**
   * Update labels on a GitLab issue.
   */
  async function updateLabels(id, addLabels, removeLabels) {
    // First get current labels
    const getUrl = `${baseUrl}/projects/${encodeURIComponent(projectId)}/issues/${id}`;
    const headers = getHeaders(logger);
    const getRes = await fetch(getUrl, { headers });
    if (!getRes.ok) await handleError(getRes, 'getIssueLabels', logger);

    const issue = await getRes.json();
    let labels = issue.labels || [];

    // Remove specified labels
    labels = labels.filter((l) => !removeLabels.includes(l));

    // Add new labels
    for (const label of addLabels) {
      if (!labels.includes(label)) labels.push(label);
    }

    // Update
    const res = await fetch(getUrl, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ labels: labels.join(',') }),
    });
    if (!res.ok) await handleError(res, 'updateLabels', logger);
  }

  /**
   * @param {string|number} id
   * @param {string} status - 'in_progress' | 'done' | 'failed'
   */
  async function transitionStatus(id, status) {
    logger.info(`Transitioning GitLab issue #${id} to "${status}"`);

    return retryWithBackoff(async () => {
      if (status === 'in_progress') {
        await updateLabels(id, [inProgressLabel], [readyLabel]);
      } else if (status === 'done') {
        const url = `${baseUrl}/projects/${encodeURIComponent(projectId)}/issues/${id}`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: getHeaders(logger),
          body: JSON.stringify({ state_event: 'close' }),
        });
        if (!res.ok) await handleError(res, 'closeIssue', logger);
      } else if (status === 'failed') {
        await updateLabels(id, [failedLabel], []);
      }
    });
  }

  /**
   * @param {string|number} id
   * @param {string} body
   */
  async function postComment(id, body) {
    logger.info(`Posting comment on GitLab issue #${id}`);

    return retryWithBackoff(async () => {
      const url = `${baseUrl}/projects/${encodeURIComponent(projectId)}/issues/${id}/notes`;
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

module.exports = { createGitlabProvider };
