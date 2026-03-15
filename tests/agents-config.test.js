'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { AGENT_ORDER, AGENT_DEFINITIONS } = require('../dashboard/lib/agents-config');

describe('agents-config', () => {
  it('exports AGENT_ORDER as a non-empty array of strings', () => {
    assert.ok(Array.isArray(AGENT_ORDER));
    assert.ok(AGENT_ORDER.length >= 10);
    AGENT_ORDER.forEach(name => assert.strictEqual(typeof name, 'string'));
  });

  it('exports AGENT_DEFINITIONS as array of {name, room} objects', () => {
    assert.ok(Array.isArray(AGENT_DEFINITIONS));
    AGENT_DEFINITIONS.forEach(def => {
      assert.ok(def.name);
      assert.ok(def.room);
    });
  });

  it('AGENT_ORDER includes all agents from AGENT_DEFINITIONS', () => {
    const orderSet = new Set(AGENT_ORDER);
    AGENT_DEFINITIONS.forEach(def => {
      assert.ok(orderSet.has(def.name), `Missing ${def.name} in AGENT_ORDER`);
    });
  });

  it('includes pipeline-orchestrator in AGENT_ORDER', () => {
    assert.ok(AGENT_ORDER.includes('pipeline-orchestrator'));
  });
});
