'use strict';

const BASE_URL = 'https://api.clickup.com/api/v2';

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
  const key = process.env.CLICKUP_API_KEY;
  if (!key) {
    throw new Error('CLICKUP_API_KEY environment variable is required for ClickUp provider');
  }
  logger.debug('Using CLICKUP_API_KEY (redacted): ***' + key.slice(-4));
  return {
    Authorization: key,
    'Content-Type': 'application/json',
  };
}

/**
 * Handle non-OK responses.
 */
async function handleError(res, context, logger) {
  const body = await res.text();
  logger.error(`ClickUp API error [${context}]: ${res.status} — ${body}`);
  throw new Error(`ClickUp API ${context} failed with status ${res.status}`);
}

/**
 * Create a ClickUp provider using REST API v2.
 * @param {Object} clickupConfig
 * @param {string} clickupConfig.listId - ClickUp list ID to pull tasks from
 * @param {Object} [clickupConfig.statuses]
 * @param {string} [clickupConfig.statuses.ready] - Status name for ready tasks (default: 'ready')
 * @param {string} [clickupConfig.statuses.in_progress] - Status for in-progress (default: 'in progress')
 * @param {string} [clickupConfig.statuses.done] - Status for done (default: 'complete')
 * @param {string} [clickupConfig.statuses.failed] - Status for failed (default: 'agent failed')
 * @param {Object} logger
 * @returns {import('./types').TicketProvider}
 */
function createClickUpProvider(clickupConfig, logger) {
  const { listId } = clickupConfig;
  const readyStatus = clickupConfig.statuses?.ready || 'ready';
  const inProgressStatus = clickupConfig.statuses?.in_progress || 'in progress';
  const doneStatus = clickupConfig.statuses?.done || 'complete';
  const failedStatus = clickupConfig.statuses?.failed || 'agent failed';

  /** @returns {Promise<import('./types').Ticket[]>} */
  async function fetchReadyTickets() {
    logger.info(`Fetching ready tasks from ClickUp list ${listId} (status: "${readyStatus}")`);

    return retryWithBackoff(async () => {
      const url = `${BASE_URL}/list/${listId}/task?statuses[]=${encodeURIComponent(readyStatus)}`;
      const res = await fetch(url, { headers: getHeaders(logger) });
      if (!res.ok) await handleError(res, 'fetchReadyTickets', logger);

      const data = await res.json();
      return (data.tasks || []).map((task) => ({
        id: task.id,
        identifier: task.custom_id || task.id,
        title: task.name,
        description: task.description || task.text_content || '',
        labels: (task.tags || []).map((t) => t.name),
        type: 'task',
        priority: task.priority?.priority?.toLowerCase() || 'normal',
        url: task.url,
        providerName: 'clickup',
      }));
    });
  }

  /**
   * @param {string} id
   * @param {string} status - 'in_progress' | 'done' | 'failed'
   */
  async function transitionStatus(id, status) {
    const statusMap = {
      in_progress: inProgressStatus,
      done: doneStatus,
      failed: failedStatus,
    };
    const targetStatus = statusMap[status] || status;
    logger.info(`Transitioning ClickUp task ${id} to "${targetStatus}"`);

    return retryWithBackoff(async () => {
      const url = `${BASE_URL}/task/${id}`;
      const res = await fetch(url, {
        method: 'PUT',
        headers: getHeaders(logger),
        body: JSON.stringify({ status: targetStatus }),
      });
      if (!res.ok) await handleError(res, 'transitionStatus', logger);
    });
  }

  /**
   * @param {string} id
   * @param {string} body
   */
  async function postComment(id, body) {
    logger.info(`Posting comment on ClickUp task ${id}`);

    return retryWithBackoff(async () => {
      const url = `${BASE_URL}/task/${id}/comment`;
      const res = await fetch(url, {
        method: 'POST',
        headers: getHeaders(logger),
        body: JSON.stringify({ comment_text: body }),
      });
      if (!res.ok) await handleError(res, 'postComment', logger);
    });
  }

  return { fetchReadyTickets, transitionStatus, postComment };
}

module.exports = { createClickUpProvider };
