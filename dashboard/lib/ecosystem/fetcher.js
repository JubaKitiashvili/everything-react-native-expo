'use strict';

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ─── Watchlist ────────────────────────────────────────────────────────────────

const WATCHLIST = [
  { repo: 'expo/expo',                         pkg: 'expo' },
  { repo: 'facebook/react-native',             pkg: 'react-native' },
  { repo: 'react-navigation/react-navigation', pkg: '@react-navigation/native' },
  { repo: 'expo/router',                       pkg: 'expo-router' },
  { repo: 'pmndrs/zustand',                    pkg: 'zustand' },
  { repo: 'reduxjs/redux-toolkit',             pkg: '@reduxjs/toolkit' },
  { repo: 'jotaijs/jotai',                     pkg: 'jotai' },
  { repo: 'software-mansion/react-native-reanimated', pkg: 'react-native-reanimated' },
  { repo: 'software-mansion/react-native-gesture-handler', pkg: 'react-native-gesture-handler' },
  { repo: 'software-mansion/react-native-screens', pkg: 'react-native-screens' },
  { repo: 'Shopify/flash-list',                pkg: '@shopify/flash-list' },
  { repo: 'mrousavy/react-native-vision-camera', pkg: 'react-native-vision-camera' },
  { repo: 'gorhom/react-native-bottom-sheet', pkg: '@gorhom/bottom-sheet' },
  { repo: 'oblador/react-native-vector-icons', pkg: 'react-native-vector-icons' },
  { repo: 'nativewind/nativewind',             pkg: 'nativewind' },
  { repo: 'gluestack/gluestack-ui',            pkg: '@gluestack-ui/themed' },
  { repo: 'react-hook-form/react-hook-form',   pkg: 'react-hook-form' },
  { repo: 'tannerlinsley/react-query',         pkg: '@tanstack/react-query' },
  { repo: 'axios/axios',                       pkg: 'axios' },
  { repo: 'supabase/supabase-js',              pkg: '@supabase/supabase-js' },
];

// ─── Auth ─────────────────────────────────────────────────────────────────────

function getGhToken() {
  try {
    return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return process.env.GITHUB_TOKEN || null;
  }
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

function httpsGet(url, token) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'erne-dashboard/1.0',
        'Accept': 'application/vnd.github.v3+json',
      },
    };
    if (token) options.headers['Authorization'] = `token ${token}`;

    https.get(url, options, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, data: body });
        }
      });
    }).on('error', reject);
  });
}

// ─── Parsers ──────────────────────────────────────────────────────────────────

/**
 * Parse a GitHub release API response into a normalized raw item.
 * @param {string} repoSlug  e.g. "expo/expo"
 * @param {string} pkgName   e.g. "expo"
 * @param {object} release   GitHub release object
 */
function parseGitHubRelease(repoSlug, pkgName, release) {
  const version = String(release.tag_name || '').replace(/^v/, '');
  return {
    type: 'release',
    package: pkgName,
    repo: repoSlug,
    title: release.name || `${pkgName}@${version}`,
    summary: (release.body || '').split('\n')[0].slice(0, 120),
    body: release.body || '',
    version: { current: null, latest: version },
    url: release.html_url || '',
    timestamp: release.published_at || new Date().toISOString(),
  };
}

/**
 * Parse an npm registry response into a normalized raw item.
 * @param {string} name  package name
 * @param {object} data  npm registry object
 */
function parseNpmPackage(name, data) {
  const latest = (data['dist-tags'] || {}).latest || '';
  const time = (data.time || {})[latest] || new Date().toISOString();
  return {
    type: 'release',
    package: name,
    repo: null,
    title: `${name}@${latest}`,
    summary: data.description || '',
    body: '',
    version: { current: null, latest },
    url: `https://www.npmjs.com/package/${encodeURIComponent(name)}`,
    timestamp: time,
  };
}

// ─── Classification ───────────────────────────────────────────────────────────

const RE_SECURITY = /security|vulnerability|cve/i;
const RE_BREAKING = /breaking change|breaking:/i;
const HOT_STARS_THRESHOLD = 100;

/**
 * Classify a raw item into a tag: SEC | BREAK | HOT | TIP | NEW
 * @param {object} item
 * @returns {string}
 */
function classifyTag(item) {
  if (item.type === 'tip') return 'TIP';
  if (item.type === 'trending') {
    if ((item.starsThisWeek || 0) >= HOT_STARS_THRESHOLD) return 'HOT';
    return 'NEW';
  }
  // For releases: security takes priority over breaking
  const body = item.body || '';
  if (RE_SECURITY.test(body)) return 'SEC';
  if (RE_BREAKING.test(body)) return 'BREAK';
  return 'NEW';
}

// ─── Feed Item Builder ────────────────────────────────────────────────────────

/**
 * Construct a normalized feed item with tag from a raw item.
 * @param {object} raw
 * @returns {object}
 */
function buildFeedItem(raw) {
  return {
    type: raw.type,
    tag: classifyTag(raw),
    package: raw.package,
    repo: raw.repo || null,
    title: raw.title,
    summary: raw.summary || '',
    version: raw.version || { current: null, latest: null },
    url: raw.url || '',
    timestamp: raw.timestamp || new Date().toISOString(),
    relevance: 0,
  };
}

// ─── Cache ────────────────────────────────────────────────────────────────────

const CACHE_FILENAME = '.erne/ecosystem.json';

function readCache(projectDir) {
  try {
    const file = path.join(projectDir, CACHE_FILENAME);
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function writeCache(projectDir, data) {
  const file = path.join(projectDir, CACHE_FILENAME);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf8');
}

// ─── Refresh ──────────────────────────────────────────────────────────────────

/**
 * Fetch latest releases for all watched repos, write cache, broadcast.
 * @param {string}   projectDir   root directory of the user's project
 * @param {Function} broadcastFn  optional callback(feedItems)
 */
async function refresh(projectDir, broadcastFn) {
  const token = getGhToken();
  const items = [];

  await Promise.allSettled(
    WATCHLIST.map(async ({ repo, pkg }) => {
      try {
        const url = `https://api.github.com/repos/${repo}/releases/latest`;
        const { status, data } = await httpsGet(url, token);
        if (status === 200 && data && data.tag_name) {
          const raw = parseGitHubRelease(repo, pkg, data);
          items.push(buildFeedItem(raw));
        }
      } catch {
        // skip failed fetches silently
      }
    }),
  );

  const payload = {
    fetchedAt: new Date().toISOString(),
    items,
  };

  writeCache(projectDir, payload);

  if (typeof broadcastFn === 'function') {
    broadcastFn(items);
  }

  return payload;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  WATCHLIST,
  getGhToken,
  httpsGet,
  parseGitHubRelease,
  parseNpmPackage,
  classifyTag,
  buildFeedItem,
  readCache,
  writeCache,
  refresh,
};
