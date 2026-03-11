// lib/dashboard.js — Launch the ERNE Agent Dashboard
'use strict';

const net = require('net');
const { fork } = require('child_process');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const HOOKS_PATH = path.resolve(__dirname, '..', 'hooks', 'hooks.json');
const SERVER_PATH = path.resolve(__dirname, '..', 'dashboard', 'server.js');

function parseArgs(argv) {
  const args = argv.slice(3);
  let port = 3333;
  let open = true;

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
    }
  }

  return { port, open };
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

async function ensureHooksConfigured() {
  try {
    const raw = fs.readFileSync(HOOKS_PATH, 'utf8');
    const data = JSON.parse(raw);
    const hasDashboardHook = data.hooks.some(
      (h) => h.script === 'dashboard-event.js'
    );

    if (hasDashboardHook) return;

    const rl = readline.createInterface({ input: stdin, output: stdout });
    const answer = await rl.question(
      '  Dashboard hooks not configured. Add them now? (Y/n) '
    );
    rl.close();

    if (answer.toLowerCase() === 'n') return;

    data.hooks.push(
      {
        event: 'PreToolUse',
        pattern: 'Agent',
        script: 'dashboard-event.js',
        command: 'node scripts/hooks/run-with-flags.js dashboard-event.js',
        profiles: ['minimal', 'standard', 'strict'],
      },
      {
        event: 'PostToolUse',
        pattern: 'Agent',
        script: 'dashboard-event.js',
        command: 'node scripts/hooks/run-with-flags.js dashboard-event.js',
        profiles: ['minimal', 'standard', 'strict'],
      }
    );

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
    }
  } catch {
    // Silently ignore — browser open is best-effort
  }
}

module.exports = async function dashboard() {
  const { port, open } = parseArgs(process.argv);

  await checkPort(port);
  await ensureHooksConfigured();

  // Ensure ws dependency is installed
  const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
  if (!fs.existsSync(path.join(dashboardDir, 'node_modules', 'ws'))) {
    console.log('  Installing dashboard dependencies...');
    require('child_process').execSync('npm install --production', { cwd: dashboardDir, stdio: 'ignore' });
  }

  const child = fork(SERVER_PATH, [], {
    env: { ...process.env, ERNE_DASHBOARD_PORT: String(port) },
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
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  // Keep alive until child exits
  await new Promise((resolve) => {
    child.on('exit', resolve);
  });
};
