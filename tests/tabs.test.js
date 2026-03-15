// tests/tabs.test.js
'use strict';
const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

describe('Tab state machine', () => {
  let state;

  beforeEach(() => {
    state = { active: 'hq', tabs: {}, initialized: new Set() };
  });

  function registerTab(name, mod) { state.tabs[name] = mod; }

  function switchTo(name) {
    if (!state.tabs[name] && name !== 'hq') return false;
    if (name === state.active) return false;
    const prev = state.active;
    state.active = name;
    if (!state.initialized.has(name) && state.tabs[name]) {
      state.tabs[name].init();
      state.initialized.add(name);
    }
    if (state.tabs[name]) state.tabs[name].activate();
    if (prev !== 'hq' && state.tabs[prev]) state.tabs[prev].deactivate();
    return true;
  }

  it('starts on HQ tab', () => { assert.strictEqual(state.active, 'hq'); });
  it('switches to registered tab', () => {
    const calls = [];
    registerTab('ecosystem', { init: () => calls.push('init'), activate: () => calls.push('activate'), deactivate: () => calls.push('deactivate') });
    assert.ok(switchTo('ecosystem'));
    assert.strictEqual(state.active, 'ecosystem');
    assert.deepStrictEqual(calls, ['init', 'activate']);
  });
  it('does not re-init on second activation', () => {
    const calls = [];
    registerTab('ecosystem', { init: () => calls.push('init'), activate: () => calls.push('activate'), deactivate: () => calls.push('deactivate') });
    switchTo('ecosystem'); switchTo('hq'); calls.length = 0;
    switchTo('ecosystem');
    assert.deepStrictEqual(calls, ['activate']);
  });
  it('rejects switch to unregistered tab', () => { assert.strictEqual(switchTo('nonexistent'), false); });
  it('rejects switch to already-active tab', () => { assert.strictEqual(switchTo('hq'), false); });
  it('calls deactivate on previous non-HQ tab', () => {
    const calls = [];
    registerTab('ecosystem', { init: () => {}, activate: () => {}, deactivate: () => calls.push('eco-deactivate') });
    registerTab('upgrades', { init: () => {}, activate: () => {}, deactivate: () => {} });
    switchTo('ecosystem'); switchTo('upgrades');
    assert.deepStrictEqual(calls, ['eco-deactivate']);
  });
});
