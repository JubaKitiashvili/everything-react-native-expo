'use strict';

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
 * Build authorization headers with Basic auth.
 */
function getHeaders(logger) {
  const email = process.env.JIRA_EMAIL;
  const token = process.env.JIRA_API_TOKEN;
  if (!email || !token) {
    throw new Error('JIRA_EMAIL and JIRA_API_TOKEN environment variables are required for Jira provider');
  }
  logger.debug(`Using Jira auth for ${email} (token redacted): ***${token.slice(-4)}`);
  const encoded = Buffer.from(`${email}:${token}`).toString('base64');
  return {
    Authorization: `Basic ${encoded}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };
}

/**
 * Handle non-OK responses.
 */
async function handleError(res, context, logger) {
  const body = await res.text();
  logger.error(`Jira API error [${context}]: ${res.status} — ${body}`);
  throw new Error(`Jira API ${context} failed with status ${res.status}`);
}

/**
 * Create a Jira provider using REST API v3.
 * @param {Object} jiraConfig
 * @param {string} jiraConfig.domain - Jira cloud domain (e.g. 'mycompany.atlassian.net')
 * @param {string} jiraConfig.projectKey - Project key (e.g. 'PROJ')
 * @param {Object} [jiraConfig.statuses]
 * @param {string} [jiraConfig.statuses.ready] - Status name for ready tickets (default: 'To Do')
 * @param {string} [jiraConfig.statuses.in_progress] - Transition name for in-progress (default: 'In Progress')
 * @param {string} [jiraConfig.statuses.done] - Transition name for done (default: 'Done')
 * @param {string} [jiraConfig.statuses.failed] - Transition name for failed (default: 'To Do')
 * @param {Object} logger
 * @returns {import('./types').TicketProvider}
 */
function createJiraProvider(jiraConfig, logger) {
  const { domain, projectKey } = jiraConfig;
  const baseUrl = `https://${domain}/rest/api/3`;
  const readyStatus = jiraConfig.statuses?.ready || 'To Do';
  const inProgressTransition = jiraConfig.statuses?.in_progress || 'In Progress';
  const doneTransition = jiraConfig.statuses?.done || 'Done';
  const failedTransition = jiraConfig.statuses?.failed || 'To Do';

  /** @returns {Promise<import('./types').Ticket[]>} */
  async function fetchReadyTickets() {
    logger.info(`Fetching ready tickets from Jira ${projectKey} (status: "${readyStatus}")`);

    return retryWithBackoff(async () => {
      const jql = `project = ${projectKey} AND status = "${readyStatus}" ORDER BY priority DESC, created ASC`;
      const url = `${baseUrl}/search`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(logger),
        body: JSON.stringify({
          jql,
          maxResults: 10,
          fields: ['summary', 'description', 'labels', 'issuetype', 'priority', 'status'],
        }),
      });
      if (!res.ok) await handleError(res, 'fetchReadyTickets', logger);

      const data = await res.json();
      return (data.issues || []).map((issue) => ({
        id: issue.id,
        identifier: issue.key,
        title: issue.fields.summary,
        description: issue.fields.description?.content
          ?.map((block) => block.content?.map((c) => c.text).join('')).join('\n') || '',
        labels: issue.fields.labels || [],
        type: issue.fields.issuetype?.name?.toLowerCase() || 'task',
        priority: issue.fields.priority?.name?.toLowerCase() || 'normal',
        url: `https://${domain}/browse/${issue.key}`,
        providerName: 'jira',
      }));
    });
  }

  /**
   * Find a transition ID by name for a given issue.
   */
  async function findTransitionId(issueId, transitionName) {
    const url = `${baseUrl}/issue/${issueId}/transitions`;
    const res = await fetch(url, { headers: getHeaders(logger) });
    if (!res.ok) await handleError(res, 'getTransitions', logger);

    const data = await res.json();
    const transition = data.transitions.find(
      (t) => t.name.toLowerCase() === transitionName.toLowerCase()
    );
    if (!transition) {
      const available = data.transitions.map((t) => t.name).join(', ');
      throw new Error(`Jira transition "${transitionName}" not found. Available: ${available}`);
    }
    return transition.id;
  }

  /**
   * @param {string} id
   * @param {string} status - 'in_progress' | 'done' | 'failed'
   */
  async function transitionStatus(id, status) {
    const transitionMap = {
      in_progress: inProgressTransition,
      done: doneTransition,
      failed: failedTransition,
    };
    const targetTransition = transitionMap[status] || status;
    logger.info(`Transitioning Jira issue ${id} to "${targetTransition}"`);

    return retryWithBackoff(async () => {
      const transitionId = await findTransitionId(id, targetTransition);
      const url = `${baseUrl}/issue/${id}/transitions`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(logger),
        body: JSON.stringify({ transition: { id: transitionId } }),
      });
      if (!res.ok) await handleError(res, 'transitionStatus', logger);
    });
  }

  /**
   * @param {string} id
   * @param {string} body
   */
  async function postComment(id, body) {
    logger.info(`Posting comment on Jira issue ${id}`);

    return retryWithBackoff(async () => {
      const url = `${baseUrl}/issue/${id}/comment`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(logger),
        body: JSON.stringify({
          body: {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [{ type: 'text', text: body }],
              },
            ],
          },
        }),
      });
      if (!res.ok) await handleError(res, 'postComment', logger);
    });
  }

  return { fetchReadyTickets, transitionStatus, postComment };
}

module.exports = { createJiraProvider };
