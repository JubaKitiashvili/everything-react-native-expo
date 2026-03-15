'use strict';
const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');

const { openProjectDb, closeDb } = require('../../dashboard/lib/context/db');
const { CrossProjectKnowledge } = require('../../dashboard/lib/context/cross-project');

const resources = [];
function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-cross-'));
  const globalDb = openProjectDb(path.join(dir, 'global.db'));
  const projectDb = openProjectDb(path.join(dir, 'project.db'));
  const cross = new CrossProjectKnowledge(globalDb, projectDb);
  resources.push({ dbs: [globalDb, projectDb], dir });
  return { globalDb, projectDb, cross };
}

afterEach(() => {
  for (const { dbs, dir } of resources) { dbs.forEach(d => closeDb(d)); fs.rmSync(dir, { recursive: true, force: true }); }
  resources.length = 0;
});

describe('CrossProjectKnowledge', () => {
  it('promotes shareable entries to global', () => {
    const { cross, projectDb, globalDb } = setup();
    projectDb.prepare("INSERT INTO knowledge (category, title, content, tags, shareable) VALUES ('pattern', 'Zustand store', 'content', 'zustand', 1)").run();
    cross.promoteShareable();
    const global = globalDb.prepare("SELECT * FROM knowledge WHERE title = 'Zustand store'").all();
    assert.strictEqual(global.length, 1);
  });

  it('does not promote non-shareable entries', () => {
    const { cross, projectDb, globalDb } = setup();
    projectDb.prepare("INSERT INTO knowledge (category, title, content, tags, shareable) VALUES ('api', 'My API key', 'secret', 'api', 0)").run();
    cross.promoteShareable();
    const global = globalDb.prepare("SELECT * FROM knowledge").all();
    assert.strictEqual(global.length, 0);
  });

  it('searches global when project has no results', () => {
    const { cross, globalDb } = setup();
    globalDb.prepare("INSERT INTO knowledge (category, title, content, tags) VALUES ('pattern', 'FlashList config', 'estimatedItemSize={50}', 'flashlist')").run();
    const results = cross.search('FlashList');
    assert.ok(results.length > 0);
  });
});
