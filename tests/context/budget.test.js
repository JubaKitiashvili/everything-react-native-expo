'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openProjectDb, closeDb } = require('../../dashboard/lib/context/db');
const { BudgetManager } = require('../../dashboard/lib/context/budget-manager');

const dbs = [];
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-budget-'));
  const db = openProjectDb(path.join(dir, 'project.db'));
  const budget = new BudgetManager(db);
  dbs.push({ db, dir });
  return { db, budget };
}

afterEach(() => {
  for (const { db, dir } of dbs) { closeDb(db); fs.rmSync(dir, { recursive: true, force: true }); }
  dbs.length = 0;
});

describe('BudgetManager', () => {
  it('starts disabled by default', () => {
    const { budget } = setup();
    const settings = budget.getSettings();
    assert.strictEqual(settings.enabled, false);
  });

  it('enables and saves settings', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true, session_limit: 30000, overflow: 'warn' });
    const settings = budget.getSettings();
    assert.strictEqual(settings.enabled, true);
    assert.strictEqual(settings.session_limit, 30000);
    assert.strictEqual(settings.overflow, 'warn');
  });

  it('tracks per-agent usage', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true });
    budget.trackUsage('architect', 500);
    budget.trackUsage('architect', 300);
    const usage = budget.getUsage('architect');
    assert.strictEqual(usage, 800);
  });

  it('detects when agent exceeds 80% budget', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true, agent_limits: { architect: 1000 } });
    budget.trackUsage('architect', 850);
    assert.strictEqual(budget.shouldThrottle('architect'), true);
  });

  it('resets usage on new session', () => {
    const { budget } = setup();
    budget.trackUsage('architect', 500);
    budget.resetSession();
    assert.strictEqual(budget.getUsage('architect'), 0);
    assert.strictEqual(budget.sessionUsage, 0);
  });

  it('tracks session-level usage across agents', () => {
    const { budget } = setup();
    budget.trackUsage('architect', 500);
    budget.trackUsage('tdd-guide', 300);
    assert.strictEqual(budget.sessionUsage, 800);
  });

  it('throttles when session hits 80% of limit', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true, session_limit: 1000 });
    budget.trackUsage('architect', 850);
    assert.strictEqual(budget.shouldThrottle('any-agent'), true);
  });

  it('does not throttle when disabled', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: false, session_limit: 100 });
    budget.trackUsage('architect', 999);
    assert.strictEqual(budget.shouldThrottle('architect'), false);
  });

  it('blocks output on hard_stop when at 100%', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true, session_limit: 1000, overflow: 'hard_stop' });
    budget.trackUsage('architect', 1000);
    const { blocked, reason } = budget.shouldBlock('architect');
    assert.strictEqual(blocked, true);
    assert.ok(reason.includes('exceeded'));
  });

  it('does not block on aggressive_truncation overflow', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true, session_limit: 1000, overflow: 'aggressive_truncation' });
    budget.trackUsage('architect', 2000);
    const { blocked } = budget.shouldBlock('architect');
    assert.strictEqual(blocked, false);
  });

  it('reports session percentage in settings', () => {
    const { budget } = setup();
    budget.updateSettings({ enabled: true, session_limit: 1000 });
    budget.trackUsage('architect', 500);
    const s = budget.getSettings();
    assert.strictEqual(s.session_pct, 50);
    assert.strictEqual(s.session_usage, 500);
  });
});
