'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { calculateRelevance } = require('../../dashboard/lib/context/knowledge-base');

describe('relevance scoring', () => {
  it('returns 1.0 for brand new entry (0 weeks, 0 accesses)', () => {
    const score = calculateRelevance(new Date().toISOString(), 0);
    assert.ok(Math.abs(score - 1.0) < 0.01);
  });

  it('decays by 10% per week', () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const score = calculateRelevance(oneWeekAgo, 0);
    assert.ok(Math.abs(score - 0.9) < 0.05);
  });

  it('approaches zero at 52 weeks with 0 accesses', () => {
    const yearAgo = new Date(Date.now() - 52 * 7 * 86400000).toISOString();
    const score = calculateRelevance(yearAgo, 0);
    assert.ok(score < 0.01);
  });

  it('boosts with access count', () => {
    const oneWeekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const noAccess = calculateRelevance(oneWeekAgo, 0);
    const withAccess = calculateRelevance(oneWeekAgo, 10);
    assert.ok(withAccess > noAccess);
  });

  it('high access recent entry scores high', () => {
    const recent = new Date(Date.now() - 86400000).toISOString(); // 1 day
    const score = calculateRelevance(recent, 5);
    assert.ok(score > 2.0);
  });
});
