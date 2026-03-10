'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, isTestFile, hasExtension } = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const CONSOLE_PATTERN = /\bconsole\.(log|warn|error|info|debug)\s*\(/;

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) pass();
if (!hasExtension(filePath, CODE_EXTENSIONS)) pass();
if (isTestFile(filePath)) pass();

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  const hits = [];

  for (let i = 0; i < lines.length; i++) {
    if (CONSOLE_PATTERN.test(lines[i])) {
      hits.push(`  L${i + 1}: ${lines[i].trim()}`);
    }
  }

  if (hits.length > 0) {
    warn(
      `ERNE: Found ${hits.length} console statement(s) in production code:\n` +
      hits.slice(0, 5).join('\n') +
      (hits.length > 5 ? `\n  ... and ${hits.length - 5} more` : '')
    );
  } else {
    pass();
  }
} catch {
  pass();
}
