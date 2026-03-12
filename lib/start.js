// lib/start.js — Initialize project and launch dashboard in background
'use strict';

const net = require('net');
const fs = require('fs');
const { fork, execSync } = require('child_process');
const path = require('path');

const SERVER_PATH = path.resolve(__dirname, '..', 'dashboard', 'server.js');
const DEFAULT_PORT = 3333;

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

function ensureWsDependency() {
  const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
  if (!fs.existsSync(path.join(dashboardDir, 'node_modules', 'ws'))) {
    console.log('  Installing dashboard dependencies...');
    execSync('npm install --production', { cwd: dashboardDir, stdio: 'ignore' });
  }
}

module.exports = async function start() {
  const init = require('./init');
  await init();

  const port = DEFAULT_PORT;

  // Check port availability before forking
  try {
    await checkPort(port);
  } catch (err) {
    console.error(`\n  Error: ${err.message}`);
    console.error('  Try a different port or stop the existing process.\n');
    return;
  }

  // Ensure ws dependency is installed
  ensureWsDependency();

  const child = fork(SERVER_PATH, [], {
    env: { ...process.env, ERNE_DASHBOARD_PORT: String(port) },
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  const url = `http://localhost:${port}`;
  console.log(`\n  ERNE Dashboard running at ${url}\n`);
};
