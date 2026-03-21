'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { routeTicketToAgent } = require('../../worker/agent-router');

describe('agent-router', () => {
  it('perf keywords route to performance-profiler', () => {
    const ticket = { title: 'App is slow on Android', description: 'There is a memory leak causing jank and lag on scroll' };
    assert.strictEqual(routeTicketToAgent(ticket), 'performance-profiler');
  });

  it('build error keywords route to expo-config-resolver', () => {
    const ticket = { title: 'EAS build failed', description: 'Metro bundler crash after pod install, module not found error' };
    assert.strictEqual(routeTicketToAgent(ticket), 'expo-config-resolver');
  });

  it('"native module" routes to native-bridge-builder', () => {
    const ticket = { title: 'Create native module for camera', description: 'Need a turbo module with Swift implementation using JSI bridge' };
    assert.strictEqual(routeTicketToAgent(ticket), 'native-bridge-builder');
  });

  it('"write tests" routes to tdd-guide', () => {
    const ticket = { title: 'Write unit test for auth hook', description: 'Need jest coverage for the useAuth hook with mock fixtures' };
    assert.strictEqual(routeTicketToAgent(ticket), 'tdd-guide');
  });

  it('"review" routes to code-reviewer', () => {
    const ticket = { title: 'Review login module', description: 'Code review needed for tech debt and refactor opportunities, check quality' };
    assert.strictEqual(routeTicketToAgent(ticket), 'code-reviewer');
  });

  it('unknown ticket falls back to feature-builder', () => {
    const ticket = { title: 'Something random', description: 'No keywords that match any agent at all here' };
    assert.strictEqual(routeTicketToAgent(ticket), 'feature-builder');
  });

  it('manual mode: config.routing.agent is not yet implemented, falls back normally', () => {
    const ticket = { title: 'Random task', description: 'Nothing specific here' };
    const config = { routing: { agent: 'architect' } };
    // Config param is reserved but unused — still falls back to feature-builder
    assert.strictEqual(routeTicketToAgent(ticket, null, config), 'feature-builder');
  });
});
