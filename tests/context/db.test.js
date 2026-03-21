const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const os = require('os');
const fs = require('fs');
const {
  openProjectDb,
  openSessionDb,
  closeDb,
  getSchemaVersion,
} = require('../../dashboard/lib/context/db');

let db = null;
let tmpDir = null;

const makeTmpDir = () => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-db-test-'));
  return tmpDir;
};

const cleanup = () => {
  closeDb(db);
  db = null;
  if (tmpDir && fs.existsSync(tmpDir)) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  tmpDir = null;
};

describe('openProjectDb', () => {
  afterEach(cleanup);

  it('creates project DB with all expected tables', () => {
    const dir = makeTmpDir();
    db = openProjectDb(path.join(dir, 'project.sqlite'));

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    const expected = [
      'agent_sequences',
      'budget_settings',
      'file_access_patterns',
      'knowledge',
      'knowledge_archive',
      'schema_version',
      'snapshots',
    ];
    for (const t of expected) {
      assert.ok(tables.includes(t), `Missing table: ${t}`);
    }
  });

  it('enables WAL mode', () => {
    const dir = makeTmpDir();
    db = openProjectDb(path.join(dir, 'project.sqlite'));
    const { journal_mode } = db.prepare('PRAGMA journal_mode').get();
    assert.equal(journal_mode, 'wal');
  });

  it('has schema version 2', () => {
    const dir = makeTmpDir();
    db = openProjectDb(path.join(dir, 'project.sqlite'));
    assert.equal(getSchemaVersion(db), 2);
  });

  it('syncs FTS5 on insert', () => {
    const dir = makeTmpDir();
    db = openProjectDb(path.join(dir, 'project.sqlite'));

    db.prepare(
      "INSERT INTO knowledge (category, title, content, tags) VALUES ('pattern', 'Test Title', 'Test content body', 'react,hooks')"
    ).run();

    const ftsRow = db
      .prepare("SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'Test'")
      .get();
    assert.ok(ftsRow, 'FTS5 row should exist after insert');
    assert.ok(ftsRow.title.includes('Test Title'));
  });

  it('syncs FTS5 on delete', () => {
    const dir = makeTmpDir();
    db = openProjectDb(path.join(dir, 'project.sqlite'));

    db.prepare(
      "INSERT INTO knowledge (category, title, content, tags) VALUES ('error', 'Delete Me', 'Some content', 'test')"
    ).run();

    // Verify it exists
    const before = db
      .prepare(
        "SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'Delete'"
      )
      .get();
    assert.ok(before, 'FTS5 row should exist before delete');

    // Delete it
    db.prepare('DELETE FROM knowledge WHERE title = ?').run('Delete Me');

    const after = db
      .prepare(
        "SELECT * FROM knowledge_fts WHERE knowledge_fts MATCH 'Delete'"
      )
      .all();
    assert.equal(after.length, 0, 'FTS5 row should be gone after delete');
  });
});

describe('openSessionDb', () => {
  afterEach(cleanup);

  it('creates session DB with events table', () => {
    const dir = makeTmpDir();
    db = openSessionDb(path.join(dir, 'session.sqlite'));

    const tables = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      )
      .all()
      .map((r) => r.name);

    assert.ok(tables.includes('events'), 'Missing events table');
    assert.ok(tables.includes('schema_version'), 'Missing schema_version table');
  });
});
