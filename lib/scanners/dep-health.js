// lib/scanners/dep-health.js — Dependency health scanner for ERNE audit
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_DEPS = 50;
const NPM_TIMEOUT = 5000;

/**
 * Scan dependency health by checking last publish dates on npm.
 * @param {string} cwd - Project root
 * @param {object} deps - All dependencies (name => version)
 * @returns {{ packages: object[], summary: object }}
 */
function scanDepHealth(cwd, deps) {
  const resolvedCwd = path.resolve(cwd);
  const docsDir = path.join(resolvedCwd, '.erne');
  const cachePath = path.join(docsDir, '.dep-health-cache.json');

  const cache = loadCache(cachePath);
  const packages = [];
  const summary = { healthy: 0, outdated: 0, stale: 0, abandoned: 0, total: 0 };

  if (!deps || typeof deps !== 'object') {
    return { packages, summary };
  }

  // Filter: skip @types/* and limit to MAX_DEPS
  const depNames = Object.keys(deps)
    .filter(name => !name.startsWith('@types/'))
    .slice(0, MAX_DEPS);

  const now = Date.now();

  for (const name of depNames) {
    // Check cache first
    if (cache[name] && (now - cache[name].cachedAt) < CACHE_TTL_MS) {
      const cached = cache[name];
      packages.push(cached.data);
      summary[cached.data.status]++;
      summary.total++;
      continue;
    }

    try {
      const timeJson = execSync(`npm view ${name} time --json`, {
        timeout: NPM_TIMEOUT,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const timeData = JSON.parse(timeJson);

      // Get last publish date (skip 'created' and 'modified' keys)
      const versions = Object.keys(timeData).filter(k => k !== 'created' && k !== 'modified');
      const lastVersion = versions[versions.length - 1];
      const lastPublishDate = timeData[lastVersion];

      // Get latest version
      let latestVersion = lastVersion;
      try {
        latestVersion = execSync(`npm view ${name} version`, {
          timeout: NPM_TIMEOUT,
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe'],
        }).trim();
      } catch {
        // Use lastVersion as fallback
      }

      const ageMs = now - new Date(lastPublishDate).getTime();
      const status = classifyAge(ageMs);

      const entry = {
        name,
        currentVersion: deps[name],
        latestVersion,
        lastPublish: lastPublishDate,
        ageDays: Math.floor(ageMs / (1000 * 60 * 60 * 24)),
        status,
      };

      packages.push(entry);
      summary[status]++;
      summary.total++;

      // Cache it
      cache[name] = { cachedAt: now, data: entry };
    } catch {
      // Skip: npm error, timeout, private/unpublished package
    }
  }

  // Write cache
  saveCache(cachePath, cache, docsDir);

  return { packages, summary };
}

/**
 * Classify age into health status.
 * @param {number} ageMs
 * @returns {string}
 */
function classifyAge(ageMs) {
  const months = ageMs / (1000 * 60 * 60 * 24 * 30);
  if (months < 6) return 'healthy';
  if (months < 12) return 'outdated';
  if (months < 24) return 'stale';
  return 'abandoned';
}

/**
 * Load cache from disk.
 * @param {string} cachePath
 * @returns {object}
 */
function loadCache(cachePath) {
  try {
    if (fs.existsSync(cachePath)) {
      const stat = fs.statSync(cachePath);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs < CACHE_TTL_MS) {
        return JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      }
    }
  } catch {
    // Ignore corrupt cache
  }
  return {};
}

/**
 * Save cache to disk.
 * @param {string} cachePath
 * @param {object} cache
 * @param {string} docsDir
 */
function saveCache(cachePath, cache, docsDir) {
  try {
    if (!fs.existsSync(docsDir)) {
      fs.mkdirSync(docsDir, { recursive: true });
    }
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 2));
  } catch {
    // Silent fail on cache write
  }
}

module.exports = scanDepHealth;
