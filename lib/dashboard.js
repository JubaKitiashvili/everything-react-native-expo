// lib/dashboard.js — Launch the ERNE Agent Dashboard
'use strict';

const net = require('net');
const { fork } = require('child_process');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');
const {
  getRegisteredPort,
  findFreePort,
  registerPort,
  unregisterPort,
} = require('../scripts/hooks/lib/port-registry');

const HOOKS_PATH = path.join(process.cwd(), '.claude', 'hooks.json');
const SETTINGS_LOCAL_PATH = path.join(process.cwd(), '.claude', 'settings.local.json');
const SERVER_PATH = path.resolve(__dirname, '..', 'dashboard', 'server.js');

function parseArgs(argv) {
  const args = argv.slice(3);
  let port = parseInt(process.env.ERNE_DASHBOARD_PORT, 10) || 3333;
  let open = true;
  let context = process.env.ERNE_CONTEXT === 'true';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      const parsed = parseInt(args[i + 1], 10);
      if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
        console.error(`Invalid port: ${args[i + 1]} (must be 1-65535)`);
        process.exit(1);
      }
      port = parsed;
      i++;
    } else if (args[i] === '--no-open') {
      open = false;
    } else if (args[i] === '--context') {
      context = true;
    }
  }

  return { port, open, context };
}

function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(port);
  });
}

/**
 * Check if a hooks config (either old array format or new event-keyed format)
 * contains a dashboard hook matching the given script name.
 */
function hasDashboardHookInConfig(data, scriptName) {
  // Old format: { hooks: [{ event, script, ... }] }
  if (Array.isArray(data.hooks)) {
    return data.hooks.some((h) => h.script === scriptName);
  }
  // New event-keyed format: { PreToolUse: [{ script, ... }], PostToolUse: [...] }
  for (const [key, hooks] of Object.entries(data)) {
    if (key === '_meta') continue;
    if (Array.isArray(hooks)) {
      if (hooks.some((h) => h.script === scriptName)) return true;
    }
  }
  return false;
}

async function ensureHooksConfigured() {
  // Check settings.local.json first (Claude Code's actual hook source)
  try {
    if (fs.existsSync(SETTINGS_LOCAL_PATH)) {
      const settingsLocal = JSON.parse(fs.readFileSync(SETTINGS_LOCAL_PATH, 'utf8'));
      if (settingsLocal.hooks) {
        // Check if dashboard hooks already exist in Claude Code format
        const preToolUse = settingsLocal.hooks.PreToolUse || [];
        const postToolUse = settingsLocal.hooks.PostToolUse || [];
        const hasPre = preToolUse.some(
          (entry) =>
            entry.matcher === 'Agent' &&
            entry.hooks &&
            entry.hooks.some((h) => h.command && h.command.includes('dashboard-event.js')),
        );
        const hasPost = postToolUse.some(
          (entry) =>
            entry.matcher === 'Agent' &&
            entry.hooks &&
            entry.hooks.some((h) => h.command && h.command.includes('dashboard-event.js')),
        );
        if (hasPre && hasPost) return;
      }
    }
  } catch {
    /* continue to add hooks */
  }

  // Also check legacy hooks.json for backward compat detection
  try {
    if (fs.existsSync(HOOKS_PATH)) {
      const raw = fs.readFileSync(HOOKS_PATH, 'utf8');
      const data = JSON.parse(raw);
      if (hasDashboardHookInConfig(data, 'dashboard-event.js')) {
        // Found in legacy format but not in settings.local.json — migrate
        _addDashboardHooksToSettingsLocal();
        console.log('  Dashboard hooks migrated to settings.local.json');
        return;
      }
    }
  } catch {
    /* continue */
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  const answer = await rl.question('  Dashboard hooks not configured. Add them now? (Y/n) ');
  rl.close();

  if (answer.toLowerCase() === 'n') return;

  // Add to ERNE internal hooks.json
  try {
    if (fs.existsSync(HOOKS_PATH)) {
      const data = JSON.parse(fs.readFileSync(HOOKS_PATH, 'utf8'));
      if (Array.isArray(data.hooks)) {
        data.hooks.push(
          {
            event: 'PreToolUse',
            pattern: 'Agent',
            script: 'dashboard-event.js',
            command: 'node .claude/hooks/scripts/run-with-flags.js dashboard-event.js',
            profiles: ['minimal', 'standard', 'strict'],
          },
          {
            event: 'PostToolUse',
            pattern: 'Agent',
            script: 'dashboard-event.js',
            command: 'node .claude/hooks/scripts/run-with-flags.js dashboard-event.js',
            profiles: ['minimal', 'standard', 'strict'],
          },
        );
      } else {
        const dashboardHook = {
          pattern: 'Agent',
          script: 'dashboard-event.js',
          command: 'node .claude/hooks/scripts/run-with-flags.js dashboard-event.js',
          profiles: ['minimal', 'standard', 'strict'],
        };
        if (!data.PreToolUse) data.PreToolUse = [];
        data.PreToolUse.push(dashboardHook);
        if (!data.PostToolUse) data.PostToolUse = [];
        data.PostToolUse.push({ ...dashboardHook });
      }
      fs.writeFileSync(HOOKS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    }
  } catch {
    /* best effort */
  }

  // Add to settings.local.json (Claude Code's actual hook source)
  _addDashboardHooksToSettingsLocal();
  console.log('  Dashboard hooks added to settings.local.json');
}

function _addDashboardHooksToSettingsLocal() {
  // Ensure .claude directory exists
  const claudeDir = path.dirname(SETTINGS_LOCAL_PATH);
  if (!fs.existsSync(claudeDir)) {
    fs.mkdirSync(claudeDir, { recursive: true });
  }
  let settingsLocal = {};
  if (fs.existsSync(SETTINGS_LOCAL_PATH)) {
    try {
      settingsLocal = JSON.parse(fs.readFileSync(SETTINGS_LOCAL_PATH, 'utf8'));
    } catch {
      /* fresh */
    }
  }
  if (!settingsLocal.hooks) settingsLocal.hooks = {};

  const dashboardClaudeHook = {
    type: 'command',
    command: 'node .claude/hooks/scripts/run-with-flags.js dashboard-event.js',
    timeout: 5,
  };

  // Add to PreToolUse
  if (!settingsLocal.hooks.PreToolUse) settingsLocal.hooks.PreToolUse = [];
  const preAgent = settingsLocal.hooks.PreToolUse.find((e) => e.matcher === 'Agent');
  if (preAgent) {
    if (!preAgent.hooks.some((h) => h.command && h.command.includes('dashboard-event.js'))) {
      preAgent.hooks.push({ ...dashboardClaudeHook });
    }
  } else {
    settingsLocal.hooks.PreToolUse.push({
      matcher: 'Agent',
      hooks: [{ ...dashboardClaudeHook }],
    });
  }

  // Add to PostToolUse
  if (!settingsLocal.hooks.PostToolUse) settingsLocal.hooks.PostToolUse = [];
  const postAgent = settingsLocal.hooks.PostToolUse.find((e) => e.matcher === 'Agent');
  if (postAgent) {
    if (!postAgent.hooks.some((h) => h.command && h.command.includes('dashboard-event.js'))) {
      postAgent.hooks.push({ ...dashboardClaudeHook });
    }
  } else {
    settingsLocal.hooks.PostToolUse.push({
      matcher: 'Agent',
      hooks: [{ ...dashboardClaudeHook }],
    });
  }

  fs.writeFileSync(SETTINGS_LOCAL_PATH, JSON.stringify(settingsLocal, null, 2) + '\n', 'utf8');
}

function openBrowser(url) {
  const platform = process.platform;
  try {
    if (platform === 'darwin') {
      execFileSync('open', [url]);
    } else if (platform === 'linux') {
      execFileSync('xdg-open', [url]);
    } else if (platform === 'win32') {
      execFileSync('cmd', ['/c', 'start', url]);
    } else {
      console.log('  Open in browser: ' + url);
    }
  } catch {
    // Silently ignore — browser open is best-effort
  }
}

async function dashboard() {
  const { port: cliPort, open, context } = parseArgs(process.argv);
  const projectDir = process.cwd();

  // Resolve port: --port flag > ERNE_DASHBOARD_PORT env > registry > find free
  let port = cliPort;
  const explicitPort = process.argv.includes('--port') || process.env.ERNE_DASHBOARD_PORT;

  if (!explicitPort) {
    // Check registry for this project's existing port
    const registeredPort = getRegisteredPort(projectDir);
    if (registeredPort) {
      port = registeredPort;
    } else {
      // Find a free port dynamically
      try {
        port = await findFreePort();
      } catch (err) {
        console.error(`  Error: ${err.message}`);
        process.exit(1);
      }
    }
  }

  // If port is busy, find a free one (unless user explicitly requested this port)
  try {
    await checkPort(port);
  } catch {
    if (explicitPort) {
      console.error(`  Error: Port ${port} is already in use`);
      console.error(`  Try a different port: erne dashboard --port ${port + 1}`);
      process.exit(1);
    }
    console.log(`  Port ${port} is busy, finding a free port...`);
    // Scan ports directly instead of relying on registry
    let found = false;
    for (let candidate = port + 1; candidate <= 3399; candidate++) {
      try {
        await checkPort(candidate);
        port = candidate;
        found = true;
        break;
      } catch { continue; }
    }
    if (!found) {
      console.error(`  Error: No free ports in range ${port}-3399`);
      process.exit(1);
    }
  }
  await ensureHooksConfigured();

  // Ensure ws dependency is installed
  const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
  // ws is the only required dependency; better-sqlite3 is optional (context features)
  if (!fs.existsSync(path.join(dashboardDir, 'node_modules', 'ws'))) {
    console.error('  Installing dashboard dependencies...');
    require('child_process').execSync('npm install --production', {
      cwd: dashboardDir,
      stdio: 'ignore',
    });
  }

  const serverArgs = context ? ['--context'] : [];
  const child = fork(SERVER_PATH, serverArgs, {
    env: {
      ...process.env,
      ERNE_DASHBOARD_PORT: String(port),
      ERNE_PROJECT_DIR: projectDir,
      ...(context ? { ERNE_CONTEXT: 'true' } : {}),
    },
    stdio: 'pipe',
  });

  child.stdout.on('data', (data) => process.stdout.write(data));
  child.stderr.on('data', (data) => process.stderr.write(data));

  const url = `http://localhost:${port}`;

  // Wait briefly for the server to start before opening the browser
  await new Promise((resolve) => setTimeout(resolve, 500));
  console.log(`  ERNE Dashboard: ${url}`);

  if (open) {
    openBrowser(url);
  }

  const shutdown = () => {
    unregisterPort(projectDir);
    child.kill('SIGTERM');
    child.on('exit', () => process.exit(0));
    setTimeout(() => process.exit(1), 5000); // force after 5s
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive until child exits
  await new Promise((resolve) => {
    child.on('exit', resolve);
  });
}

module.exports = dashboard;
module.exports.parseArgs = parseArgs;
module.exports.checkPort = checkPort;
