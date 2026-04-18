#!/usr/bin/env node
// @erne/monitor CLI entry.
//   `npx @erne/monitor init [--dry-run]`
//   `npx @erne/monitor dashboard [--port <n>] [--host <h>] [--db <path>] [--open]`

import { runInit } from './init';
import { runDashboardCommand } from './dashboard';

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'init';
  const rest = argv.slice(1);

  if (command === 'init') {
    const dryRun = rest.includes('--dry-run');
    const root = process.cwd();
    try {
      const result = runInit({ root, dryRun });
      console.log(result.summary);
      if (dryRun) {
        console.log('\n(dry run — no files were written)');
      }
    } catch (err) {
      console.error(
        '@erne/monitor init failed:',
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
    return;
  }

  if (command === 'dashboard') {
    const exitCode = await runDashboardCommand(rest);
    process.exit(exitCode);
  }

  console.error(
    '@erne/monitor: unknown command "' + command + '". Supported: init [--dry-run] | dashboard [flags]',
  );
  process.exit(1);
}

void main();
