// lib/start.js — Initialize project and launch dashboard in background
'use strict';

const { fork } = require('child_process');
const path = require('path');

const SERVER_PATH = path.resolve(__dirname, '..', 'dashboard', 'server.js');
const DEFAULT_PORT = 3333;

module.exports = async function start() {
  const init = require('./init');
  await init();

  const port = DEFAULT_PORT;

  const child = fork(SERVER_PATH, [], {
    env: { ...process.env, ERNE_DASHBOARD_PORT: String(port) },
    detached: true,
    stdio: 'ignore',
  });

  child.unref();

  const url = `http://localhost:${port}`;
  console.log(`\n  ERNE Dashboard running at ${url}\n`);
};
