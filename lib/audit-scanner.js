// lib/audit-scanner.js — Scanner orchestrator for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');
const scanStructure = require('./scanners/structure');
const scanDependencies = require('./scanners/dependencies');
const scanConfig = require('./scanners/config');
const scanGitHistory = require('./scanners/git-history');
const scanRoutes = require('./scanners/routes');
const scanComponents = require('./scanners/components');
const scanHooks = require('./scanners/hooks-scan');
const scanApiLayer = require('./scanners/api-layer');
const scanState = require('./scanners/state');
const scanScreens = require('./scanners/screens');
const scanDeadCode = require('./scanners/dead-code');
const scanTechDebt = require('./scanners/tech-debt');
const scanTypeSafety = require('./scanners/type-safety');
const scanDepHealth = require('./scanners/dep-health');

/**
 * Compute a simple hash from source file count and total lines.
 * @param {string} cwd
 * @param {string[]} sourceFiles
 * @returns {string}
 */
function computeSourceHash(cwd, sourceFiles) {
  const root = path.resolve(cwd);
  let totalLines = 0;

  for (const relPath of sourceFiles) {
    try {
      const content = fs.readFileSync(path.join(root, relPath), 'utf8');
      totalLines += content.split('\n').length;
    } catch {
      // Skip unreadable files
    }
  }

  // Simple deterministic hash: fileCount + totalLines
  const raw = `${sourceFiles.length}:${totalLines}`;
  let hash = 0;
  for (let i = 0; i < raw.length; i++) {
    const chr = raw.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return Math.abs(hash).toString(36);
}

/**
 * Run the full audit scan.
 * @param {string} cwd - Project root directory
 * @param {{ skipDepHealth?: boolean, maxFiles?: number }} [options]
 * @returns {object} Full audit data
 */
function runScan(cwd, options) {
  const opts = { skipDepHealth: false, maxFiles: 500, ...options };
  const root = path.resolve(cwd);

  // Core scanners
  const structure = scanStructure(root);
  const dependencies = scanDependencies(root);
  const config = scanConfig(root);
  const gitHistory = scanGitHistory(root);

  // Derived data
  const sourceFiles = structure ? structure.sourceFiles : [];
  const limitedFiles = sourceFiles.slice(0, opts.maxFiles);

  // Deep scanners
  const routes = scanRoutes(root);
  const components = scanComponents(root, limitedFiles);
  const hooks = scanHooks(root, limitedFiles);
  const apiLayer = scanApiLayer(root);
  const state = scanState(root, limitedFiles);
  const screens = scanScreens(root);
  const deadCode = scanDeadCode(root, limitedFiles);
  const techDebt = scanTechDebt(root, limitedFiles);
  const typeSafety = scanTypeSafety(root, limitedFiles);

  // Dependency health (optional, slow)
  const allDeps = dependencies && dependencies.all ? dependencies.all : {};
  const dependencyHealth = opts.skipDepHealth ? null : scanDepHealth(root, allDeps);

  // Compute source hash
  const sourceHash = computeSourceHash(root, limitedFiles);

  return {
    structure,
    dependencies,
    config,
    gitHistory,
    routes,
    components,
    hooks,
    apiLayer,
    state,
    screens,
    deadCode,
    techDebt,
    typeSafety,
    dependencyHealth,
    meta: {
      scannedAt: new Date().toISOString(),
      sourceHash,
      totalSourceFiles: structure ? structure.totalSourceFiles : 0,
      cwd: root,
    },
  };
}

module.exports = { runScan };
