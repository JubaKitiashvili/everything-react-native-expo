#!/usr/bin/env node
// scripts/check-licenses.js — Fail the build if any production dependency
// uses a license outside the permissive allowlist.
//
// Shells out to `license-checker` (fetched on demand via npx, no new repo
// dependency) and lets it do the enforcement. The allowlist below is the
// single source of truth — keep it in sync with NOTICE.
//
// Usage: node scripts/check-licenses.js

'use strict';

const { spawnSync } = require('node:child_process');

// ---------------------------------------------------------------------------
// Allowlist of OSI-approved, permissive licenses.
//
// Only SPDX identifiers in this list are accepted for PRODUCTION dependencies.
// Copyleft licenses (GPL, LGPL, AGPL, MPL, EUPL, ...) are intentionally absent:
// ERNE ships under MIT and must stay free of copyleft obligations.
//
// To allow a new license: add its SPDX id here AND note it in NOTICE.
// ---------------------------------------------------------------------------
const ALLOWED_LICENSES = [
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  '0BSD',
  'CC0-1.0',
  'Unlicense',
  'Python-2.0',
];

// `license-checker` expects a semicolon-separated string for --onlyAllow.
const ONLY_ALLOW = ALLOWED_LICENSES.join(';');

function main() {
  console.log('Auditing production dependency licenses...');
  console.log(`Allowed: ${ALLOWED_LICENSES.join(', ')}\n`);

  const args = [
    '--yes',
    'license-checker',
    '--production',
    '--onlyAllow',
    ONLY_ALLOW,
    '--excludePrivatePackages',
  ];

  const result = spawnSync('npx', args, {
    stdio: 'inherit',
    encoding: 'utf8',
    // license-checker exits non-zero when a disallowed license is found.
    shell: process.platform === 'win32',
  });

  if (result.error) {
    console.error('\nFailed to run license-checker:', result.error.message);
    process.exit(1);
  }

  if (result.status !== 0) {
    console.error(
      '\nLicense audit FAILED — one or more production dependencies use a ' +
        'license outside the allowlist (see above).',
    );
    console.error(
      'Resolve by removing/replacing the dependency, or — if the license is ' +
        'genuinely permissive — add its SPDX id to ALLOWED_LICENSES in this ' +
        'script and to NOTICE.',
    );
    process.exit(result.status || 1);
  }

  console.log('\nLicense audit passed — all production dependencies are permissively licensed.');
}

main();
