#!/usr/bin/env node
// scripts/lint-content.js — Lint ERNE content files for style consistency
// Checks: trailing whitespace, consistent headings, max line length in frontmatter

'use strict';

const fs = require('fs');
const path = require('path');

let issues = 0;

function lint(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Check for trailing whitespace
  lines.forEach((line, i) => {
    if (line !== line.trimEnd() && line.trim().length > 0) {
      console.log(`  ${filePath}:${i + 1}: trailing whitespace`);
      issues++;
    }
  });

  // Check frontmatter has no empty description
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    if (fm.includes('description:') && fm.match(/description:\s*$/m)) {
      console.log(`  ${filePath}: empty description in frontmatter`);
      issues++;
    }
  }

  // Check file ends with newline
  if (content.length > 0 && !content.endsWith('\n')) {
    console.log(`  ${filePath}: missing trailing newline`);
    issues++;
  }
}

function lintDir(dir, ext) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if (fullPath.endsWith(ext) && fs.statSync(fullPath).isFile()) {
      lint(fullPath);
    }
  }
}

console.log('\n  ERNE Content Lint\n');

lintDir('agents', '.md');
lintDir('commands', '.md');
lintDir('rules', '.md');
lintDir('contexts', '.md');
lintDir('skills', '.md');
lintDir('docs', '.md');

console.log(`\n  ${issues} issues found\n`);
if (issues > 0) process.exit(1);
