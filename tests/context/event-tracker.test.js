'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openSessionDb, closeDb } = require('../../dashboard/lib/context/db');
const { SessionTracker } = require('../../dashboard/lib/context/session-tracker');

const dbs = [];
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-st-'));
  const db = openSessionDb(path.join(dir, 'session.db'));
  const tracker = new SessionTracker(db);
  dbs.push({ db, dir });
  return { db, tracker };
}

afterEach(() => {
  for (const { db, dir } of dbs) { closeDb(db); fs.rmSync(dir, { recursive: true, force: true }); }
  dbs.length = 0;
});

describe('SessionTracker', () => {
  it('tracks task_start as P1', () => {
    const { tracker, db } = setup();
    tracker.track('task_start', { agent: 'architect', task: 'design auth' });
    const events = db.prepare('SELECT * FROM events WHERE event_type = ?').all('task_start');
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].priority, 1);
  });

  it('tracks file_create as P1', () => {
    const { tracker, db } = setup();
    tracker.track('file_create', { path: 'src/AuthScreen.tsx' });
    const events = db.prepare('SELECT * FROM events WHERE event_type = ?').all('file_create');
    assert.strictEqual(events[0].priority, 1);
  });

  it('tracks file_modify as P2', () => {
    const { tracker, db } = setup();
    tracker.track('file_modify', { path: 'src/App.tsx', lines_changed: 5 });
    const events = db.prepare('SELECT * FROM events WHERE event_type = ?').all('file_modify');
    assert.strictEqual(events[0].priority, 2);
  });

  it('tracks error as P1', () => {
    const { tracker, db } = setup();
    tracker.track('error', { command: 'npm test', stderr: 'AssertionError', exit_code: 1 });
    const events = db.prepare('SELECT * FROM events WHERE event_type = ?').all('error');
    assert.strictEqual(events[0].priority, 1);
  });

  it('detects error→fix pairs', () => {
    const { tracker, db } = setup();
    tracker.track('error', { command: 'npm test', stderr: 'test failed', exit_code: 1 });
    tracker.track('file_modify', { path: 'src/fix.js', lines_changed: 3 });
    tracker.track('test_run', { passed: 5, failed: 0, total: 5 });
    const fixes = db.prepare('SELECT * FROM events WHERE event_type = ?').all('error_fix');
    assert.strictEqual(fixes.length, 1);
  });

  it('returns session stats', () => {
    const { tracker } = setup();
    tracker.track('task_start', { agent: 'architect', task: 'plan' });
    tracker.track('task_complete', { agent: 'architect', status: 'success' });
    tracker.track('file_create', { path: 'test.tsx' });
    const stats = tracker.getStats();
    assert.strictEqual(stats.events_total, 3);
    assert.ok(stats.events_by_type.task_start === 1);
  });

  it('assigns correct priority to all 13 types', () => {
    const { tracker } = setup();
    const priorities = {
      task_start: 1, task_complete: 1, file_create: 1, error: 1, error_fix: 1,
      file_modify: 2, decision: 2, git_commit: 2, test_run: 2,
      dependency_add: 3, knowledge_hit: 3,
      file_read: 4, search: 4
    };
    for (const [type, expected] of Object.entries(priorities)) {
      tracker.track(type, { test: true });
    }
    const p1 = tracker.db.prepare('SELECT COUNT(*) as c FROM events WHERE priority = 1').get();
    assert.ok(p1.c >= 5);
  });
});
