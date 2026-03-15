'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openProjectDb, closeDb } = require('../../dashboard/lib/context/db');
const { KnowledgeBase } = require('../../dashboard/lib/context/knowledge-base');

const dbs = [];
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-kb-'));
  const db = openProjectDb(path.join(dir, 'project.db'));
  const kb = new KnowledgeBase(db);
  dbs.push({ db, dir });
  return { db, kb };
}

afterEach(() => {
  for (const { db, dir } of dbs) { closeDb(db); fs.rmSync(dir, { recursive: true, force: true }); }
  dbs.length = 0;
});

describe('KnowledgeBase', () => {
  it('adds and retrieves entries', () => {
    const { kb } = setup();
    kb.add({ category: 'pattern', title: 'Zustand store pattern', content: 'use create(immer(...))', tags: 'zustand,state' });
    const results = kb.search('zustand');
    assert.strictEqual(results.items.length, 1);
    assert.ok(results.items[0].title.includes('Zustand'));
  });

  it('FTS5 Porter stemming finds variations', () => {
    const { kb } = setup();
    kb.add({ category: 'pattern', title: 'Storing data locally', content: 'AsyncStorage pattern for local storage', tags: 'storage' });
    const results = kb.search('store'); // should match "Storing"
    assert.ok(results.items.length > 0);
  });

  it('trigram fallback catches typos', () => {
    const { kb } = setup();
    kb.add({ category: 'pattern', title: 'Zustand middleware', content: 'Immer integration', tags: 'zustand' });
    const results = kb.search('zusatnd'); // typo
    assert.ok(results.items.length > 0);
  });

  it('respects max 2KB response size', () => {
    const { kb } = setup();
    for (let i = 0; i < 50; i++) {
      kb.add({ category: 'pattern', title: `Pattern ${i}`, content: 'x'.repeat(200), tags: 'test' });
    }
    const results = kb.search('pattern');
    const json = JSON.stringify(results);
    assert.ok(json.length <= 2048);
  });

  it('updates access count and accessed_at on search hit', () => {
    const { kb, db } = setup();
    kb.add({ category: 'pattern', title: 'unique pattern xyz', content: 'content', tags: 'test' });
    kb.search('unique pattern xyz');
    const row = db.prepare("SELECT access_count FROM knowledge WHERE title = 'unique pattern xyz'").get();
    assert.strictEqual(row.access_count, 1);
  });

  it('deletes entries', () => {
    const { kb } = setup();
    const id = kb.add({ category: 'error', title: 'temp error', content: 'will delete', tags: '' });
    kb.delete(id);
    const results = kb.search('temp error');
    assert.strictEqual(results.items.length, 0);
  });

  it('filters by category', () => {
    const { kb } = setup();
    kb.add({ category: 'pattern', title: 'a pattern', content: 'stuff', tags: '' });
    kb.add({ category: 'error', title: 'an error', content: 'stuff', tags: '' });
    const patterns = kb.search('stuff', { category: 'pattern' });
    assert.strictEqual(patterns.items.length, 1);
    assert.strictEqual(patterns.items[0].category, 'pattern');
  });
});
