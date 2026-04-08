'use strict';

const fs = require('fs');
const path = require('path');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

// ─── Helper functions for layer detection ────────────────────────────────────

function fileExists(relPath) {
  return fs.existsSync(path.join(projectDir, relPath));
}

function dirExists(relPath) {
  try {
    return fs.statSync(path.join(projectDir, relPath)).isDirectory();
  } catch {
    return false;
  }
}

function findFilesWithExt(dir, ext) {
  const fullDir = path.join(projectDir, dir);
  try {
    const entries = fs.readdirSync(fullDir, {
      withFileTypes: true,
      recursive: true,
    });
    return entries.some((e) => e.isFile() && e.name.endsWith(ext));
  } catch {
    return false;
  }
}

function readPackageJson() {
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasExpoDependency(pkg) {
  if (!pkg) return false;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return 'expo' in deps;
}

// ─── Detect layers (always needed for backward compat) ───────────────────────

const layers = ['common'];
const pkg = readPackageJson();
const hasIosDir = dirExists('ios');
const hasAndroidDir = dirExists('android');

if (hasExpoDependency(pkg)) {
  layers.push('expo');
} else if (hasIosDir && hasAndroidDir) {
  layers.push('bare-rn');
}

if (hasIosDir && findFilesWithExt('ios', '.swift')) {
  layers.push('native-ios');
}

if (hasAndroidDir && findFilesWithExt('android', '.kt')) {
  layers.push('native-android');
}

const hasSignals = layers.length > 1;

// ─── Read ERNE settings for richer banner ────────────────────────────────────

const settingsPath = path.join(projectDir, '.claude', 'settings.json');
let version = '';
let profile = 'unknown';
let agentCount = 0;
let hasSettings = false;

try {
  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  hasSettings = true;
  profile = settings.profile || 'standard';
  version = settings.erneVersion || '';
} catch {
  /* no settings */
}

// Count agents
try {
  const agentDir = path.join(projectDir, '.claude', 'agents');
  if (fs.existsSync(agentDir)) {
    agentCount = fs.readdirSync(agentDir).filter((f) => f.endsWith('.md')).length;
  }
} catch {
  /* skip */
}

// ─── Dashboard detection + auto-start ─────────────────────────────────────

let dashboardUrl = '';

if (hasSettings) {
  try {
    const { getRegisteredPort, resolveDashboardPort } = require('./lib/port-registry');
    const existingPort = getRegisteredPort(projectDir);
    if (existingPort) {
      dashboardUrl = `http://localhost:${existingPort}`;
    } else if (!process.env.ERNE_SKIP_DASHBOARD) {
      // Auto-start dashboard in background
      try {
        const { spawn } = require('child_process');
        const child = spawn('npx', ['-y', 'erne-universal', 'dashboard', '--no-open'], {
          cwd: projectDir,
          detached: true,
          stdio: 'ignore',
          env: { ...process.env, ERNE_PROJECT_DIR: projectDir },
        });
        child.unref();
        const startPort = resolveDashboardPort(projectDir);
        dashboardUrl = `http://localhost:${startPort} (starting...)`;
      } catch {
        /* auto-start failed — skip */
      }
    }
  } catch {
    /* port-registry not available — skip */
  }
}

// ─── Update check ────────────────────────────────────────────────────────────

let updateNotice = '';
try {
  const { execSync } = require('child_process');
  const updateScript = path.join(__dirname, '..', '..', 'bin', 'update-check.js');
  if (fs.existsSync(updateScript)) {
    const updateResult = execSync(`node "${updateScript}" 2>/dev/null`, {
      timeout: 6000,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    }).trim();

    if (updateResult) {
      for (const line of updateResult.split('\n')) {
        const parts = line.split(' ');
        if (parts[0] === 'JUST_UPGRADED') {
          updateNotice = `✓ Upgraded: ${parts[1]} → ${parts[2]}`;
        } else if (parts[0] === 'UPGRADE_AVAILABLE') {
          updateNotice = `Update available: ${parts[1]} → ${parts[2]}  —  npm i -g erne-universal`;
        }
      }
    }
  }
} catch { /* update check is non-critical */ }

// ─── Print banner ────────────────────────────────────────────────────────────

if (hasSettings) {
  // Rich banner when ERNE is properly installed
  const parts = [];
  if (version) parts.push(`v${version}`);
  parts.push(profile);
  if (agentCount > 0) parts.push(`${agentCount} agents`);
  if (dashboardUrl) parts.push(`Dashboard: ${dashboardUrl}`);
  console.error(`ERNE ${parts.join(' | ')}`);
  if (updateNotice) console.error(updateNotice);
} else {
  // Fallback: layer-based output for projects without full ERNE init
  const parts = [];
  if (version) parts.push(`v${version}`);
  parts.push(`${profile} profile`);
  if (agentCount > 0) parts.push(`${agentCount} agents`);
  parts.push(`layers: ${layers.join(', ')}`);
  console.error(`ERNE ${parts.join(' | ')}`);
  console.error(`Use /erne- commands (e.g. /erne-plan, /erne-perf, /erne-doctor)`);
  if (updateNotice) console.error(updateNotice);
}

if (!hasSignals) {
  process.exit(2); // warn
} else {
  process.exit(0);
}
