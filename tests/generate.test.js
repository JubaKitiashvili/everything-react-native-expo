// tests/generate.test.js — Tests for variant selection and config generation
'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { selectVariant, VARIANT_MAP, determineRuleLayers } = require('../lib/generate');

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
