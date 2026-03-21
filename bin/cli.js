#!/usr/bin/env node
// bin/cli.js — ERNE CLI entry point
// Usage: npx erne-universal <command>
//   Commands:
//     init        — Interactive project setup
//     update      — Update ERNE to latest version
//     add-agent   — Create a new custom agent definition
//     version     — Show installed version

'use strict';

const COMMANDS = {
  init: () => require('../lib/init'),
  update: () => require('../lib/update'),
  dashboard: () => require('../lib/dashboard'),
  start: () => require('../lib/start'),
  'add-agent': () => require('../lib/add-agent'),
  doctor: () => require('../lib/doctor'),
  status: () => require('../lib/status'),
  audit: () => {
    console.log('  Running erne doctor...\n');
    return require('../lib/doctor');
  },
  'sync-configs': () => require('../lib/sync-configs'),
  sync: () => require('../lib/sync-configs'),
  version: () => {
    const pkg = require('../package.json');
    console.log(`erne v${pkg.version}`);
    process.exit(0);
  },
  help: () => {
    console.log(`
  erne — AI coding agent harness for React Native & Expo

  Usage:
    npx erne-universal <command> [options]

  Commands:
    init        Set up ERNE in your project
    audit       Run project audit and generate report
    update      Update to the latest version
    add-agent   Create a new custom agent definition
    dashboard   Launch the ERNE Agent Dashboard
    start       Init project and start dashboard
    doctor      Check project health and ERNE setup
    status      Show current ERNE configuration
    sync-configs Sync IDE config files from CLAUDE.md (alias: sync)
    version     Show installed version
    help        Show this help message

  Add-agent options:
    --room <name>   Agent room: development, code-review, testing, conference (default: development)

  Sync-configs options:
    --dry-run              Preview changes without writing files

  Init options:
    --profile, -p <name>   Hook profile: minimal, standard, strict
    --mcp, -m <list>       Comma-separated MCP servers: agent-device,github,...
    --no-mcp               Skip all MCP integrations
    --yes, -y              Accept all defaults (non-interactive)

  Examples:
    npx erne-universal init --yes
    npx erne-universal init --profile strict --mcp agent-device,github
    npx erne-universal init -p minimal --no-mcp -y
    npx erne-universal add-agent api-specialist
    npx erne-universal add-agent database-expert --room testing

  Website: https://erne.dev
    `);
    process.exit(0);
  }
};

let command = process.argv[2] || 'help';

// Handle --version / -v flags
if (command === '--version' || command === '-v') {
  command = 'version';
}

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
