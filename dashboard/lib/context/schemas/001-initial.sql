-- ERNE Context Optimization: Initial Schema
-- Version 1

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL CHECK(category IN ('pattern','decision','error','api','component')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  tags TEXT,
  shareable INTEGER DEFAULT 0,
  relevance_score REAL DEFAULT 1.0,
  created_at TEXT DEFAULT (datetime('now')),
  accessed_at TEXT DEFAULT (datetime('now')),
  access_count INTEGER DEFAULT 0
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
  title,
  content,
  tags,
  content=knowledge,
  content_rowid=id,
  tokenize='porter unicode61'
);

CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_trigram USING fts5(
  title,
  content,
  content=knowledge,
  content_rowid=id,
  tokenize='trigram'
);

-- Sync triggers for FTS5 tables
CREATE TRIGGER IF NOT EXISTS knowledge_ai AFTER INSERT ON knowledge BEGIN
  INSERT INTO knowledge_fts(rowid, title, content, tags)
    VALUES (new.id, new.title, new.content, new.tags);
  INSERT INTO knowledge_trigram(rowid, title, content)
    VALUES (new.id, new.title, new.content);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_ad AFTER DELETE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags)
    VALUES ('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO knowledge_trigram(knowledge_trigram, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
END;

CREATE TRIGGER IF NOT EXISTS knowledge_au AFTER UPDATE ON knowledge BEGIN
  INSERT INTO knowledge_fts(knowledge_fts, rowid, title, content, tags)
    VALUES ('delete', old.id, old.title, old.content, old.tags);
  INSERT INTO knowledge_fts(rowid, title, content, tags)
    VALUES (new.id, new.title, new.content, new.tags);
  INSERT INTO knowledge_trigram(knowledge_trigram, rowid, title, content)
    VALUES ('delete', old.id, old.title, old.content);
  INSERT INTO knowledge_trigram(rowid, title, content)
    VALUES (new.id, new.title, new.content);
END;

CREATE TABLE IF NOT EXISTS knowledge_archive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  original_id INTEGER,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT,
  tags TEXT,
  shareable INTEGER DEFAULT 0,
  relevance_score REAL,
  created_at TEXT,
  archived_at TEXT DEFAULT (datetime('now')),
  reason TEXT
);

CREATE TABLE IF NOT EXISTS agent_sequences (
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  shared_context TEXT,
  frequency INTEGER DEFAULT 0,
  avg_overlap REAL DEFAULT 0.0,
  PRIMARY KEY (from_agent, to_agent)
);

CREATE TABLE IF NOT EXISTS budget_settings (
  id INTEGER PRIMARY KEY CHECK(id = 1),
  enabled INTEGER DEFAULT 1,
  session_limit INTEGER DEFAULT 100000,
  overflow TEXT DEFAULT 'summarize',
  agent_limits TEXT DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  snapshot TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_created ON snapshots(created_at);

CREATE TABLE IF NOT EXISTS file_access_patterns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_path TEXT NOT NULL,
  section_start INTEGER,
  section_end INTEGER,
  access_count INTEGER DEFAULT 1,
  last_agent TEXT,
  description TEXT
);

INSERT OR IGNORE INTO schema_version (version) VALUES (1);
