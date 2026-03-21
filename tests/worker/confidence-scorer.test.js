'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calculateConfidence } = require('../../worker/confidence-scorer');

describe('confidence-scorer', () => {
  it('good ticket scores high (80+)', () => {
    const ticket = {
      title: 'Add loading spinner to profile screen',
      description: 'When the profile data is loading, show a spinner component. The file is src/screens/ProfileScreen.tsx and it currently shows a blank screen.',
    };
    const context = {
      affectedFiles: ['src/screens/ProfileScreen.tsx'],
      knownFiles: ['src/screens/ProfileScreen.tsx'],
    };
    const result = calculateConfidence(ticket, null, context);
    assert.ok(result.score >= 80, `Expected score >= 80, got ${result.score}`);
    assert.strictEqual(result.level, 'high');
  });

  it('vague ticket scores low', () => {
    const ticket = {
      title: 'Fix stuff',
      description: 'Fix it',
    };
    const context = { affectedFiles: [], knownFiles: [] };
    const result = calculateConfidence(ticket, null, context);
    assert.ok(result.score < 80, `Expected score < 80, got ${result.score}`);
  });

  it('complex labels reduce score', () => {
    const ticketWithout = {
      title: 'Refactor auth module',
      description: 'Refactor the authentication module to use the new API endpoints and improve error handling throughout.',
      labels: [],
    };
    const ticketWith = {
      ...ticketWithout,
      labels: ['architecture', 'breaking'],
    };
    const context = { affectedFiles: [], knownFiles: [] };
    const scoreWithout = calculateConfidence(ticketWithout, null, context).score;
    const scoreWith = calculateConfidence(ticketWith, null, context).score;
    assert.ok(scoreWith < scoreWithout, `Complex labels should reduce score: ${scoreWith} vs ${scoreWithout}`);
  });

  it('known files boost score', () => {
    const ticket = {
      title: 'Update button styles',
      description: 'Change the primary button color in src/components/Button.tsx to match the new design.',
    };
    const contextUnknown = {
      affectedFiles: ['src/components/Button.tsx'],
      knownFiles: [],
    };
    const contextKnown = {
      affectedFiles: ['src/components/Button.tsx'],
      knownFiles: ['src/components/Button.tsx'],
    };
    const scoreUnknown = calculateConfidence(ticket, null, contextUnknown).score;
    const scoreKnown = calculateConfidence(ticket, null, contextKnown).score;
    assert.ok(scoreKnown > scoreUnknown, `Known files should boost score: ${scoreKnown} vs ${scoreUnknown}`);
  });

  it('factors array contains explanations', () => {
    const ticket = {
      title: 'Fix thing',
      description: 'Short',
      labels: ['migration'],
    };
    const context = { affectedFiles: [], knownFiles: [] };
    const result = calculateConfidence(ticket, null, context);
    assert.ok(Array.isArray(result.factors));
    assert.ok(result.factors.length > 0);
    for (const f of result.factors) {
      assert.ok(typeof f.factor === 'string');
      assert.ok(typeof f.impact === 'number');
    }
  });

  it('score clamped 0-100', () => {
    // Very bad ticket — many penalties
    const ticket = {
      title: 'Fix',
      description: 'x',
      type: 'story',
      labels: ['architecture', 'breaking', 'migration', 'refactor-large'],
    };
    const context = {
      affectedFiles: Array.from({ length: 25 }, (_, i) => `file${i}.ts`),
      knownFiles: [],
    };
    const result = calculateConfidence(ticket, null, context);
    assert.ok(result.score >= 0, `Score should be >= 0, got ${result.score}`);
    assert.ok(result.score <= 100, `Score should be <= 100, got ${result.score}`);
  });
});
