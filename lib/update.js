// lib/update.js — Update ERNE to latest version
// Usage: npx erne-universal update

'use strict';

const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const SEMVER_RE = /^\d+\.\d+\.\d+(-[\w.]+)?$/;

module.exports = async function update() {
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  console.log('\n  erne — Checking for updates...\n');

  // Check if ERNE is installed in this project
  if (!fs.existsSync(settingsPath)) {
    console.log('  ⚠ ERNE not found in this project.');
    console.log('  Run "npx erne-universal init" to set up.');
    return;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  console.log(`  Current version: ${settings.erneVersion}`);

  // Fetch latest version from npm
  let latestVersion;
  try {
    latestVersion = execSync('npm view erne-universal version', { encoding: 'utf8' }).trim();
  } catch {
    console.log('  ⚠ Could not check npm for latest version.');
    console.log('  Check https://erne.dev for updates.');
    return;
  }

  console.log(`  Latest version:  ${latestVersion}`);

  if (settings.erneVersion === latestVersion) {
    console.log('\n  Already up to date!\n');
    return;
  }

  if (!SEMVER_RE.test(latestVersion)) {
    console.error(`  Invalid version format: ${latestVersion}`);
    return;
  }

  console.log(`\n  Updating ${settings.erneVersion} → ${latestVersion}...`);

  // Re-run init with preserved settings
  // The init command detects existing settings and preserves user choices
  console.log('  Running: npx erne-universal@latest init');
  console.log('  Your profile and MCP selections will be preserved.\n');

  try {
    execFileSync('npx', [`erne-universal@${latestVersion}`, 'init'], {
      stdio: 'inherit',
      cwd,
    });
  } catch (err) {
    console.error('  Update failed:', err.message);
    console.error('  Manual update: npm install -g erne-universal@latest && erne init');
  }
};
