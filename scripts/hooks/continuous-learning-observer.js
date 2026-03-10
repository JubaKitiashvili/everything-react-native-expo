'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();

const observation = {
  timestamp: new Date().toISOString(),
  stop_reason: input.stop_reason || null,
};

try {
  const obsDir = path.join(projectDir, '.claude', 'erne');
  fs.mkdirSync(obsDir, { recursive: true });

  const obsPath = path.join(obsDir, 'observations.jsonl');
  fs.appendFileSync(obsPath, JSON.stringify(observation) + '\n');
} catch {
  // Never fail — this is a passive observer
}

process.exit(0);
