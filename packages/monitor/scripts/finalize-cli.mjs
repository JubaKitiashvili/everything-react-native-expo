// Post-compile step for the @erne/monitor CLI.
//
// `tsc` drops the `#!/usr/bin/env node` shebang during emit; we re-prepend
// it to the compiled bin entry + mark the file executable so `npm install`
// can symlink it into `node_modules/.bin/` on POSIX.

import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const binPath = resolve(here, '..', 'dist', 'cli', 'bin.js');

let content;
try {
  content = readFileSync(binPath, 'utf8');
} catch (err) {
  console.error(`[finalize-cli] expected ${binPath} to exist after tsc`);
  throw err;
}

if (!content.startsWith('#!/usr/bin/env node')) {
  writeFileSync(binPath, `#!/usr/bin/env node\n${content}`, 'utf8');
}

try {
  chmodSync(binPath, 0o755);
} catch (err) {
  // chmod fails cleanly on Windows — npm still honours the bin entry via
  // its shim, so we just warn.
  console.warn(`[finalize-cli] chmod 755 failed (non-POSIX host?): ${err.message}`);
}

console.log(`[finalize-cli] ready: ${binPath}`);
