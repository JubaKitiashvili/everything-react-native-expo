// lib/scanners/api-layer.js — API layer scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

const API_DIRS = ['api', 'services', 'src/api', 'src/services'];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx']);

/**
 * Collect all source files from a directory recursively.
 * @param {string} dirPath
 * @param {string[]} results
 * @param {number} depth
 */
function collectFiles(dirPath, results, depth) {
  if (depth > 5) return;
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.git') continue;
      collectFiles(full, results, depth + 1);
    } else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      results.push(full);
    }
  }
}

/**
 * Scan API layer for endpoints and auth patterns.
 * @param {string} cwd - Project root
 * @returns {{ endpoints: object[], authPatterns: object[] }}
 */
function scanApiLayer(cwd) {
  const resolvedCwd = path.resolve(cwd);
  const endpoints = [];
  const authPatterns = [];
  const files = [];

  for (const dir of API_DIRS) {
    const fullDir = path.join(resolvedCwd, dir);
    collectFiles(fullDir, files, 0);
  }

  if (files.length === 0) {
    return { endpoints, authPatterns };
  }

  // Regex for axios method calls: axios.get('/url'), axios.post('/url'), etc.
  const axiosMethodRe = /axios\.(get|post|put|delete|patch)\s*\(\s*[`'"](.*?)[`'"]/g;
  // Regex for axios config calls: axios({ method: 'post', url: '/url' })
  const axiosConfigRe = /axios\s*\(\s*\{[^}]*method\s*:\s*[`'"](.*?)[`'"][^}]*url\s*:\s*[`'"](.*?)[`'"]/g;
  // Regex for fetch calls: fetch('/url') or fetch(`/url`)
  const fetchRe = /fetch\s*\(\s*[`'"](.*?)[`'"]/g;

  // Auth patterns
  const authHeaderRe = /['"]Authorization['"]/gi;
  const bearerRe = /['"]Bearer\s/gi;
  const interceptorRe = /interceptors\s*\.\s*(request|response)\s*\.\s*use/g;

  for (const filePath of files) {
    let content;
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch {
      continue;
    }

    const relFile = path.relative(resolvedCwd, filePath);
    const lines = content.split('\n');

    // Scan line by line for endpoints
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      let match;

      // axios.method('url')
      const axiosMethodReLocal = new RegExp(axiosMethodRe.source, axiosMethodRe.flags);
      while ((match = axiosMethodReLocal.exec(line)) !== null) {
        endpoints.push({
          method: match[1].toUpperCase(),
          urlPattern: match[2],
          file: relFile,
          line: lineNum,
        });
      }

      // axios({ method, url })
      const axiosConfigReLocal = new RegExp(axiosConfigRe.source, axiosConfigRe.flags);
      while ((match = axiosConfigReLocal.exec(line)) !== null) {
        endpoints.push({
          method: match[1].toUpperCase(),
          urlPattern: match[2],
          file: relFile,
          line: lineNum,
        });
      }

      // fetch('url')
      const fetchReLocal = new RegExp(fetchRe.source, fetchRe.flags);
      while ((match = fetchReLocal.exec(line)) !== null) {
        endpoints.push({
          method: 'GET',
          urlPattern: match[1],
          file: relFile,
          line: lineNum,
        });
      }
    }

    // Scan for auth patterns (whole file)
    let authMatch;

    const authHeaderReLocal = new RegExp(authHeaderRe.source, authHeaderRe.flags);
    while ((authMatch = authHeaderReLocal.exec(content)) !== null) {
      const lineNum = content.substring(0, authMatch.index).split('\n').length;
      authPatterns.push({
        type: 'authorization-header',
        file: relFile,
        line: lineNum,
      });
    }

    const bearerReLocal = new RegExp(bearerRe.source, bearerRe.flags);
    while ((authMatch = bearerReLocal.exec(content)) !== null) {
      const lineNum = content.substring(0, authMatch.index).split('\n').length;
      authPatterns.push({
        type: 'bearer-token',
        file: relFile,
        line: lineNum,
      });
    }

    const interceptorReLocal = new RegExp(interceptorRe.source, interceptorRe.flags);
    while ((authMatch = interceptorReLocal.exec(content)) !== null) {
      const lineNum = content.substring(0, authMatch.index).split('\n').length;
      authPatterns.push({
        type: 'interceptor',
        file: relFile,
        line: lineNum,
      });
    }
  }

  return { endpoints, authPatterns };
}

module.exports = scanApiLayer;
