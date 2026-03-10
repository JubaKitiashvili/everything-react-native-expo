'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();

const evaluation = {
  timestamp: new Date().toISOString(),
  stop_reason: input.stop_reason || null,
  session_id: `session-${Date.now()}`,
};

try {
  const evalDir = path.join(projectDir, '.claude', 'erne');
  fs.mkdirSync(evalDir, { recursive: true });

  const filename = `session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  const evalPath = path.join(evalDir, filename);
  fs.writeFileSync(evalPath, JSON.stringify(evaluation, null, 2) + '\n');
} catch {
  // Never fail — session evaluation is advisory
}

process.exit(0);
