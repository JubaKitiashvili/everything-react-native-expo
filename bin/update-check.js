#!/usr/bin/env node
'use strict';

/**
 * erne-universal update checker
 *
 * Output codes (stdout, single line):
 *   JUST_UPGRADED <old> <new>      — User just upgraded
 *   UPGRADE_AVAILABLE <old> <new>  — Newer version on npm
 *   (empty)                        — Up to date or cached
 *
 * State files (in ~/.erne/):
 *   last-update-check    — Cache: "STATUS LOCAL REMOTE"
 *   just-upgraded-from   — Marker: old version string
 *
 * Always exits 0. Never blocks. Network timeout: 5s.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const STATE_DIR = path.join(os.homedir(), '.erne');
const CACHE_FILE = path.join(STATE_DIR, 'last-update-check');
const MARKER_FILE = path.join(STATE_DIR, 'just-upgraded-from');

const TTL_UP_TO_DATE = 60;        // 1 hour
const TTL_UPGRADE_AVAILABLE = 720; // 12 hours

function readFile(p) {
  try { return fs.readFileSync(p, 'utf8').trim(); } catch { return null; }
}

function writeFile(p, content) {
  try {
    if (!fs.existsSync(STATE_DIR)) fs.mkdirSync(STATE_DIR, { recursive: true });
    fs.writeFileSync(p, content);
  } catch {}
}

function compareVersions(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

function fileAgeMinutes(filepath) {
  try {
    return (Date.now() - fs.statSync(filepath).mtimeMs) / 60000;
  } catch { return Infinity; }
}

function isValidVersion(v) {
  return v && /^\d+\.\d+\.\d+/.test(v);
}

function main() {
  // Read local version
  const pkgPath = path.join(__dirname, '..', 'package.json');
  const pkgContent = readFile(pkgPath);
  if (!pkgContent) process.exit(0);

  let local;
  try { local = JSON.parse(pkgContent).version; } catch { process.exit(0); }
  if (!isValidVersion(local)) process.exit(0);

  let justUpgradedOutput = null;

  // Check "just upgraded" marker
  const markerContent = readFile(MARKER_FILE);
  if (markerContent && isValidVersion(markerContent) && markerContent !== local) {
    try { fs.unlinkSync(MARKER_FILE); } catch {}
    justUpgradedOutput = `JUST_UPGRADED ${markerContent} ${local}`;
  }

  // Check cache freshness
  const cacheContent = readFile(CACHE_FILE);
  if (cacheContent) {
    const parts = cacheContent.split(' ');
    const status = parts[0];
    const cachedLocal = parts[1];

    let ttl = 0;
    if (status === 'UP_TO_DATE') ttl = TTL_UP_TO_DATE;
    else if (status === 'UPGRADE_AVAILABLE') ttl = TTL_UPGRADE_AVAILABLE;

    const age = fileAgeMinutes(CACHE_FILE);

    if (ttl > 0 && age < ttl && cachedLocal === local) {
      if (status === 'UPGRADE_AVAILABLE' && parts[2]) {
        if (justUpgradedOutput) console.log(justUpgradedOutput);
        console.log(`UPGRADE_AVAILABLE ${local} ${parts[2]}`);
      } else if (justUpgradedOutput) {
        console.log(justUpgradedOutput);
      }
      process.exit(0);
    }
  }

  // Fetch remote version from npm
  let remote;
  try {
    const { execSync } = require('child_process');
    remote = execSync('npm view erne-universal version 2>/dev/null', {
      timeout: 5000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();
  } catch {
    writeFile(CACHE_FILE, `UP_TO_DATE ${local}`);
    if (justUpgradedOutput) console.log(justUpgradedOutput);
    process.exit(0);
  }

  if (!isValidVersion(remote)) {
    writeFile(CACHE_FILE, `UP_TO_DATE ${local}`);
    if (justUpgradedOutput) console.log(justUpgradedOutput);
    process.exit(0);
  }

  // Compare
  if (compareVersions(remote, local) > 0) {
    writeFile(CACHE_FILE, `UPGRADE_AVAILABLE ${local} ${remote}`);
    if (justUpgradedOutput) console.log(justUpgradedOutput);
    console.log(`UPGRADE_AVAILABLE ${local} ${remote}`);
  } else {
    writeFile(CACHE_FILE, `UP_TO_DATE ${local}`);
    if (justUpgradedOutput) console.log(justUpgradedOutput);
  }
}

try {
  main();
} catch {
  process.exit(0);
}
