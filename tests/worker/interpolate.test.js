'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { interpolate, sanitizeTitle, buildTaskVars } = require('../../worker/interpolate');

describe('interpolate', () => {
  it('replaces {key} variables', () => {
    const result = interpolate('Hello {name}, welcome to {project}', {
      name: 'Juba',
      project: 'ERNE',
    });
    assert.strictEqual(result, 'Hello Juba, welcome to ERNE');
  });

  it('leaves unknown keys intact', () => {
    const result = interpolate('{known} and {unknown}', { known: 'yes' });
    assert.strictEqual(result, 'yes and {unknown}');
  });

  it('returns empty string for non-string template', () => {
    assert.strictEqual(interpolate(null, {}), '');
    assert.strictEqual(interpolate(123, {}), '');
  });
});

describe('sanitizeTitle', () => {
  it('removes unsafe chars (\', `, $, \\)', () => {
    const result = sanitizeTitle("Fix the user's `$HOME\\path` issue");
    assert.ok(!result.includes("'"));
    assert.ok(!result.includes('`'));
    assert.ok(!result.includes('$'));
    assert.ok(!result.includes('\\'));
  });

  it('collapses newlines to spaces', () => {
    const result = sanitizeTitle('Line one\nLine two\r\nLine three');
    assert.ok(!result.includes('\n'));
    assert.ok(!result.includes('\r'));
    assert.ok(result.includes('Line one'));
    assert.ok(result.includes('Line three'));
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(sanitizeTitle(null), '');
    assert.strictEqual(sanitizeTitle(undefined), '');
  });
});

describe('buildTaskVars', () => {
  it('creates correct branch name', () => {
    const ticket = { id: 'PROJ-42', title: 'Add feature', provider: 'linear', url: 'https://linear.app/t/PROJ-42' };
    const vars = buildTaskVars(ticket, 'feature-builder');
    assert.strictEqual(vars.branch, 'feature-builder/task-proj-42');
  });

  it('includes all expected keys', () => {
    const ticket = { id: 'T-1', title: 'Test ticket', provider: 'github', url: 'https://github.com' };
    const vars = buildTaskVars(ticket, 'tdd-guide');
    const expectedKeys = ['id', 'title', 'raw_title', 'branch', 'agent', 'provider', 'url', 'date'];
    for (const key of expectedKeys) {
      assert.ok(Object.prototype.hasOwnProperty.call(vars, key), `Missing key: ${key}`);
    }
  });

  it('sanitizes title in vars but keeps raw_title', () => {
    const ticket = { id: 'T-2', title: "Fix user's `path`" };
    const vars = buildTaskVars(ticket, 'feature-builder');
    assert.ok(!vars.title.includes("'"));
    assert.ok(!vars.title.includes('`'));
    assert.ok(vars.raw_title.includes("'"));
    assert.ok(vars.raw_title.includes('`'));
  });

  it('date is in YYYY-MM-DD format', () => {
    const vars = buildTaskVars({ id: 'T-3', title: 'Test' }, 'feature-builder');
    assert.match(vars.date, /^\d{4}-\d{2}-\d{2}$/);
  });
});
