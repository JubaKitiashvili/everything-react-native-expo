'use strict';

const BASE_URL = 'https://api.linear.app/graphql';

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
  const key = process.env.LINEAR_API_KEY;
  if (!key) {
    throw new Error('LINEAR_API_KEY environment variable is required for Linear provider');
  }
  logger.debug('Using LINEAR_API_KEY (redacted): ***' + key.slice(-4));
  return {
    Authorization: key,
    'Content-Type': 'application/json',
  };
}

/**
 * Execute a GraphQL query against Linear.
 */
async function graphql(query, variables, logger) {
  const headers = getHeaders(logger);
  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    const body = await res.text();
    logger.error(`Linear API error: ${res.status} — ${body}`);
    throw new Error(`Linear API failed with status ${res.status}`);
  }

  const json = await res.json();
  if (json.errors?.length) {
    logger.error(`Linear GraphQL errors: ${JSON.stringify(json.errors)}`);
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

/**
 * Create a Linear provider using the GraphQL API.
 * @param {Object} linearConfig
 * @param {string} [linearConfig.teamKey] - Linear team key for filtering
 * @param {Object} [linearConfig.statuses]
 * @param {string} [linearConfig.statuses.ready] - State name for ready tickets (default: 'Todo')
 * @param {string} [linearConfig.statuses.in_progress] - State name for in-progress (default: 'In Progress')
 * @param {string} [linearConfig.statuses.done] - State name for done (default: 'Done')
 * @param {Object} logger
 * @returns {import('./types').TicketProvider}
 */
function createLinearProvider(linearConfig, logger) {
  const readyState = linearConfig.statuses?.ready || 'Todo';
  const inProgressState = linearConfig.statuses?.in_progress || 'In Progress';
  const doneState = linearConfig.statuses?.done || 'Done';
  const teamKey = linearConfig.teamKey;

  /** @returns {Promise<import('./types').Ticket[]>} */
  async function fetchReadyTickets() {
    logger.info(`Fetching ready tickets from Linear (state: "${readyState}")`);

    const query = `
      query ReadyIssues($filter: IssueFilter) {
        issues(filter: $filter, first: 10) {
          nodes {
            id
            identifier
            title
            description
            priority
            url
            labels {
              nodes { name }
            }
            state { name }
          }
        }
      }
    `;

    const filter = {
      state: { name: { eq: readyState } },
    };
    if (teamKey) {
      filter.team = { key: { eq: teamKey } };
    }

    return retryWithBackoff(async () => {
      const data = await graphql(query, { filter }, logger);
      return data.issues.nodes.map((issue) => {
        const labels = issue.labels?.nodes?.map((l) => l.name) || [];
        const priorityMap = { 0: 'none', 1: 'urgent', 2: 'high', 3: 'normal', 4: 'low' };
        return {
          id: issue.id,
          identifier: issue.identifier,
          title: issue.title,
          description: issue.description || '',
          labels,
          type: labels.includes('bug') ? 'bug' : labels.includes('feature') ? 'feature' : 'task',
          priority: priorityMap[issue.priority] || 'normal',
          url: issue.url,
          providerName: 'linear',
        };
      });
    });
  }

  /**
   * Look up a workflow state ID by name for a given issue.
   */
  async function findStateId(issueId, stateName) {
    const query = `
      query IssueTeamStates($id: String!) {
        issue(id: $id) {
          team {
            states { nodes { id name } }
          }
        }
      }
    `;
    const data = await graphql(query, { id: issueId }, logger);
    const states = data.issue.team.states.nodes;
    const state = states.find((s) => s.name.toLowerCase() === stateName.toLowerCase());
    if (!state) {
      throw new Error(`Linear state "${stateName}" not found. Available: ${states.map((s) => s.name).join(', ')}`);
    }
    return state.id;
  }

  /**
   * @param {string} id
   * @param {string} status - 'in_progress' | 'done' | 'failed'
   */
  async function transitionStatus(id, status) {
    logger.info(`Transitioning Linear issue ${id} to "${status}"`);

    const stateMap = {
      in_progress: inProgressState,
      done: doneState,
      failed: inProgressState, // keep in progress but will get a comment
    };
    const targetState = stateMap[status] || status;

    return retryWithBackoff(async () => {
      const stateId = await findStateId(id, targetState);
      const mutation = `
        mutation UpdateIssue($id: String!, $stateId: String!) {
          issueUpdate(id: $id, input: { stateId: $stateId }) {
            success
          }
        }
      `;
      await graphql(mutation, { id, stateId }, logger);
    });
  }

  /**
   * @param {string} id
   * @param {string} body
   */
  async function postComment(id, body) {
    logger.info(`Posting comment on Linear issue ${id}`);

    return retryWithBackoff(async () => {
      const mutation = `
        mutation CreateComment($issueId: String!, $body: String!) {
          commentCreate(input: { issueId: $issueId, body: $body }) {
            success
          }
        }
      `;
      await graphql(mutation, { issueId: id, body }, logger);
    });
  }

  return { fetchReadyTickets, transitionStatus, postComment };
}

module.exports = { createLinearProvider };
