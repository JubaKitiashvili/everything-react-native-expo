-- ERNE Context Optimization: Content Store Schema
-- Version 2 — Adds content indexing for index+search approach

-- Sources track what content has been indexed (deduplication via hash)
CREATE TABLE IF NOT EXISTS content_sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_hash TEXT NOT NULL UNIQUE,
  source_name TEXT NOT NULL,
  content_type TEXT,
  total_chunks INTEGER DEFAULT 0,
  total_bytes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Chunks are the atomic units of indexed content
CREATE TABLE IF NOT EXISTS content_chunks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source_id INTEGER NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  heading TEXT,
  content TEXT NOT NULL,
  has_code INTEGER DEFAULT 0,
  byte_size INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_chunks_source ON content_chunks(source_id);

-- FTS5 for fast full-text search with BM25 ranking
CREATE VIRTUAL TABLE IF NOT EXISTS content_chunks_fts USING fts5(
  heading,
  content,
  content=content_chunks,
  content_rowid=id,
  tokenize='porter unicode61'
);

-- Sync triggers
CREATE TRIGGER IF NOT EXISTS content_chunks_ai AFTER INSERT ON content_chunks BEGIN
  INSERT INTO content_chunks_fts(rowid, heading, content)
    VALUES (new.id, new.heading, new.content);
END;

CREATE TRIGGER IF NOT EXISTS content_chunks_ad AFTER DELETE ON content_chunks BEGIN
  INSERT INTO content_chunks_fts(content_chunks_fts, rowid, heading, content)
    VALUES ('delete', old.id, old.heading, old.content);
END;

CREATE TRIGGER IF NOT EXISTS content_chunks_au AFTER UPDATE ON content_chunks BEGIN
  INSERT INTO content_chunks_fts(content_chunks_fts, rowid, heading, content)
    VALUES ('delete', old.id, old.heading, old.content);
  INSERT INTO content_chunks_fts(rowid, heading, content)
    VALUES (new.id, new.heading, new.content);
END;

INSERT OR IGNORE INTO schema_version (version) VALUES (2);
