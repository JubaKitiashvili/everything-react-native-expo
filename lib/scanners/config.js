// lib/scanners/config.js — Config scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Safely read and parse a JSON file.
 * @param {string} filePath
 * @returns {object|null}
 */
function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Safely read a file as text.
 * @param {string} filePath
 * @returns {string|null}
 */
function readText(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

/**
 * Extract env variable names from .env.example content.
 * @param {string} content
 * @returns {string[]}
 */
function parseEnvNames(content) {
  if (!content) return [];
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => line.split('=')[0].trim())
    .filter(Boolean);
}

/**
 * Scan project configuration files.
 * @param {string} cwd - Project root
 * @returns {{ appJson: object|null, tsconfig: object|null, metro: string|null, babel: string|null, envVars: string[] }}
 */
function scanConfig(cwd) {
  const root = path.resolve(cwd);

  // app.json / app.config.js / app.config.ts
  let appJson = readJson(path.join(root, 'app.json'));
  if (!appJson) {
    // Try reading app.config.js/ts as text for key extraction
    const configJs = readText(path.join(root, 'app.config.js'));
    const configTs = readText(path.join(root, 'app.config.ts'));
    if (configJs || configTs) {
      appJson = { _raw: configJs || configTs, _type: configJs ? 'app.config.js' : 'app.config.ts' };
    }
  }

  // tsconfig.json
  const tsconfig = readJson(path.join(root, 'tsconfig.json'));

  // metro.config.js
  const metro = readText(path.join(root, 'metro.config.js'));

  // babel.config.js
  const babel = readText(path.join(root, 'babel.config.js'));

  // .env.example
  const envContent = readText(path.join(root, '.env.example'));
  const envVars = parseEnvNames(envContent);

  return {
    appJson,
    tsconfig,
    metro,
    babel,
    envVars,
  };
}

module.exports = scanConfig;
