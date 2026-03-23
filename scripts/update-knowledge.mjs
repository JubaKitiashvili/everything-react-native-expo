#!/usr/bin/env node

/**
 * ERNE Knowledge Updater
 *
 * Checks for new Expo SDK and React Native releases, fetches changelogs,
 * and uses Claude API to update .claude/rules/ files automatically.
 *
 * Usage:
 *   node scripts/update-knowledge.mjs              # full run (check + update)
 *   node scripts/update-knowledge.mjs --check-only # only check for new versions
 *   node scripts/update-knowledge.mjs --dry-run    # show what would change without writing
 *
 * Required env vars:
 *   ANTHROPIC_API_KEY — Claude API key for changelog analysis
 *
 * Optional env vars:
 *   GITHUB_TOKEN — for higher GitHub API rate limits
 */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const RULES_DIR = join(ROOT, '.claude', 'rules', 'common');
const VERSIONS_FILE = join(ROOT, '.claude', 'knowledge-versions.json');

const FLAGS = {
  checkOnly: process.argv.includes('--check-only'),
  dryRun: process.argv.includes('--dry-run'),
};

/**
 * Compare semver-ish versions. Returns true if `a` > `b`.
 * Works for "54" vs "55" and "0.84" vs "0.85".
 */
function isNewer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const na = pa[i] || 0;
    const nb = pb[i] || 0;
    if (na > nb) return true;
    if (na < nb) return false;
  }
  return false;
}

// ---------------------------------------------------------------------------
// GitHub API helpers
// ---------------------------------------------------------------------------

const ghHeaders = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'erne-knowledge-updater',
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

async function fetchJSON(url) {
  const res = await fetch(url, { headers: ghHeaders });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${url}`);
  return res.json();
}

/**
 * Get the latest Expo SDK version from npm registry.
 * Expo does not use GitHub Releases — npm is the source of truth.
 */
async function getLatestExpoSDK() {
  try {
    const res = await fetch('https://registry.npmjs.org/expo/latest');
    if (!res.ok) return null;
    const data = await res.json();
    const version = data.version; // e.g. "55.0.8"
    const major = version.split('.')[0]; // e.g. "55"
    return {
      version: major,
      fullVersion: version,
      url: `https://expo.dev/changelog/sdk-${major}`,
    };
  } catch {
    return null;
  }
}

/**
 * Get the latest stable React Native version from npm registry.
 */
async function getLatestRN() {
  try {
    const res = await fetch('https://registry.npmjs.org/react-native/latest');
    if (!res.ok) return null;
    const data = await res.json();
    const version = data.version; // e.g. "0.84.1"
    const minor = version.match(/0\.(\d+)/)?.[1];
    if (!minor) return null;
    return {
      version: `0.${minor}`,
      fullVersion: version,
      url: `https://reactnative.dev/blog/react-native-0.${minor}`,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch the changelog/blog post content for a release.
 * Falls back to the GitHub release body if the blog post fails.
 */
async function fetchChangelog(type, version) {
  const urls = {
    expo: `https://expo.dev/changelog/sdk-${version}`,
    rn: `https://reactnative.dev/blog/react-native-${version}`,
  };

  // Try fetching the blog post (best content), fall back to release body
  try {
    const res = await fetch(urls[type], {
      headers: { 'User-Agent': 'erne-knowledge-updater' },
      redirect: 'follow',
    });
    if (res.ok) {
      const text = await res.text();
      // Strip HTML tags for a rough markdown approximation
      return text
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .slice(0, 15000); // limit to ~15k chars for API call
    }
  } catch {
    // fall through to release body
  }
  return null;
}

// ---------------------------------------------------------------------------
// Claude API helper
// ---------------------------------------------------------------------------

async function callClaude(systemPrompt, userPrompt) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      'ANTHROPIC_API_KEY is required for knowledge updates. Set it as a GitHub secret or env var.',
    );
  }

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Claude API ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.content[0].text;
}

// ---------------------------------------------------------------------------
// Rule update logic
// ---------------------------------------------------------------------------

function readCurrentRules() {
  const rules = {};
  for (const file of readdirSync(RULES_DIR)) {
    if (file.endsWith('.md')) {
      rules[file] = readFileSync(join(RULES_DIR, file), 'utf-8');
    }
  }
  return rules;
}

async function generateRuleUpdates(currentRules, changes) {
  const systemPrompt = `You are ERNE's knowledge updater. You maintain React Native and Expo development rules for an AI agent framework.

Your job: Given changelogs for new releases, update the existing rule files to reflect new APIs, deprecations, breaking changes, and best practices.

Rules for updates:
- Only change what is directly affected by the new release
- Keep the existing structure and frontmatter format
- Update version numbers in descriptions
- Add new sections for significant new features
- Mark deprecated APIs with strikethrough or warnings
- Be precise — do not fabricate APIs or features not mentioned in changelogs
- Keep rules concise and actionable

Output format: Return a JSON object where keys are filenames and values are the complete updated file content.
Only include files that actually need changes. If no files need changes, return {}.

IMPORTANT: Return ONLY valid JSON, no markdown code fences, no explanation.`;

  const userPrompt = `## New Releases

${changes.map((c) => `### ${c.name} ${c.version}\n\n${c.changelog}`).join('\n\n---\n\n')}

## Current Rule Files

${Object.entries(currentRules)
  .map(([name, content]) => `### ${name}\n\`\`\`\n${content}\n\`\`\``)
  .join('\n\n')}

Analyze the changelogs and return updated rule files as JSON.`;

  const response = await callClaude(systemPrompt, userPrompt);

  // Parse the JSON response
  try {
    // Handle possible markdown code fence wrapping
    const jsonStr = response.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    return JSON.parse(jsonStr);
  } catch (e) {
    console.error('Failed to parse Claude response as JSON:', e.message);
    console.error('Response preview:', response.slice(0, 500));
    return {};
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('ERNE Knowledge Updater');
  console.log('='.repeat(50));

  // 1. Read current tracked versions
  const tracked = JSON.parse(readFileSync(VERSIONS_FILE, 'utf-8'));
  console.log(
    `\nCurrently tracking: Expo SDK ${tracked.expo_sdk}, RN ${tracked.react_native}`,
  );

  // 2. Check for new versions
  console.log('\nChecking for new releases...');

  const [latestExpo, latestRN] = await Promise.all([
    getLatestExpoSDK(),
    getLatestRN(),
  ]);

  const changes = [];

  if (latestExpo && isNewer(latestExpo.version, tracked.expo_sdk)) {
    console.log(
      `  Expo SDK: ${tracked.expo_sdk} -> ${latestExpo.version} (NEW!)`,
    );
    const changelog =
      (await fetchChangelog('expo', latestExpo.version)) || latestExpo.body;
    changes.push({
      name: 'Expo SDK',
      version: latestExpo.version,
      changelog: changelog.slice(0, 15000),
    });
  } else {
    console.log(`  Expo SDK: ${latestExpo?.version ?? '?'} (up to date)`);
  }

  if (latestRN && isNewer(latestRN.version, tracked.react_native)) {
    console.log(
      `  React Native: ${tracked.react_native} -> ${latestRN.version} (NEW!)`,
    );
    const changelog =
      (await fetchChangelog('rn', latestRN.fullVersion)) || latestRN.body;
    changes.push({
      name: 'React Native',
      version: latestRN.fullVersion,
      changelog: changelog.slice(0, 15000),
    });
  } else {
    console.log(`  React Native: ${latestRN?.version ?? '?'} (up to date)`);
  }

  if (changes.length === 0) {
    console.log('\nAll rules are up to date. Nothing to do.');
    process.exit(0);
  }

  if (FLAGS.checkOnly) {
    console.log(`\n${changes.length} update(s) available. Run without --check-only to apply.`);
    // Output for GitHub Actions
    // GitHub Actions output (GITHUB_OUTPUT file-based format)
    if (process.env.GITHUB_OUTPUT) {
      const { appendFileSync } = await import('node:fs');
      appendFileSync(process.env.GITHUB_OUTPUT, `has_updates=true\n`);
      appendFileSync(
        process.env.GITHUB_OUTPUT,
        `summary=${changes.map((c) => `${c.name} ${c.version}`).join(', ')}\n`,
      );
    }
    process.exit(0);
  }

  // 3. Read current rules and generate updates
  console.log('\nAnalyzing changelogs and generating rule updates...');
  const currentRules = readCurrentRules();
  const updates = await generateRuleUpdates(currentRules, changes);

  const updatedFiles = Object.keys(updates);
  if (updatedFiles.length === 0) {
    console.log('No rule changes needed for these releases.');
    process.exit(0);
  }

  console.log(`\nFiles to update: ${updatedFiles.join(', ')}`);

  // 4. Write updates
  if (FLAGS.dryRun) {
    console.log('\n[DRY RUN] Would update the following files:');
    for (const file of updatedFiles) {
      console.log(`  - ${file}`);
    }
    process.exit(0);
  }

  for (const [file, content] of Object.entries(updates)) {
    const filePath = join(RULES_DIR, file);
    writeFileSync(filePath, content, 'utf-8');
    console.log(`  Updated: ${file}`);
  }

  // 5. Update version tracker
  const newTracked = {
    expo_sdk: latestExpo ? latestExpo.version : tracked.expo_sdk,
    react_native: latestRN ? latestRN.version : tracked.react_native,
    react: tracked.react, // updated by changelog analysis if needed
    last_updated: new Date().toISOString().split('T')[0],
    rules_updated: updatedFiles,
  };
  writeFileSync(VERSIONS_FILE, JSON.stringify(newTracked, null, 2) + '\n', 'utf-8');
  console.log(`  Updated: knowledge-versions.json`);

  console.log('\nKnowledge update complete!');
  console.log(
    `Summary: ${changes.map((c) => `${c.name} ${c.version}`).join(', ')}`,
  );
}

main().catch((err) => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
