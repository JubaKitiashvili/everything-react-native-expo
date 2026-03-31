// lib/update.js — Update ERNE to latest version
// Usage: erne update

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

module.exports = async function update() {
  const cwd = process.cwd();
  const localVersion = require('../package.json').version;

  console.log('\n  erne — Checking for updates...\n');
  console.log(`  Installed version: ${localVersion}`);

  // Fetch latest version from npm
  let latestVersion;
  try {
    latestVersion = execSync('npm view erne-universal version', {
      encoding: 'utf8',
      timeout: 10000,
    }).trim();
  } catch {
    console.log('  \u26A0 Could not check npm for latest version.');
    return;
  }

  console.log(`  Latest version:   ${latestVersion}`);

  if (localVersion === latestVersion) {
    console.log('\n  \u2713 Already up to date!\n');
    return;
  }

  // Write upgrade marker for session-start notification
  try {
    const stateDir = path.join(os.homedir(), '.erne');
    if (!fs.existsSync(stateDir)) fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(path.join(stateDir, 'just-upgraded-from'), localVersion);
  } catch { /* non-critical */ }

  // Update the global package
  console.log(`\n  Updating ${localVersion} \u2192 ${latestVersion}...`);
  try {
    execSync(`npm i -g erne-universal@${latestVersion}`, {
      stdio: 'inherit',
      timeout: 60000,
    });
    console.log(`\n  \u2713 erne-universal updated to ${latestVersion}`);
  } catch (err) {
    console.error(`\n  Update failed: ${err.message}`);
    console.error('  Try manually: npm i -g erne-universal@latest');
    return;
  }

  // If this project has ERNE initialized, re-run init to update local config
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    console.log('\n  Updating project configuration...');
    try {
      execSync('erne init', {
        stdio: 'inherit',
        cwd,
      });
    } catch {
      console.log('  \u26A0 Project re-init skipped. Run "erne init" manually to update config.');
    }
  } else {
    console.log('\n  No ERNE project in current directory. Run "erne init" in a project to set up.');
  }
};
