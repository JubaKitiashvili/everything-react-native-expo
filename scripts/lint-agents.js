#!/usr/bin/env node
// scripts/lint-agents.js — Validate agent markdown files have correct structure
// Checks: YAML frontmatter fields, required sections
// Usage: node scripts/lint-agents.js [--fix]

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const FIX_MODE = process.argv.includes('--fix');

const REQUIRED_FRONTMATTER = ['name', 'emoji', 'vibe', 'description'];
const REQUIRED_SECTIONS = [
  'Identity & Personality',
  'Communication Style',
  'Success Metrics',
  'Memory Integration',
];

let totalErrors = 0;
let totalFiles = 0;
let fixedCount = 0;

function parseFrontmatter(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx > 0) {
      const key = line.slice(0, colonIdx).trim();
      const value = line.slice(colonIdx + 1).trim();
      fields[key] = value;
    }
  }
  return fields;
}

function findSections(content) {
  const headingPattern = /^## (.+)$/gm;
  const sections = [];
  let match;
  while ((match = headingPattern.exec(content)) !== null) {
    sections.push(match[1].trim());
  }
  return sections;
}

function lintAgent(filePath) {
  const relPath = path.relative(ROOT, filePath);
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = [];

  // --- Frontmatter validation ---
  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) {
    errors.push('missing YAML frontmatter (--- delimiters)');
  } else {
    for (const field of REQUIRED_FRONTMATTER) {
      if (!frontmatter[field] || frontmatter[field].length === 0) {
        errors.push(`frontmatter missing required field: ${field}`);
      }
    }
  }

  // --- Section validation ---
  const sections = findSections(content);
  const missingSections = [];
  for (const required of REQUIRED_SECTIONS) {
    if (!sections.includes(required)) {
      missingSections.push(required);
      errors.push(`missing required section: ## ${required}`);
    }
  }

  // --- Fix mode: append missing sections ---
  if (FIX_MODE && missingSections.length > 0) {
    let patched = content.trimEnd() + '\n';
    for (const section of missingSections) {
      patched += `\n## ${section}\n\n<!-- TODO: Fill in this section -->\n`;
      fixedCount++;
    }
    fs.writeFileSync(filePath, patched, 'utf8');
  }

  // --- Report ---
  if (errors.length > 0) {
    console.log(`\n  ${relPath}`);
    for (const err of errors) {
      console.log(`    - ${err}`);
    }
    totalErrors += errors.length;
  }

  totalFiles++;
}

function collectFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;
  const entries = fs.readdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, String(entry));
    if (fullPath.endsWith('.md') && fs.statSync(fullPath).isFile()) {
      files.push(fullPath);
    }
  }
  return files;
}

// --- Main ---
console.log('\n  ERNE Agent Lint\n');

const agentFiles = [
  ...collectFiles(path.join(ROOT, 'agents')),
];

if (agentFiles.length === 0) {
  console.log('  No agent files found.\n');
  process.exit(0);
}

for (const file of agentFiles) {
  lintAgent(file);
}

console.log(`\n  ${totalFiles} agent files scanned`);
console.log(`  ${totalErrors} errors found`);
if (FIX_MODE && fixedCount > 0) {
  console.log(`  ${fixedCount} missing sections added as TODOs`);
}
console.log();

if (totalErrors > 0 && !FIX_MODE) {
  process.exit(1);
}
