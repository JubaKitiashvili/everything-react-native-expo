#!/usr/bin/env node
// Copies non-TS assets into dist/ after `tsc` emits the JS.
// Keeps the sqliteStore able to `readFileSync(join(here, 'schema.sql'))`
// both when run from source (tests) and when run from the published build.
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

const assets = [['src/storage/schema.sql', 'dist/storage/schema.sql']];

for (const [from, to] of assets) {
  const src = join(root, from);
  const dst = join(root, to);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
  console.log(`[dashboard-server] copied ${from} → ${to}`);
}
