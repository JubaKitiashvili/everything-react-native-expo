'use strict';

const { createGithubProvider } = require('./github');
const { createLinearProvider } = require('./linear');
const { createClickUpProvider } = require('./clickup');
const { createJiraProvider } = require('./jira');
const { createGitlabProvider } = require('./gitlab');
const { createLocalProvider } = require('./local');

/**
 * Create a ticket provider based on configuration.
 * @param {Object} config - Worker configuration with provider settings
 * @param {Object} logger - Logger instance
 * @returns {import('./types').TicketProvider}
 */
function createProvider(config, logger) {
  const { type } = config.provider;

  switch (type) {
    case 'github':
      return createGithubProvider(config.provider, logger);
    case 'linear':
      return createLinearProvider(config.provider, logger);
    case 'clickup':
      return createClickUpProvider(config.provider, logger);
    case 'jira':
      return createJiraProvider(config.provider, logger);
    case 'gitlab':
      return createGitlabProvider(config.provider, logger);
    case 'local':
      return createLocalProvider(config.provider, logger);
    default:
      throw new Error(
        `Unknown provider type: "${type}". Supported: github, linear, clickup, jira, gitlab, local`,
      );
  }
}

module.exports = { createProvider };
