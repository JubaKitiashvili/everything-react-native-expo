#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

// Read stdin (hook context)
let stdinData = '';
try { stdinData = fs.readFileSync(0, 'utf8'); } catch { process.exit(0); }

// Find project dir
const cwd = process.env.ERNE_PROJECT_DIR || process.cwd();
const dataPath = path.join(cwd, 'erne-docs', 'audit-data.json');

// Only refresh if audit-data.json exists (user has opted in)
if (!fs.existsSync(dataPath)) process.exit(0);

// Check if older than 24 hours
try {
  const stat = fs.statSync(dataPath);
  const age = Date.now() - stat.mtimeMs;
  const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000;
  if (age < TWENTY_FOUR_HOURS) process.exit(0);

  // Refresh scan (JSON only, skip dep health for speed)
  let runScan;
  try { runScan = require('erne-universal/lib/audit-scanner').runScan; } catch {
    try { runScan = require('../../lib/audit-scanner').runScan; } catch {
      // When running from .claude/hooks/scripts/, try resolving from project root node_modules
      try { runScan = require(path.join(cwd, 'node_modules', 'erne-universal', 'lib', 'audit-scanner')).runScan; } catch { process.exit(0); }
    }
  }
  const auditData = runScan(cwd, { skipDepHealth: true, maxFiles: 500 });

  const docsDir = path.join(cwd, 'erne-docs');
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir, { recursive: true });
  fs.writeFileSync(dataPath, JSON.stringify(auditData, null, 2));
} catch {
  // Fire-and-forget — never block
  process.exit(0);
}

process.exit(0);
