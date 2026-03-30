// scripts/hooks/lib/hook-utils.js
'use strict';
const fs = require('fs');

function readStdin() {
  try {
    return JSON.parse(fs.readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function getEditedFilePath(input) {
  if (!input || !input.tool_input) return null;
  return input.tool_input.file_path || input.tool_input.path || null;
}

function pass(msg) {
  if (msg) console.log(msg);
  process.exit(0);
}

function fail(msg) {
  if (msg) console.error(msg);
  process.exit(1);
}

function warn(msg) {
  if (msg) console.error(msg);
  process.exit(2);
}

function isTestFile(filePath) {
  return (
    /\.(test|spec)\.[jt]sx?$/.test(filePath) ||
    filePath.includes('__tests__')
  );
}

function hasExtension(filePath, exts) {
  return exts.some(ext => filePath.endsWith(ext));
}

/**
 * Resolve the dashboard port for the current project.
 * Priority: ERNE_DASHBOARD_PORT env > registry lookup > fallback 3333
 * @returns {number}
 */
function getDashboardPort() {
  try {
    const { resolveDashboardPort } = require('./port-registry');
    return resolveDashboardPort();
  } catch {
    // Fallback if port-registry can't be loaded
    return parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);
  }
}

module.exports = {
  readStdin,
  getEditedFilePath,
  pass,
  fail,
  warn,
  isTestFile,
  hasExtension,
  getDashboardPort,
};
