#!/usr/bin/env node
// scripts/validate-all.js — Validate all ERNE content files
// Checks: frontmatter format, JSON validity, required fields, file counts

'use strict';

const fs = require('fs');
const path = require('path');

let errors = 0;
let warnings = 0;
let checked = 0;

function error(msg) {
  errors++;
  console.error(`  ✗ ${msg}`);
}
function warn(msg) {
  warnings++;
  console.warn(`  ⚠ ${msg}`);
}
function ok(msg) {
  console.log(`  ✓ ${msg}`);
}

// ─── Validate frontmatter in .md files ───
function validateFrontmatter(filePath, requiredFields) {
  checked++;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    error(`${filePath}: Missing frontmatter`);
    return;
  }

  const frontmatter = match[1];
  for (const field of requiredFields) {
    if (!frontmatter.includes(`${field}:`)) {
      error(`${filePath}: Missing required field '${field}'`);
    }
  }
}

// ─── Validate JSON files ───
function validateJson(filePath) {
  checked++;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
  } catch (e) {
    error(`${filePath}: Invalid JSON — ${e.message}`);
  }
}

// ─── Validate directory file counts ───
function validateCount(dir, ext, expected, label) {
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(ext));
  if (files.length !== expected) {
    error(`${label}: Expected ${expected} files, found ${files.length}`);
  } else {
    ok(`${label}: ${files.length} files`);
  }
}

// ─── Main validation ───
console.log('\n  ERNE Content Validation\n');

// Agents
console.log('  Agents:');
validateCount('agents', '.md', 13, 'agents/');
const agentFiles = fs.readdirSync('agents').filter((f) => f.endsWith('.md'));
for (const f of agentFiles) {
  validateFrontmatter(path.join('agents', f), ['name', 'description']);
}

// Commands
console.log('  Commands:');
validateCount('commands', '.md', 24, 'commands/'); // 24 command files
const cmdFiles = fs.readdirSync('commands').filter((f) => f.endsWith('.md'));
for (const f of cmdFiles) {
  validateFrontmatter(path.join('commands', f), ['name', 'description']);
}

// Rules
console.log('  Rules:');
const ruleLayers = ['common', 'expo', 'bare-rn', 'native-ios', 'native-android'];
for (const layer of ruleLayers) {
  const layerDir = path.join('rules', layer);
  if (!fs.existsSync(layerDir)) {
    error(`rules/${layer}/: Missing directory`);
    continue;
  }
  const ruleFiles = fs.readdirSync(layerDir).filter((f) => f.endsWith('.md'));
  ok(`rules/${layer}/: ${ruleFiles.length} files`);
  for (const f of ruleFiles) {
    validateFrontmatter(path.join(layerDir, f), ['description']);
  }
}

// Hook profiles
console.log('  Hooks:');
validateJson('hooks/hooks.json');
for (const profile of ['minimal', 'standard', 'strict']) {
  validateJson(path.join('hooks', 'profiles', `${profile}.json`));
}

// MCP configs
console.log('  MCP Configs:');
const mcpFiles = fs.readdirSync('mcp-configs').filter((f) => f.endsWith('.json'));
ok(`mcp-configs/: ${mcpFiles.length} files`);
for (const f of mcpFiles) {
  validateJson(path.join('mcp-configs', f));
}

// Contexts
console.log('  Contexts:');
validateCount('contexts', '.md', 3, 'contexts/');

// Skills
console.log('  Skills:');
const skillDirs = fs
  .readdirSync('skills', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
ok(`skills/: ${skillDirs.length} skill directories`);
for (const dir of skillDirs) {
  const skillMd = path.join('skills', dir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    error(`skills/${dir}/: Missing SKILL.md`);
  } else {
    checked++;
  }
}

// Schemas
console.log('  Schemas:');
validateJson('schemas/hooks.schema.json');
validateJson('schemas/plugin.schema.json');

// Summary
console.log(`\n  Checked ${checked} files: ${errors} errors, ${warnings} warnings\n`);

if (errors > 0) {
  process.exit(1);
}
