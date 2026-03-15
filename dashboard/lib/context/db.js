const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const SCHEMA_DIR = path.join(__dirname, 'schemas');

/**
 * Open (or create) the project-level database and apply migrations.
 * @param {string} dbPath - Absolute path to the .sqlite file
 * @returns {import('better-sqlite3').Database}
 */
const openProjectDb = (dbPath) => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const initialSql = fs.readFileSync(
    path.join(SCHEMA_DIR, '001-initial.sql'),
    'utf-8'
  );
  db.exec(initialSql);

  return db;
};

/**
 * Open (or create) a session-level database for event tracking.
 * @param {string} dbPath - Absolute path to the .sqlite file
 * @returns {import('better-sqlite3').Database}
 */
const openSessionDb = (dbPath) => {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER PRIMARY KEY,
      applied_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT DEFAULT (datetime('now')),
      event_type TEXT NOT NULL,
      priority TEXT,
      agent TEXT,
      data TEXT DEFAULT '{}',
      context_bytes INTEGER DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);
    CREATE INDEX IF NOT EXISTS idx_events_priority ON events(priority);
    CREATE INDEX IF NOT EXISTS idx_events_agent ON events(agent);

    INSERT OR IGNORE INTO schema_version (version) VALUES (1);
  `);

  return db;
};

/**
 * Safely close a database connection.
 * @param {import('better-sqlite3').Database | null} db
 */
const closeDb = (db) => {
  if (db && db.open) {
    db.close();
  }
};

/**
 * Return the current (max) schema version.
 * @param {import('better-sqlite3').Database} db
 * @returns {number}
 */
const getSchemaVersion = (db) => {
  const row = db.prepare('SELECT MAX(version) AS v FROM schema_version').get();
  return row?.v ?? 0;
};

module.exports = { openProjectDb, openSessionDb, closeDb, getSchemaVersion };
