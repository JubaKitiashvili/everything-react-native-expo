// tests/generate.test.js — Tests for variant selection and config generation
'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { selectVariant, VARIANT_MAP, determineRuleLayers, generateConfig } = require('../lib/generate');

// ─── VARIANT_MAP structure ─────────────────────────────────────────────────────

describe('VARIANT_MAP', () => {
  it('has all 10 expected target entries', () => {
    const keys = Object.keys(VARIANT_MAP);
    assert.equal(keys.length, 10);
    assert.ok(keys.includes('rules/common/state-management.md'));
    assert.ok(keys.includes('rules/common/navigation.md'));
    assert.ok(keys.includes('rules/common/performance.md'));
    assert.ok(keys.includes('rules/common/coding-style.md'));
    assert.ok(keys.includes('rules/common/security.md'));
    assert.ok(keys.includes('rules/common/styling.md'));
    assert.ok(keys.includes('agents/ui-designer.md'));
    assert.ok(keys.includes('agents/architect.md'));
    assert.ok(keys.includes('agents/senior-developer.md'));
    assert.ok(keys.includes('agents/feature-builder.md'));
  });
});

// ─── selectVariant ─────────────────────────────────────────────────────────────

describe('selectVariant', () => {
  it('zustand+tanstack-query → state-management/zustand-tanstack.md', () => {
    const detection = { stack: { state: 'zustand', serverState: 'tanstack-query' } };
    const result = selectVariant('rules/common/state-management.md', detection);
    assert.equal(result, 'state-management/zustand-tanstack.md');
  });

  it('redux-saga+none → state-management/redux-saga.md', () => {
    const detection = { stack: { state: 'redux-saga', serverState: 'none' } };
    const result = selectVariant('rules/common/state-management.md', detection);
    assert.equal(result, 'state-management/redux-saga.md');
  });

  it('unknown combo falls back to default', () => {
    const detection = { stack: { state: 'mobx', serverState: 'apollo' } };
    const result = selectVariant('rules/common/state-management.md', detection);
    assert.equal(result, 'state-management/zustand-tanstack.md');
  });

  it('expo-router → navigation/expo-router.md', () => {
    const detection = { stack: { navigation: 'expo-router' } };
    const result = selectVariant('rules/common/navigation.md', detection);
    assert.equal(result, 'navigation/expo-router.md');
  });

  it('react-navigation → navigation/react-navigation.md', () => {
    const detection = { stack: { navigation: 'react-navigation' } };
    const result = selectVariant('rules/common/navigation.md', detection);
    assert.equal(result, 'navigation/react-navigation.md');
  });

  it('flashlist+expo-image → performance/modern.md', () => {
    const detection = { stack: { lists: 'flashlist', images: 'expo-image' } };
    const result = selectVariant('rules/common/performance.md', detection);
    assert.equal(result, 'performance/modern.md');
  });

  it('flatlist+rn-image → performance/legacy.md', () => {
    const detection = { stack: { lists: 'flatlist', images: 'rn-image' } };
    const result = selectVariant('rules/common/performance.md', detection);
    assert.equal(result, 'performance/legacy.md');
  });

  it('nativewind → ui-designer/nativewind.md', () => {
    const detection = { stack: { styling: 'nativewind' } };
    const result = selectVariant('agents/ui-designer.md', detection);
    assert.equal(result, 'ui-designer/nativewind.md');
  });

  it('monorepo architect → architect/monorepo.md', () => {
    const detection = { stack: { state: 'zustand' }, hasMonorepo: true };
    const result = selectVariant('agents/architect.md', detection);
    assert.equal(result, 'architect/monorepo.md');
  });

  it('stylesheet → ui-designer/stylesheet.md', () => {
    const detection = { stack: { styling: 'stylesheet' } };
    const result = selectVariant('agents/ui-designer.md', detection);
    assert.equal(result, 'ui-designer/stylesheet.md');
  });

  it('unmapped target returns null', () => {
    const detection = { stack: {} };
    const result = selectVariant('nonexistent/path.md', detection);
    assert.equal(result, null);
  });
});

// ─── determineRuleLayers ───────────────────────────────────────────────────────

describe('determineRuleLayers', () => {
  it('expo-managed gets common + expo', () => {
    const layers = determineRuleLayers({ framework: 'expo-managed' });
    assert.deepEqual(layers, ['common', 'expo']);
  });

  it('expo-bare gets common + expo + bare-rn', () => {
    const layers = determineRuleLayers({ framework: 'expo-bare' });
    assert.deepEqual(layers, ['common', 'expo', 'bare-rn']);
  });

  it('bare-rn gets common + bare-rn', () => {
    const layers = determineRuleLayers({ framework: 'bare-rn' });
    assert.deepEqual(layers, ['common', 'bare-rn']);
  });

  it('unknown framework gets only common', () => {
    const layers = determineRuleLayers({ framework: 'unknown' });
    assert.deepEqual(layers, ['common']);
  });
});

// ─── generateConfig integration — variant file copying ────────────────────────

describe('generateConfig — variant file copying', () => {
  let tmpDir;
  const erneRoot = path.resolve(__dirname, '..');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-gen-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('copies zustand rule variant over base state-management.md', () => {
    const detection = {
      framework: 'expo-managed',
      stack: { state: 'zustand', serverState: 'tanstack-query', navigation: 'expo-router', lists: 'flashlist', images: 'expo-image', styling: 'nativewind', storage: 'expo-secure-store' },
      componentStyle: 'functional',
      hasMonorepo: false,
    };
    generateConfig(erneRoot, tmpDir, detection, 'minimal', []);

    const dest = path.join(tmpDir, 'rules', 'common', 'state-management.md');
    assert.ok(fs.existsSync(dest), 'state-management.md should exist');

    const content = fs.readFileSync(dest, 'utf8');
    const variantContent = fs.readFileSync(path.join(erneRoot, 'rules', 'variants', 'state-management', 'zustand-tanstack.md'), 'utf8');
    assert.equal(content, variantContent, 'should be the zustand-tanstack variant, not generic');
  });

  it('copies nativewind agent variant over base ui-designer.md', () => {
    const detection = {
      framework: 'expo-managed',
      stack: { state: 'zustand', serverState: 'none', navigation: 'expo-router', lists: 'flashlist', images: 'expo-image', styling: 'nativewind', storage: 'expo-secure-store' },
      componentStyle: 'functional',
      hasMonorepo: false,
    };
    generateConfig(erneRoot, tmpDir, detection, 'minimal', []);

    const dest = path.join(tmpDir, 'agents', 'ui-designer.md');
    assert.ok(fs.existsSync(dest), 'ui-designer.md should exist');

    const content = fs.readFileSync(dest, 'utf8');
    const variantContent = fs.readFileSync(path.join(erneRoot, 'agents', 'variants', 'ui-designer', 'nativewind.md'), 'utf8');
    assert.equal(content, variantContent, 'should be the nativewind variant, not generic');
  });

  it('copies monorepo architect variant when hasMonorepo is true', () => {
    const detection = {
      framework: 'expo-managed',
      stack: { state: 'zustand', serverState: 'none', navigation: 'expo-router', lists: 'flatlist', images: 'rn-image', styling: 'stylesheet', storage: 'async-storage' },
      componentStyle: 'functional',
      hasMonorepo: true,
    };
    generateConfig(erneRoot, tmpDir, detection, 'minimal', []);

    const dest = path.join(tmpDir, 'agents', 'architect.md');
    const content = fs.readFileSync(dest, 'utf8');
    const variantContent = fs.readFileSync(path.join(erneRoot, 'agents', 'variants', 'architect', 'monorepo.md'), 'utf8');
    assert.equal(content, variantContent, 'should be the monorepo variant');
  });

  it('copies expo-router navigation variant', () => {
    const detection = {
      framework: 'expo-managed',
      stack: { state: 'zustand', serverState: 'none', navigation: 'expo-router', lists: 'flatlist', images: 'rn-image', styling: 'stylesheet', storage: 'async-storage' },
      componentStyle: 'functional',
      hasMonorepo: false,
    };
    generateConfig(erneRoot, tmpDir, detection, 'minimal', []);

    const dest = path.join(tmpDir, 'rules', 'common', 'navigation.md');
    const content = fs.readFileSync(dest, 'utf8');
    const variantContent = fs.readFileSync(path.join(erneRoot, 'rules', 'variants', 'navigation', 'expo-router.md'), 'utf8');
    assert.equal(content, variantContent, 'should be the expo-router variant');
  });

  it('generates all expected directories', () => {
    const detection = {
      framework: 'expo-managed',
      stack: { state: 'zustand', serverState: 'none', navigation: 'expo-router', lists: 'flatlist', images: 'rn-image', styling: 'stylesheet', storage: 'async-storage' },
      componentStyle: 'functional',
      hasMonorepo: false,
    };
    generateConfig(erneRoot, tmpDir, detection, 'standard', ['agent-device']);

    assert.ok(fs.existsSync(path.join(tmpDir, 'agents')), 'agents/ should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'rules', 'common')), 'rules/common/ should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'rules', 'expo')), 'rules/expo/ should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'contexts')), 'contexts/ should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills')), 'skills/ should exist');
    // Commands are installed as skills: skills/{name}/SKILL.md
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills', 'perf', 'SKILL.md')), 'skills/perf/SKILL.md should exist');
    assert.ok(fs.existsSync(path.join(tmpDir, 'skills', 'plan', 'SKILL.md')), 'skills/plan/SKILL.md should exist');
    assert.ok(!fs.existsSync(path.join(tmpDir, 'commands')), 'commands/ should NOT exist');
  });
});
