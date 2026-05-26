#!/usr/bin/env node
// @erne/monitor CLI entry.
//   `npx @erne/monitor init [--dry-run]`
//   `npx @erne/monitor dashboard [--port <n>] [--host <h>] [--db <path>] [--open]`
//   `npx @erne/monitor scan [path] [--json]`
//   `npx @erne/monitor doctor [path] [--ping [url]]`
//   `npx @erne/monitor monitor live [--url <u>] [--api-key <k>] [--no-color]`

import { runInit } from './init';
import { runDashboardCommand } from './dashboard';
import { runScanCommand } from './scan';
import { runDoctorCommand } from './doctor';
import { runLiveCommand } from './live';

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

  if (command === 'scan') {
    const exitCode = runScanCommand(rest);
    process.exit(exitCode);
  }

  if (command === 'doctor') {
    const exitCode = await runDoctorCommand(rest);
    process.exit(exitCode);
  }

  if (command === 'monitor') {
    // `monitor live [flags]` — the only `monitor` subcommand today.
    const sub = rest[0];
    if (sub === 'live') {
      const exitCode = await runLiveCommand(rest.slice(1));
      process.exit(exitCode);
    }
    console.error(
      '@erne/monitor: unknown `monitor` subcommand "' + (sub ?? '') + '". Supported: monitor live [flags]',
    );
    process.exit(1);
  }

  console.error(
    '@erne/monitor: unknown command "' +
      command +
      '". Supported: init [--dry-run] | dashboard [flags] | scan [path] | doctor [path] | monitor live [flags]',
  );
  process.exit(1);
}

void main();
