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

describe('checkStartupTime', () => {
  it('detects heavy top-level imports', () => {
    const { checkStartupTime } = require('../lib/audit');
    const imports = Array.from({ length: 20 }, (_, i) => `import { mod${i} } from 'mod${i}';`).join('\n');
    const dir = createTempProject({
      'App.tsx': imports + '\nexport const App = () => <View />;',
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkStartupTime(dir, findings, strengths);
    const heavy = findings.find(f => f.title.includes('Heavy top-level imports'));
    assert.ok(heavy, 'Should detect heavy imports');
  });

  it('detects React.lazy usage as strength', () => {
    const { checkStartupTime } = require('../lib/audit');
    const dir = createTempProject({
      'App.tsx': "import React from 'react';\nconst Home = React.lazy(() => import('./Home'));\nexport const App = () => <Home />;",
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkStartupTime(dir, findings, strengths);
    const lazyStrength = strengths.find(s => s.title.includes('React.lazy'));
    assert.ok(lazyStrength, 'Should detect React.lazy as strength');
  });

  it('detects expo-splash-screen usage', () => {
    const { checkStartupTime } = require('../lib/audit');
    const dir = createTempProject({
      'app/_layout.tsx': "import * as SplashScreen from 'expo-splash-screen';\nSplashScreen.preventAutoHideAsync();\nexport default function Layout() { return null; }",
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkStartupTime(dir, findings, strengths);
    const splash = strengths.find(s => s.title.includes('expo-splash-screen'));
    assert.ok(splash, 'Should detect splash screen usage');
  });

  it('reports light startup when no issues', () => {
    const { checkStartupTime } = require('../lib/audit');
    const dir = createTempProject({
      'App.tsx': "import React from 'react';\nimport { View } from 'react-native';\nexport const App = () => <View />;",
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkStartupTime(dir, findings, strengths);
    const light = strengths.find(s => s.title.includes('light'));
    assert.ok(light, 'Should report light startup weight');
  });
});

describe('checkPlatformParity', () => {
  it('reports cross-platform when no platform-specific files', () => {
    const { checkPlatformParity } = require('../lib/audit');
    const dir = createTempProject({
      'src/App.tsx': 'export const App = () => null;',
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkPlatformParity(dir, findings, strengths);
    const cross = strengths.find(s => s.title.includes('Cross-platform'));
    assert.ok(cross, 'Should report cross-platform codebase');
  });

  it('detects missing counterpart files', () => {
    const { checkPlatformParity } = require('../lib/audit');
    const dir = createTempProject({
      'src/Button.ios.tsx': 'export const Button = () => null;',
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkPlatformParity(dir, findings, strengths);
    const missing = findings.find(f => f.title.includes('missing counterpart'));
    assert.ok(missing, 'Should detect missing android counterpart');
  });

  it('detects Platform.OS usage', () => {
    const { checkPlatformParity } = require('../lib/audit');
    const dir = createTempProject({
      'src/utils.ts': "import { Platform } from 'react-native';\nconst x = Platform.OS === 'ios' ? 1 : 2;\nconst y = Platform.select({ ios: 1, android: 2 });",
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [];
    const strengths = [];
    checkPlatformParity(dir, findings, strengths);
    const platformUsage = findings.find(f => f.title.includes('Platform.OS'));
    assert.ok(platformUsage, 'Should detect Platform.OS usage');
  });
});

describe('checkLinting', () => {
  it('reports all 4 tools configured', () => {
    const { checkLinting } = require('../lib/audit');
    const dir = createTempProject({
      '.eslintrc.json': '{}',
      '.prettierrc': '{}',
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: true } }),
      'package.json': JSON.stringify({ name: 'test', dependencies: {}, devDependencies: { 'eslint-config-expo': '1.0.0' } }),
    });
    const deps = { 'eslint-config-expo': '1.0.0' };
    const findings = [];
    const strengths = [];
    checkLinting(dir, deps, findings, strengths);
    const configured = strengths.find(s => s.title.includes('4/4'));
    assert.ok(configured, 'Should report 4/4 tools');
  });

  it('reports missing tools', () => {
    const { checkLinting } = require('../lib/audit');
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
    });
    const deps = {};
    const findings = [];
    const strengths = [];
    checkLinting(dir, deps, findings, strengths);
    const missing = findings.find(f => f.title.includes('0/4'));
    assert.ok(missing, 'Should report 0/4 tools');
    assert.equal(missing.severity, 'warning');
  });

  it('detects partial setup', () => {
    const { checkLinting } = require('../lib/audit');
    const dir = createTempProject({
      '.eslintrc.js': 'module.exports = {};',
      'package.json': JSON.stringify({ name: 'test', dependencies: {}, devDependencies: { prettier: '3.0.0' } }),
    });
    const deps = { prettier: '3.0.0' };
    const findings = [];
    const strengths = [];
    checkLinting(dir, deps, findings, strengths);
    const partial = findings.find(f => f.title.includes('2/4'));
    assert.ok(partial, 'Should report 2/4 tools');
  });
});

describe('autoFix', () => {
  it('adds .env to existing .gitignore', async () => {
    const doctor = require('../lib/doctor');
    const dir = createTempProject({
      '.gitignore': 'node_modules/\n',
      '.env': 'SECRET=123',
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
    });
    const findings = [{ title: '.env file not in .gitignore', severity: 'critical' }];
    const fixes = await doctor.autoFix(dir, findings);
    assert.ok(fixes.includes('Added .env to .gitignore'));
    const gitignore = fs.readFileSync(path.join(dir, '.gitignore'), 'utf8');
    assert.ok(gitignore.includes('.env'));
  });

  it('creates .gitignore if missing', async () => {
    const doctor = require('../lib/doctor');
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
    });
    const findings = [{ title: '.env file not in .gitignore', severity: 'critical' }];
    const fixes = await doctor.autoFix(dir, findings);
    assert.ok(fixes.includes('Added .env to .gitignore'));
    assert.ok(fs.existsSync(path.join(dir, '.gitignore')));
  });

  it('enables TypeScript strict mode', async () => {
    const doctor = require('../lib/doctor');
    const dir = createTempProject({
      'tsconfig.json': JSON.stringify({ compilerOptions: { strict: false } }),
      'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
    });
    const findings = [{ title: 'TypeScript strict mode not enabled', severity: 'info' }];
    const fixes = await doctor.autoFix(dir, findings);
    assert.ok(fixes.includes('Enabled TypeScript strict mode'));
    const tsconfig = JSON.parse(fs.readFileSync(path.join(dir, 'tsconfig.json'), 'utf8'));
    assert.equal(tsconfig.compilerOptions.strict, true);
  });

  it('returns empty when no fixes needed', async () => {
    const doctor = require('../lib/doctor');
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', dependencies: {} }),
    });
    const fixes = await doctor.autoFix(dir, []);
    assert.equal(fixes.length, 0);
  });

  it('runs via CLI with --fix flag', () => {
    const dir = createTempProject({
      'package.json': JSON.stringify({ name: 'test', dependencies: { 'react-native': '0.76.0' } }),
      '.env': 'SECRET=abc',
      '.gitignore': 'node_modules/\n',
    });
    const output = execSync(`node ${CLI_PATH} doctor --fix`, { encoding: 'utf8', cwd: dir });
    assert.ok(output.includes('Auto-fixes Applied'));
  });
});
