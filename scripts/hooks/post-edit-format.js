'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const {
  readStdin,
  getEditedFilePath,
  pass,
  warn,
} = require('./lib/hook-utils');

const SUPPORTED_EXTENSIONS = [
  '.js', '.jsx', '.ts', '.tsx',
  '.json', '.css', '.md',
];

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) {
  pass();
}

const ext = path.extname(filePath).toLowerCase();
if (!SUPPORTED_EXTENSIONS.includes(ext)) {
  pass();
}

try {
  execFileSync('npx', ['prettier', '--write', filePath], {
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 15000,
    cwd: process.env.ERNE_PROJECT_DIR || process.cwd(),
  });
  pass(`ERNE: Formatted ${path.basename(filePath)}`);
} catch (err) {
  warn(`ERNE: Could not format ${path.basename(filePath)}: prettier unavailable or failed`);
}
