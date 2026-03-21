'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  executor: {
    timeout_seconds: 600,
  },
  erne: {
    hook_profile: 'standard',
  },
  provider: {
    poll_interval_seconds: 60,
  },
};

const PROVIDER_ENV_KEYS = {
  linear: 'LINEAR_API_KEY',
  jira: 'JIRA_API_TOKEN',
  github: 'GITHUB_TOKEN',
  clickup: 'CLICKUP_API_TOKEN',
  gitlab: 'GITLAB_TOKEN',
};

/**
 * Load a JSON config file and merge with defaults.
 */
function loadConfig(configPath) {
  if (!configPath || typeof configPath !== 'string') {
    return { config: null, error: 'Config path is required' };
  }

  const resolved = path.resolve(configPath);
  if (!fs.existsSync(resolved)) {
    return { config: null, error: `Config file not found: ${resolved}` };
  }

  let raw;
  try {
    raw = fs.readFileSync(resolved, 'utf8');
  } catch (err) {
    return { config: null, error: `Failed to read config: ${err.message}` };
  }

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    return { config: null, error: `Invalid JSON in config: ${err.message}` };
  }

  // Merge defaults
  const config = Object.assign({}, parsed);
  config.executor = Object.assign({}, DEFAULTS.executor, parsed.executor);
  config.erne = Object.assign({}, DEFAULTS.erne, parsed.erne);
  config.provider = Object.assign({}, DEFAULTS.provider, parsed.provider);

  return { config, error: null };
}

/**
 * Validate a loaded config object.
 */
function validateConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Config must be an object'] };
  }

  // Required: provider.type
  if (!config.provider || !config.provider.type) {
    errors.push('provider.type is required (linear|jira|github|clickup|gitlab)');
  } else {
    const validTypes = ['linear', 'jira', 'github', 'clickup', 'gitlab'];
    if (!validTypes.includes(config.provider.type)) {
      errors.push(`provider.type must be one of: ${validTypes.join(', ')}`);
    } else {
      // Check env var for provider
      const envKey = PROVIDER_ENV_KEYS[config.provider.type];
      if (envKey && !process.env[envKey]) {
        errors.push(`Environment variable ${envKey} is required for provider "${config.provider.type}"`);
      }
    }
  }

  // Required: repo.path
  if (!config.repo || !config.repo.path) {
    errors.push('repo.path is required');
  } else if (!fs.existsSync(config.repo.path)) {
    errors.push(`repo.path does not exist: ${config.repo.path}`);
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { loadConfig, validateConfig };
