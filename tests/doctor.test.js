// tests/doctor.test.js — Tests for erne doctor command
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');
const tempDirs = [];

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-doctor-'));
  tempDirs.push(dir);
  for (const [filePath, content] of Object.entries(files)) {
    const full = path.join(dir, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, typeof content === 'string' ? content : JSON.stringify(content));
  }
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

describe('doctor command', () => {
  it('module exports a function', () => {
    const doctor = require('../lib/doctor');
    assert.equal(typeof doctor, 'function');
  });

  it('runs via CLI without error', () => {
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: os.tmpdir() });
    assert.ok(output.includes('ERNE Doctor'));
    assert.ok(output.includes('checks passed'));
  });

  it('reports all checks passing for valid setup', () => {
    const dir = createTempProject({
      'CLAUDE.md': '# ERNE Project\n<!-- erne-profile: standard -->',
      '.claude/settings.json': JSON.stringify({ mcpSelections: ['github'] }),
      '.claude/hooks.json': JSON.stringify({ hooks: [{ event: 'Stop', profiles: ['standard'] }] }),
      'package.json': JSON.stringify({ dependencies: { expo: '52.0.0', 'react-native': '0.76.0' } }),
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
      'node_modules/.package-lock.json': '{}',
    });
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('CLAUDE.md found (ERNE-configured)'));
    assert.ok(output.includes('.claude/settings.json found'));
    assert.ok(output.includes('TypeScript configured'));
    assert.ok(output.includes('node_modules present'));
    assert.ok(output.includes('MCP servers: github'));
    assert.ok(output.includes('package.json found'));
  });

  it('reports failures for empty directory', () => {
    const dir = createTempProject({});
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('CLAUDE.md not found'));
    assert.ok(output.includes('package.json not found'));
    assert.ok(output.includes('node_modules not found'));
    assert.ok(output.includes('checks passed'));
  });

  it('detects non-ERNE CLAUDE.md', () => {
    const dir = createTempProject({
      'CLAUDE.md': '# My project instructions\nNo ERNE here.',
    });
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('CLAUDE.md found'));
  });

  it('detects missing MCP servers', () => {
    const dir = createTempProject({
      '.claude/settings.json': JSON.stringify({ mcpSelections: [] }),
    });
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('MCP servers: none configured'));
  });

  it('detects invalid hooks.json', () => {
    const dir = createTempProject({
      '.claude/hooks.json': 'not valid json {{{',
    });
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('invalid JSON'));
  });

  it('shows hook profile from CLAUDE.md comment', () => {
    const dir = createTempProject({
      'CLAUDE.md': '# ERNE\n<!-- erne-profile: strict -->',
    });
    const output = execSync(`node ${CLI_PATH} doctor`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Hook profile: strict'));
  });
});
