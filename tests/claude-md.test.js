// tests/claude-md.test.js — Tests for CLAUDE.md generation/merging
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  handleClaudeMd,
  getProjectName,
  formatStateLabel,
  formatLabel,
  generateKeyRules,
  ERNE_MARKER,
} = require('../lib/claude-md');

const tempDirs = [];

function createTempProject(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-claudemd-'));
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

const mockDetection = {
  isRNProject: true,
  framework: 'expo-managed',
  stack: {
    state: 'zustand', serverState: 'tanstack-query',
    navigation: 'expo-router', styling: 'stylesheet',
    lists: 'flashlist', images: 'expo-image',
    forms: 'react-hook-form', storage: 'expo-secure-store',
    testing: 'jest-rntl', build: 'eas',
  },
  hasMonorepo: false, hasNewArch: true, hasTypescript: true,
  existingClaudeMd: false, componentStyle: 'functional',
};

const mockRuleLayers = ['common', 'expo'];

// ─── Scenario A: No existing CLAUDE.md ───

describe('Scenario A — No existing CLAUDE.md', () => {
  it('generates new CLAUDE.md with ERNE marker on line 1', () => {
    const dir = createTempProject({
      'package.json': { name: 'my-app' },
    });

    const result = handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    assert.equal(result, 'generated');
    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.startsWith(ERNE_MARKER), 'Should start with ERNE marker');
  });

  it('includes project name from package.json', () => {
    const dir = createTempProject({
      'package.json': { name: 'my-cool-app' },
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('my-cool-app'), 'Should include project name');
  });

  it('includes detected stack info', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('React Native with Expo (managed)'), 'Should include framework');
    assert.ok(content.includes('TypeScript'), 'Should include language');
    assert.ok(content.includes('Expo Router (file-based)'), 'Should include navigation');
    assert.ok(content.includes('Zustand (client) + TanStack Query (server)'), 'Should include state');
    assert.ok(content.includes('StyleSheet.create'), 'Should include styling');
    assert.ok(content.includes('FlashList'), 'Should include lists');
    assert.ok(content.includes('expo-image'), 'Should include images');
    assert.ok(content.includes('Jest + React Native Testing Library'), 'Should include testing');
    assert.ok(content.includes('EAS Build'), 'Should include build');
  });

  it('includes rule @import directives', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('@import .claude/rules/common/'), 'Should import common rules');
    assert.ok(content.includes('@import .claude/rules/expo/'), 'Should import expo rules');
    assert.ok(content.includes('@import .claude/skills/'), 'Should import skills');
  });

  it('includes available commands', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('/plan'), 'Should include /plan command');
    assert.ok(content.includes('/code-review'), 'Should include /code-review command');
    assert.ok(content.includes('/tdd'), 'Should include /tdd command');
  });

  it('includes key rules based on detection', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('Functional components only'), 'Should include component style rule');
    assert.ok(content.includes('Named exports only'), 'Should include export rule');
    assert.ok(content.includes('Zustand stores'), 'Should include state rule');
    assert.ok(content.includes('FlashList over FlatList'), 'Should include list rule');
    assert.ok(content.includes('Conventional Commits'), 'Should include git rule');
  });

  it('returns "generated"', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
    });

    const result = handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);
    assert.equal(result, 'generated');
  });
});

// ─── Scenario B: Existing non-ERNE CLAUDE.md ───

describe('Scenario B — Existing non-ERNE CLAUDE.md', () => {
  it('preserves original content and appends ERNE section', () => {
    const originalContent = '# My Project\n\nCustom instructions here.\n';
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': originalContent,
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.startsWith('# My Project'), 'Should preserve original start');
    assert.ok(content.includes('Custom instructions here.'), 'Should preserve original content');
    assert.ok(content.includes('---'), 'Should include separator');
    assert.ok(content.includes('# ERNE Configuration (auto-generated)'), 'Should include ERNE header');
  });

  it('creates backup at CLAUDE.md.pre-erne', () => {
    const originalContent = '# My Project\n\nOriginal content.\n';
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': originalContent,
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const backupPath = path.join(dir, 'CLAUDE.md.pre-erne');
    assert.ok(fs.existsSync(backupPath), 'Backup should exist');
    const backup = fs.readFileSync(backupPath, 'utf8');
    assert.equal(backup, originalContent, 'Backup should match original');
  });

  it('includes rule imports in appended section', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': '# Existing\n',
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.includes('@import .claude/rules/common/'), 'Should import common rules');
    assert.ok(content.includes('@import .claude/rules/expo/'), 'Should import expo rules');
    assert.ok(content.includes('@import .claude/skills/'), 'Should import skills');
  });

  it('returns "appended"', () => {
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': '# Existing\n',
    });

    const result = handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);
    assert.equal(result, 'appended');
  });
});

// ─── Scenario C: Existing ERNE-generated CLAUDE.md ───

describe('Scenario C — Existing ERNE-generated CLAUDE.md', () => {
  it('regenerates fully with ERNE marker', () => {
    const erneContent = `${ERNE_MARKER}\n# old-app — ERNE Configuration\n\nOld content.\n`;
    const dir = createTempProject({
      'package.json': { name: 'new-app' },
      'CLAUDE.md': erneContent,
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const content = fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8');
    assert.ok(content.startsWith(ERNE_MARKER), 'Should start with marker');
    assert.ok(content.includes('new-app'), 'Should use new project name');
    assert.ok(!content.includes('Old content.'), 'Should not contain old content');
  });

  it('does NOT create a backup file', () => {
    const erneContent = `${ERNE_MARKER}\n# old-app — ERNE Configuration\n`;
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': erneContent,
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    assert.ok(!fs.existsSync(path.join(dir, 'CLAUDE.md.pre-erne')), 'No backup for ERNE-generated');
  });

  it('returns "regenerated"', () => {
    const erneContent = `${ERNE_MARKER}\n# old — ERNE Configuration\n`;
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': erneContent,
    });

    const result = handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);
    assert.equal(result, 'regenerated');
  });
});

// ─── Backup protection ───

describe('Backup protection', () => {
  it('does not overwrite existing backup file', () => {
    const originalBackup = 'This is the original backup content.';
    const dir = createTempProject({
      'package.json': { name: 'test-app' },
      'CLAUDE.md': '# Second version\n',
      'CLAUDE.md.pre-erne': originalBackup,
    });

    handleClaudeMd(dir, mockDetection, 'standard', mockRuleLayers);

    const backup = fs.readFileSync(path.join(dir, 'CLAUDE.md.pre-erne'), 'utf8');
    assert.equal(backup, originalBackup, 'Original backup must be preserved');
  });
});

// ─── Helper functions ───

describe('getProjectName', () => {
  it('reads name from package.json', () => {
    const dir = createTempProject({
      'package.json': { name: 'my-awesome-app' },
    });
    assert.equal(getProjectName(dir), 'my-awesome-app');
  });

  it('falls back to directory basename', () => {
    const dir = createTempProject({});
    assert.equal(getProjectName(dir), path.basename(dir));
  });

  it('falls back when package.json has no name field', () => {
    const dir = createTempProject({
      'package.json': { version: '1.0.0' },
    });
    assert.equal(getProjectName(dir), path.basename(dir));
  });
});

describe('formatStateLabel', () => {
  it('formats both client and server state', () => {
    const label = formatStateLabel('zustand', 'tanstack-query');
    assert.equal(label, 'Zustand (client) + TanStack Query (server)');
  });

  it('formats client-only state', () => {
    const label = formatStateLabel('zustand', 'none');
    assert.equal(label, 'Zustand (client)');
  });

  it('formats server-only state', () => {
    const label = formatStateLabel('none', 'tanstack-query');
    assert.equal(label, 'TanStack Query (server)');
  });

  it('returns None when both are none', () => {
    assert.equal(formatStateLabel('none', 'none'), 'None');
  });
});

describe('formatLabel', () => {
  it('returns mapped label for known value', () => {
    assert.equal(formatLabel('expo-managed', { 'expo-managed': 'Expo Managed' }), 'Expo Managed');
  });

  it('returns raw value if not in map', () => {
    assert.equal(formatLabel('custom-thing', {}), 'custom-thing');
  });
});

describe('generateKeyRules', () => {
  it('includes functional component rule', () => {
    const rules = generateKeyRules(mockDetection);
    assert.ok(rules.some(r => r.includes('Functional components')));
  });

  it('includes class component rule for class style', () => {
    const classDetection = { ...mockDetection, componentStyle: 'class' };
    const rules = generateKeyRules(classDetection);
    assert.ok(rules.some(r => r.includes('Class components')));
  });

  it('includes mixed component rule', () => {
    const mixedDetection = { ...mockDetection, componentStyle: 'mixed' };
    const rules = generateKeyRules(mixedDetection);
    assert.ok(rules.some(r => r.includes('Migrating to functional')));
  });

  it('includes zustand-specific rule', () => {
    const rules = generateKeyRules(mockDetection);
    assert.ok(rules.some(r => r.includes('Zustand stores')));
  });

  it('includes flashlist rule', () => {
    const rules = generateKeyRules(mockDetection);
    assert.ok(rules.some(r => r.includes('FlashList over FlatList')));
  });

  it('omits flashlist rule when using flatlist', () => {
    const det = {
      ...mockDetection,
      stack: { ...mockDetection.stack, lists: 'flatlist' },
    };
    const rules = generateKeyRules(det);
    assert.ok(!rules.some(r => r.includes('FlashList')));
  });

  it('includes conventional commits rule', () => {
    const rules = generateKeyRules(mockDetection);
    assert.ok(rules.some(r => r.includes('Conventional Commits')));
  });

  it('includes expo-secure-store rule', () => {
    const rules = generateKeyRules(mockDetection);
    assert.ok(rules.some(r => r.includes('expo-secure-store')));
  });
});
