'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openProjectDb, closeDb } = require('../../dashboard/lib/context/db');
const { AgentPreloader } = require('../../dashboard/lib/context/preloader');

const dbs = [];
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-pre-'));
  const db = openProjectDb(path.join(dir, 'project.db'));
  const preloader = new AgentPreloader(db);
  dbs.push({ db, dir });
  return { db, preloader };
}

afterEach(() => {
  for (const { db, dir } of dbs) { closeDb(db); fs.rmSync(dir, { recursive: true, force: true }); }
  dbs.length = 0;
});

describe('AgentPreloader', () => {
  it('records agent transitions', () => {
    const { preloader } = setup();
    preloader.recordTransition('architect', 'senior-developer');
    preloader.recordTransition('architect', 'senior-developer');
    const next = preloader.predictNext('architect');
    assert.strictEqual(next, 'senior-developer');
  });

  it('increments frequency on repeated transitions', () => {
    const { preloader, db } = setup();
    preloader.recordTransition('architect', 'senior-developer');
    preloader.recordTransition('architect', 'senior-developer');
    preloader.recordTransition('architect', 'senior-developer');
    const row = db.prepare("SELECT frequency FROM agent_sequences WHERE from_agent = 'architect' AND to_agent = 'senior-developer'").get();
    assert.strictEqual(row.frequency, 3);
  });

  it('returns null for unknown agents', () => {
    const { preloader } = setup();
    const next = preloader.predictNext('unknown-agent');
    assert.strictEqual(next, null);
  });
});
