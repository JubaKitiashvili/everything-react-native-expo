// scripts/hooks/run-with-flags.js
'use strict';
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const HOOK_SCRIPT = process.argv[2];
if (!HOOK_SCRIPT) {
  process.exit(0);
}

// Read stdin once for forwarding to hook script
let stdinData = '';
try {
  stdinData = fs.readFileSync(0, 'utf8');
} catch {}

function resolveProfile() {
  // 1. Env var (highest priority)
  if (process.env.ERNE_PROFILE) {
    const p = process.env.ERNE_PROFILE.toLowerCase();
    if (['minimal', 'standard', 'strict'].includes(p)) return p;
  }

  // 2. CLAUDE.md comment
  const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
  const claudeMdPaths = [
    path.join(projectDir, 'CLAUDE.md'),
    path.join(projectDir, '.claude', 'CLAUDE.md'),
  ];
  for (const mdPath of claudeMdPaths) {
    try {
      const content = fs.readFileSync(mdPath, 'utf8');
      const match = content.match(
        /<!--\s*Hook Profile:\s*(minimal|standard|strict)\s*-->/i
      );
      if (match) return match[1].toLowerCase();
    } catch {}
  }

  // 3. Default
  return 'standard';
}

function loadHooksConfig() {
  const configPath =
    process.env.ERNE_HOOKS_CONFIG ||
    path.resolve(__dirname, '../../hooks/hooks.json');
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return { hooks: [] };
  }
}

const profile = resolveProfile();
const config = loadHooksConfig();

// Find hook entry in config
const hookEntry = config.hooks.find(h => h.script === HOOK_SCRIPT);
if (!hookEntry) {
  process.exit(0);
}

// Gate by profile
if (!hookEntry.profiles.includes(profile)) {
  process.exit(0);
}

// Resolve and run the hook script
const scriptPath = path.resolve(__dirname, HOOK_SCRIPT);
if (!fs.existsSync(scriptPath)) {
  console.error(`ERNE: hook script not found: ${scriptPath}`);
  process.exit(2);
}

// Set ERNE_HOOK_CHAIN so context hooks know they're in a chain
const env = { ...process.env, ERNE_HOOK_CHAIN: 'true' };

const startMs = Date.now();

const result = spawnSync('node', [scriptPath], {
  input: stdinData,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'pipe'],
  timeout: 30000,
  env,
});

const durationMs = Date.now() - startMs;

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);

// Report hook execution metrics to dashboard (fire-and-forget)
if (process.env.ERNE_DASHBOARD_PORT || process.env.ERNE_HOOK_CHAIN) {
  try {
    const http = require('http');
    const { resolveDashboardPort } = require('./lib/port-registry');
    const port = resolveDashboardPort();
    const payload = JSON.stringify({
      event_type: 'hook_execution',
      data: {
        hook: HOOK_SCRIPT,
        profile,
        duration_ms: durationMs,
        exit_code: result.status ?? 0,
        skipped: false,
      }
    });
    const req = http.request({
      hostname: '127.0.0.1', port,
      path: '/api/events',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 300
    });
    req.on('error', () => {});
    req.write(payload);
    req.end();
  } catch {}
}

if (result.signal === 'SIGTERM') {
  console.error('ERNE: hook timed out after 30s');
  process.exit(2);
}

process.exit(result.status ?? 0);
