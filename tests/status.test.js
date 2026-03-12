// tests/status.test.js — Tests for erne status command
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-status-'));
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

describe('status command', () => {
  it('module exports a function', () => {
    const status = require('../lib/status');
    assert.equal(typeof status, 'function');
  });

  it('runs via CLI without error', () => {
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: os.tmpdir() });
    assert.ok(output.includes('ERNE Status'));
  });

  it('shows version from package.json', () => {
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: os.tmpdir() });
    assert.match(output, /ERNE Status — v\d+\.\d+\.\d+/);
  });

  it('shows stack detection for expo project', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({
        dependencies: {
          expo: '~52.0.0',
          'react-native': '0.76.0',
          'expo-router': '~4.0.0',
          zustand: '^5.0.0',
          nativewind: '^4.0.0',
        },
      }),
      'tsconfig.json': JSON.stringify({ compilerOptions: {} }),
    });
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Stack Detection:'));
    assert.ok(output.includes('Framework:'));
    assert.ok(output.includes('expo-managed'));
    assert.ok(output.includes('expo-router'));
    assert.ok(output.includes('zustand'));
    assert.ok(output.includes('nativewind'));
    assert.ok(output.includes('TypeScript:   yes'));
  });

  it('shows unknown framework for non-RN project', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ dependencies: { express: '4.0.0' } }),
    });
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Framework:    unknown'));
  });

  it('shows hook profile as not set when no config', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.76.0' } }),
    });
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Hook Profile: not set'));
  });

  it('shows hook profile from CLAUDE.md comment', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.76.0' } }),
      'CLAUDE.md': '# ERNE\n<!-- erne-profile: standard -->',
    });
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Hook Profile: standard'));
  });

  it('shows active variants when agent files exist', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.76.0' } }),
      '.claude/agents/architect.md': '# Architect\n<!-- variant: zustand -->',
      '.claude/agents/ui-designer.md': '# UI Designer\nUses NativeWind for styling',
    });
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Active Variants:'));
    assert.ok(output.includes('architect'));
    assert.ok(output.includes('zustand'));
    assert.ok(output.includes('ui-designer'));
    assert.ok(output.includes('nativewind'));
  });

  it('shows no variants for empty .claude directory', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ dependencies: { 'react-native': '0.76.0' } }),
      '.claude/.gitkeep': '',
    });
    const output = execSync(`node ${CLI_PATH} status`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Active Variants: none'));
  });
});
