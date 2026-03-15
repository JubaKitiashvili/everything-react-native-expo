'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openSessionDb, openProjectDb, closeDb } = require('../../dashboard/lib/context/db');
const { SessionTracker } = require('../../dashboard/lib/context/session-tracker');
const { buildSnapshot, trimSnapshot, restorePrompt } = require('../../dashboard/lib/context/session-continuity');

const resources = [];
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-snap-'));
  const sessionDb = openSessionDb(path.join(dir, 'session.db'));
  const projectDb = openProjectDb(path.join(dir, 'project.db'));
  const tracker = new SessionTracker(sessionDb);
  resources.push({ dbs: [sessionDb, projectDb], dir });
  return { sessionDb, projectDb, tracker, dir };
}

afterEach(() => {
  for (const { dbs, dir } of resources) {
    dbs.forEach(d => closeDb(d));
    fs.rmSync(dir, { recursive: true, force: true });
  }
  resources.length = 0;
});

describe('buildSnapshot', () => {
  it('captures active agent and task', () => {
    const { tracker, sessionDb } = setup();
    tracker.track('task_start', { agent: 'architect', task: 'design auth' });
    const snap = buildSnapshot(sessionDb, 'test-session');
    assert.strictEqual(snap.active.agent, 'architect');
    assert.strictEqual(snap.active.task, 'design auth');
  });

  it('captures completed tasks', () => {
    const { tracker, sessionDb } = setup();
    tracker.track('task_start', { agent: 'architect', task: 'plan' });
    tracker.track('task_complete', { agent: 'architect', task: 'plan', status: 'success' });
    const snap = buildSnapshot(sessionDb, 'test-session');
    assert.strictEqual(snap.completed.length, 1);
  });

  it('captures unresolved errors', () => {
    const { tracker, sessionDb } = setup();
    tracker.track('error', { command: 'npm test', stderr: 'fail', exit_code: 1 });
    const snap = buildSnapshot(sessionDb, 'test-session');
    assert.strictEqual(snap.errors.length, 1);
  });
});

describe('trimSnapshot', () => {
  it('enforces 2KB limit', () => {
    const bigSnap = {
      version: 1, session_id: 'x',
      active: { agent: 'test', task: 'task', files_open: Array(20).fill('long/path/file.tsx') },
      completed: Array(20).fill({ agent: 'a', task: 'long task description here' }),
      decisions: Array(10).fill('decision text that is quite long'),
      errors: Array(5).fill({ command: 'cmd', error: 'error text' }),
      commits: Array(10).fill('abc1234 long commit message'),
      stats: { context_saved_pct: 95, events_total: 500, knowledge_added: 10 }
    };
    const trimmed = trimSnapshot(bigSnap);
    assert.ok(JSON.stringify(trimmed).length <= 2048);
  });

  it('never trims active.agent and active.task', () => {
    const snap = {
      version: 1, session_id: 'x',
      active: { agent: 'architect', task: 'important task', files_open: [] },
      completed: [], decisions: [], errors: [], commits: [],
      stats: { context_saved_pct: 0, events_total: 0, knowledge_added: 0 }
    };
    const trimmed = trimSnapshot(snap);
    assert.strictEqual(trimmed.active.agent, 'architect');
    assert.strictEqual(trimmed.active.task, 'important task');
  });
});

describe('restorePrompt', () => {
  it('generates markdown from snapshot', () => {
    const snap = {
      version: 1, session_id: 'x', created_at: new Date().toISOString(),
      active: { agent: 'architect', task: 'design auth', files_open: ['src/Auth.tsx'] },
      completed: [{ agent: 'tdd-guide', task: 'write tests' }],
      decisions: ['FlashList over FlatList: 500+ items'],
      errors: [],
      commits: ['abc1234 feat: add auth'],
      stats: { context_saved_pct: 94, events_total: 100, knowledge_added: 5 }
    };
    const prompt = restorePrompt(snap);
    assert.ok(prompt.includes('architect'));
    assert.ok(prompt.includes('design auth'));
    assert.ok(prompt.includes('FlashList'));
  });

  it('returns null for stale snapshots (>24h)', () => {
    const snap = {
      version: 1, session_id: 'x',
      created_at: new Date(Date.now() - 25 * 3600000).toISOString(),
      active: { agent: 'a', task: 't', files_open: [] },
      completed: [{ agent: 'a', task: 't' }],
      decisions: [], errors: [], commits: [],
      stats: { context_saved_pct: 0, events_total: 0, knowledge_added: 0 }
    };
    const prompt = restorePrompt(snap);
    assert.ok(prompt.includes('Last session'));
    assert.ok(!prompt.includes('## Session Continuity'));
  });
});
