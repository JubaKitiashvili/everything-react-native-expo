// dashboard/lib/myapp/handler.js
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

// Lazy-load heavy modules
var detectProject;
try { detectProject = require('../../../lib/detect').detectProject; } catch (e) { detectProject = null; }
var auditModule;
try { auditModule = require('../../../lib/audit'); } catch (e) { auditModule = null; }

// Upgrades scanner (reuse existing)
var scanner;
try { scanner = require('../upgrades/scanner'); } catch (e) { scanner = null; }

// Cache detection result (expensive to recompute)
var cachedOverview = null;
var cacheTime = 0;
var CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// ─── MCP Detection ───────────────────────────────────────────────────────────

function getMcpStatus(projectDir) {
  var mcpConfigsDir = path.resolve(__dirname, '..', '..', '..', 'mcp-configs');
  var available = [];

  // Read all ERNE MCP configs
  try {
    var files = fs.readdirSync(mcpConfigsDir).filter(function (f) { return f.endsWith('.json'); });
    files.forEach(function (file) {
      try {
        var config = JSON.parse(fs.readFileSync(path.join(mcpConfigsDir, file), 'utf8'));
        if (config._meta) {
          available.push({
            id: config._meta.name,
            description: config._meta.description || '',
            category: config._meta.category || 'optional',
            requires: config._meta.requires || [],
          });
        }
      } catch (e) { /* skip invalid */ }
    });
  } catch (e) { /* no mcp-configs dir */ }

  // Check which are installed — look in user's settings.json
  var installed = new Set();
  var settingsPaths = [
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(os.homedir(), '.claude', 'settings.json'),
    path.join(projectDir, '.claude', 'settings.local.json'),
  ];

  settingsPaths.forEach(function (sp) {
    try {
      var settings = JSON.parse(fs.readFileSync(sp, 'utf8'));
      if (settings.mcpServers) {
        Object.keys(settings.mcpServers).forEach(function (name) {
          installed.add(name);
        });
      }
    } catch (e) { /* no settings file */ }
  });

  return available.map(function (mcp) {
    return Object.assign({}, mcp, { installed: installed.has(mcp.id) });
  });
}

// ─── Environment Checks ─────────────────────────────────────────────────────

function checkEnvironment(framework, callback) {
  var checks = [];
  var pending = 0;

  function addCheck(name, cmd, args, parseFn) {
    pending++;
    execFile(cmd, args, { timeout: 5000 }, function (err, stdout) {
      var version = null;
      var ok = false;
      if (!err && stdout) {
        version = parseFn ? parseFn(stdout.trim()) : stdout.trim().split('\n')[0];
        ok = true;
      }
      checks.push({ name: name, version: version, ok: ok });
      pending--;
      if (pending === 0) callback(checks);
    });
  }

  addCheck('Node.js', 'node', ['--version'], function (v) { return v; });
  addCheck('npm', 'npm', ['--version'], function (v) { return 'v' + v; });

  if (framework === 'expo-managed' || framework === 'expo-bare') {
    addCheck('Expo CLI', 'npx', ['expo', '--version']);
    addCheck('EAS CLI', 'npx', ['eas', '--version']);
  }

  if (framework === 'bare-rn' || framework === 'expo-bare') {
    addCheck('Xcode', 'xcodebuild', ['-version'], function (v) {
      var match = v.match(/Xcode\s+([\d.]+)/);
      return match ? match[1] : v.split('\n')[0];
    });
    addCheck('CocoaPods', 'pod', ['--version'], function (v) { return 'v' + v; });
    addCheck('Android SDK', path.join(os.homedir(), 'Library/Android/sdk/platform-tools/adb'), ['version'], function (v) {
      var match = v.match(/version\s+([\d.]+)/);
      return match ? match[1] : 'installed';
    });
  }

  addCheck('Watchman', 'watchman', ['--version']);
  addCheck('Git', 'git', ['--version'], function (v) {
    var match = v.match(/git version ([\d.]+)/);
    return match ? match[1] : v;
  });

  // Fallback if no checks queued
  if (pending === 0) callback(checks);
}

// ─── Recent Fixes ────────────────────────────────────────────────────────────

function getRecentFixes() {
  try {
    var histFile = path.join(os.homedir(), '.erne', 'activity-history.json');
    var history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
    var fixes = [];

    for (var agent in history) {
      if (!history.hasOwnProperty(agent)) continue;
      (history[agent] || []).forEach(function (entry) {
        if (entry.type === 'complete' && entry.task && /fix[:\s]/i.test(entry.task)) {
          fixes.push({
            agent: agent,
            task: entry.task,
            timestamp: entry.timestamp,
            durationMs: entry.durationMs || null,
          });
        }
      });
    }

    fixes.sort(function (a, b) {
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return fixes.slice(0, 20);
  } catch (e) {
    return [];
  }
}

// ─── Quick Actions ───────────────────────────────────────────────────────────

function getQuickActions(framework, projectDir) {
  var actions = [];

  // Common actions
  actions.push({ id: 'test', label: 'Run Tests', icon: 'test', cmd: 'npm', args: ['test'] });
  actions.push({ id: 'lint', label: 'Lint', icon: 'lint', cmd: 'npm', args: ['run', 'lint'] });

  if (framework === 'expo-managed') {
    actions.push({ id: 'start', label: 'Start Dev', icon: 'play', cmd: 'npx', args: ['expo', 'start'] });
    actions.push({ id: 'build-ios', label: 'Build iOS', icon: 'build', cmd: 'npx', args: ['eas', 'build', '-p', 'ios', '--profile', 'development'] });
    actions.push({ id: 'build-android', label: 'Build Android', icon: 'build', cmd: 'npx', args: ['eas', 'build', '-p', 'android', '--profile', 'development'] });
  } else if (framework === 'expo-bare') {
    actions.push({ id: 'start', label: 'Start Dev', icon: 'play', cmd: 'npx', args: ['expo', 'start'] });
    actions.push({ id: 'run-ios', label: 'Run iOS', icon: 'build', cmd: 'npx', args: ['expo', 'run:ios'] });
    actions.push({ id: 'run-android', label: 'Run Android', icon: 'build', cmd: 'npx', args: ['expo', 'run:android'] });
    actions.push({ id: 'pod-install', label: 'Pod Install', icon: 'tool', cmd: 'npx', args: ['pod-install'] });
  } else {
    actions.push({ id: 'start', label: 'Start Metro', icon: 'play', cmd: 'npx', args: ['react-native', 'start'] });
    actions.push({ id: 'run-ios', label: 'Run iOS', icon: 'build', cmd: 'npx', args: ['react-native', 'run-ios'] });
    actions.push({ id: 'run-android', label: 'Run Android', icon: 'build', cmd: 'npx', args: ['react-native', 'run-android'] });
    actions.push({ id: 'pod-install', label: 'Pod Install', icon: 'tool', cmd: 'sh', args: ['-c', 'cd ios && pod install'] });
  }

  return actions;
}

// ─── Main Handler ────────────────────────────────────────────────────────────

function handler(req, res, urlPath, body) {
  var projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

  // GET /api/myapp/overview — full app info
  if (req.method === 'GET' && urlPath === '/api/myapp/overview') {
    // Check cache
    if (cachedOverview && (Date.now() - cacheTime < CACHE_TTL)) {
      return sendJSON(res, 200, cachedOverview);
    }

    var overview = {
      project: { name: '', version: '', path: projectDir },
      detection: null,
      audit: null,
      mcp: [],
      updates: [],
      recommendations: [],
      fixes: [],
      quickActions: [],
    };

    // Read package.json
    try {
      var pkg = JSON.parse(fs.readFileSync(path.join(projectDir, 'package.json'), 'utf8'));
      overview.project.name = pkg.name || path.basename(projectDir);
      overview.project.version = pkg.version || '0.0.0';
    } catch (e) {
      overview.project.name = path.basename(projectDir);
    }

    // Detection
    if (detectProject) {
      try {
        overview.detection = detectProject(projectDir);
      } catch (e) { /* detection failed */ }
    }

    var framework = overview.detection ? overview.detection.framework : 'unknown';

    // Audit
    if (auditModule && overview.detection) {
      try {
        var findings = auditModule.collectFindings(projectDir, overview.detection);
        overview.audit = {
          score: findings.score || 0,
          findings: (findings.findings || []).slice(0, 20),
          strengths: findings.strengths || [],
        };
        // Separate recommendations from audit findings
        overview.recommendations = (findings.findings || []).filter(function (f) {
          return f.severity === 'warning' || f.severity === 'info';
        }).slice(0, 10);
      } catch (e) { /* audit failed */ }
    }

    // MCP Status
    overview.mcp = getMcpStatus(projectDir);

    // Updates from upgrades cache
    if (scanner) {
      var cache = scanner.readCache(projectDir);
      if (cache && cache.packages) {
        overview.updates = cache.packages.slice(0, 15);
      }
    }

    // Recent fixes
    overview.fixes = getRecentFixes();

    // Quick actions
    overview.quickActions = getQuickActions(framework, projectDir);

    cachedOverview = overview;
    cacheTime = Date.now();

    return sendJSON(res, 200, overview);
  }

  // GET /api/myapp/environment — environment checks (async)
  if (req.method === 'GET' && urlPath === '/api/myapp/environment') {
    var framework = 'unknown';
    if (detectProject) {
      try {
        var det = detectProject(projectDir);
        framework = det.framework;
      } catch (e) { /* use unknown */ }
    }

    checkEnvironment(framework, function (checks) {
      sendJSON(res, 200, { checks: checks });
    });
    return;
  }

  // POST /api/myapp/action — run a quick action
  if (req.method === 'POST' && urlPath === '/api/myapp/action') {
    var parsed;
    try { parsed = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
    if (!parsed.cmd || !Array.isArray(parsed.args)) return sendJSON(res, 400, { error: 'Missing cmd or args' });

    // Whitelist allowed commands
    var ALLOWED_CMDS = ['npm', 'npx', 'node', 'pod', 'sh', 'git'];
    if (ALLOWED_CMDS.indexOf(parsed.cmd) === -1) return sendJSON(res, 400, { error: 'Command not allowed' });

    execFile(parsed.cmd, parsed.args, { cwd: projectDir, timeout: 120000, maxBuffer: 1024 * 1024 }, function (err, stdout, stderr) {
      sendJSON(res, 200, {
        success: !err,
        output: (stdout || '').slice(0, 5000),
        error: err ? (stderr || err.message).slice(0, 2000) : null,
        exitCode: err ? (err.code || 1) : 0,
      });
    });
    return;
  }

  // POST /api/myapp/refresh — clear cache and refresh
  if (req.method === 'POST' && urlPath === '/api/myapp/refresh') {
    cachedOverview = null;
    cacheTime = 0;
    return sendJSON(res, 200, { ok: true });
  }

  sendJSON(res, 404, { error: 'Not found' });
}

module.exports = handler;
