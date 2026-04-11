#!/usr/bin/env node
// @erne/monitor CLI entry — `npx @erne/monitor init [--dry-run]`.

import { runInit } from './init';

function main(): void {
  const argv = process.argv.slice(2);
  const command = argv[0] ?? 'init';
  if (command !== 'init') {
    console.error(
      '@erne/monitor: unknown command "' + command + '". Supported: init [--dry-run]',
    );
    process.exit(1);
  }
  const dryRun = argv.includes('--dry-run');
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
}

main();
