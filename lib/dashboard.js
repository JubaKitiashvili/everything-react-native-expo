// lib/dashboard.js — Launch the ERNE Agent Dashboard
'use strict';

const net = require('net');
const { fork } = require('child_process');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const HOOKS_PATH = path.join(process.cwd(), '.claude', 'hooks.json');
const SERVER_PATH = path.resolve(__dirname, '..', 'dashboard', 'server.js');

function parseArgs(argv) {
  const args = argv.slice(3);
  let port = 3333;
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
  try {
    const raw = fs.readFileSync(HOOKS_PATH, 'utf8');
    const data = JSON.parse(raw);

    if (hasDashboardHookInConfig(data, 'dashboard-event.js')) return;

    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(
      '  Dashboard hooks not configured. Add them now? (Y/n) '
    );
    rl.close();

    if (answer.toLowerCase() === 'n') return;

    // Detect format and add hooks accordingly
    if (Array.isArray(data.hooks)) {
      // Old format
      data.hooks.push(
        {
          event: 'PreToolUse',
          pattern: 'Agent',
          script: 'dashboard-event.js',
          command: 'node node_modules/erne-universal/scripts/hooks/run-with-flags.js dashboard-event.js',
          profiles: ['minimal', 'standard', 'strict'],
        },
        {
          event: 'PostToolUse',
          pattern: 'Agent',
          script: 'dashboard-event.js',
          command: 'node node_modules/erne-universal/scripts/hooks/run-with-flags.js dashboard-event.js',
          profiles: ['minimal', 'standard', 'strict'],
        }
      );
    } else {
      // New event-keyed format
      const dashboardHook = {
        pattern: 'Agent',
        script: 'dashboard-event.js',
        command: 'node node_modules/erne-universal/scripts/hooks/run-with-flags.js dashboard-event.js',
        profiles: ['minimal', 'standard', 'strict'],
      };
      if (!data.PreToolUse) data.PreToolUse = [];
      data.PreToolUse.push(dashboardHook);
      if (!data.PostToolUse) data.PostToolUse = [];
      data.PostToolUse.push({ ...dashboardHook });
    }

    fs.writeFileSync(HOOKS_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
    console.log('  Dashboard hooks added to hooks.json');
  } catch (err) {
    if (err.code === 'ENOENT') {
      console.warn('  Warning: hooks/hooks.json not found, skipping hook configuration');
    } else {
      throw err;
    }
  }
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
  const { port, open, context } = parseArgs(process.argv);

  await checkPort(port);
  await ensureHooksConfigured();

  // Ensure ws dependency is installed
  const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
  if (!fs.existsSync(path.join(dashboardDir, 'node_modules', 'better-sqlite3'))) {
    console.log('  Installing dashboard dependencies...');
    require('child_process').execSync('npm install --production', { cwd: dashboardDir, stdio: 'ignore' });
  }

  const serverArgs = context ? ['--context'] : [];
  const child = fork(SERVER_PATH, serverArgs, {
    env: {
      ...process.env,
      ERNE_DASHBOARD_PORT: String(port),
      ERNE_PROJECT_DIR: process.cwd(),
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
