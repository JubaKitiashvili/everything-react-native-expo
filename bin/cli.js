#!/usr/bin/env node
// bin/cli.js — ERNE CLI entry point
// Usage: npx erne-universal <command>
//   Commands:
//     init     — Interactive project setup
//     update   — Update ERNE to latest version
//     version  — Show installed version

'use strict';

const { resolve, join } = require('path');

const COMMANDS = {
  init: () => require('../lib/init'),
  update: () => require('../lib/update'),
  version: () => {
    const pkg = require('../package.json');
    console.log(`erne v${pkg.version}`);
    process.exit(0);
  },
  help: () => {
    console.log(`
  erne — AI coding agent harness for React Native & Expo

  Usage:
    npx erne-universal <command>

  Commands:
    init       Set up ERNE in your project
    update     Update to the latest version
    version    Show installed version
    help       Show this help message

  Website: https://erne.dev
    `);
    process.exit(0);
  }
};

const command = process.argv[2] || 'help';

if (!COMMANDS[command]) {
  console.error(`Unknown command: ${command}`);
  console.error('Run "npx erne-universal help" for available commands.');
  process.exit(1);
}

// Execute command module
const run = COMMANDS[command]();
if (typeof run === 'function') {
  run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
