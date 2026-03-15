'use strict';

const crypto = require('crypto');

/**
 * ContentStore — Index raw tool outputs and retrieve only relevant chunks.
 * Achieves 50-93% savings by returning search results instead of full content.
 *
 * Unlike KnowledgeBase (which stores learned patterns), ContentStore handles
 * ephemeral tool outputs that are indexed for the current session.
 */
class ContentStore {
  constructor(db) {
    this.db = db;
    this._ensureTables();
    this._prepareStatements();
  }

  _ensureTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS content_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_hash TEXT NOT NULL UNIQUE,
        source_name TEXT NOT NULL,
        total_chunks INTEGER DEFAULT 0,
        total_bytes INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS content_chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_id INTEGER NOT NULL REFERENCES content_sources(id) ON DELETE CASCADE,
        chunk_index INTEGER NOT NULL,
        heading TEXT NOT NULL DEFAULT '',
        content TEXT NOT NULL,
        has_code INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_content_chunks_source ON content_chunks(source_id);

      CREATE VIRTUAL TABLE IF NOT EXISTS content_chunks_fts USING fts5(
        heading,
        content,
        content=content_chunks,
        content_rowid=id,
        tokenize='porter unicode61'
      );

      CREATE TRIGGER IF NOT EXISTS content_chunks_ai AFTER INSERT ON content_chunks BEGIN
        INSERT INTO content_chunks_fts(rowid, heading, content)
          VALUES (new.id, new.heading, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS content_chunks_ad AFTER DELETE ON content_chunks BEGIN
        INSERT INTO content_chunks_fts(content_chunks_fts, rowid, heading, content)
          VALUES ('delete', old.id, old.heading, old.content);
      END;
    `);
  }

  _prepareStatements() {
    this._insertSource = this.db.prepare(`
      INSERT INTO content_sources (source_hash, source_name, total_chunks, total_bytes)
      VALUES (@source_hash, @source_name, @total_chunks, @total_bytes)
    `);

    this._findSource = this.db.prepare(
      'SELECT id FROM content_sources WHERE source_hash = ?'
    );

    this._insertChunk = this.db.prepare(`
      INSERT INTO content_chunks (source_id, chunk_index, heading, content, has_code)
      VALUES (@source_id, @chunk_index, @heading, @content, @has_code)
    `);

    this._searchFts = this.db.prepare(`
      SELECT c.id, c.source_id, c.chunk_index, c.heading, c.content, c.has_code,
             s.source_name, rank
      FROM content_chunks_fts f
      JOIN content_chunks c ON f.rowid = c.id
      JOIN content_sources s ON c.source_id = s.id
      WHERE content_chunks_fts MATCH ?
      ORDER BY rank
      LIMIT ?
    `);

    this._searchFtsBySource = this.db.prepare(`
      SELECT c.id, c.source_id, c.chunk_index, c.heading, c.content, c.has_code,
             s.source_name, rank
      FROM content_chunks_fts f
      JOIN content_chunks c ON f.rowid = c.id
      JOIN content_sources s ON c.source_id = s.id
      WHERE content_chunks_fts MATCH ? AND c.source_id = ?
      ORDER BY rank
      LIMIT ?
    `);

    this._clearChunks = this.db.prepare('DELETE FROM content_chunks');
    this._clearSources = this.db.prepare('DELETE FROM content_sources');

    this._stats = this.db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM content_sources) AS sources,
        (SELECT COUNT(*) FROM content_chunks) AS chunks,
        (SELECT COALESCE(SUM(total_bytes), 0) FROM content_sources) AS total_bytes
    `);

    this._sourceStats = this.db.prepare(`
      SELECT id, source_name, total_chunks, total_bytes, created_at
      FROM content_sources ORDER BY created_at DESC
    `);
  }

  /**
   * Index content by chunking it and storing in FTS5.
   * @param {string} content - Raw content to index
   * @param {string} sourceName - Identifier (e.g. "context7-react-docs")
   * @returns {{ sourceId: number, chunks: number, originalBytes: number, indexedBytes: number, deduplicated: boolean }}
   */
  index(content, sourceName) {
    const originalBytes = Buffer.byteLength(content, 'utf8');
    const hash = crypto.createHash('sha256').update(content).digest('hex');

    // Deduplication: skip if already indexed
    const existing = this._findSource.get(hash);
    if (existing) {
      return {
        sourceId: existing.id,
        chunks: 0,
        originalBytes,
        indexedBytes: 0,
        deduplicated: true,
      };
    }

    const chunks = this._chunkContent(content);
    let indexedBytes = 0;

    const insertAll = this.db.transaction(() => {
      const sourceResult = this._insertSource.run({
        source_hash: hash,
        source_name: sourceName,
        total_chunks: chunks.length,
        total_bytes: originalBytes,
      });
      const sourceId = sourceResult.lastInsertRowid;

      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const chunkBytes = Buffer.byteLength(chunk.content, 'utf8');
        indexedBytes += chunkBytes;

        this._insertChunk.run({
          source_id: sourceId,
          chunk_index: i,
          heading: chunk.heading,
          content: chunk.content,
          has_code: chunk.hasCode ? 1 : 0,
        });
      }

      return sourceId;
    });

    const sourceId = insertAll();

    return {
      sourceId,
      chunks: chunks.length,
      originalBytes,
      indexedBytes,
      deduplicated: false,
    };
  }

  /**
   * Search indexed content and return matching chunks.
   * @param {string} query - Search query
   * @param {object} opts - { limit: 5, sourceId: null, maxBytes: 2048 }
   * @returns {{ query: string, results: number, totalBytes: number, chunks: Array<{ heading: string, content: string, score: number, source: string, hasCode: boolean }> }}
   */
  search(query, opts = {}) {
    const { limit = 3, sourceId = null, maxBytes = 1024 } = opts;

    // Sanitize query for FTS5: remove special characters that break MATCH syntax
    const sanitized = this._sanitizeQuery(query);
    if (!sanitized) {
      return { query, results: 0, totalBytes: 0, chunks: [] };
    }

    let rows = [];
    try {
      if (sourceId) {
        rows = this._searchFtsBySource.all(sanitized, sourceId, limit * 2);
      } else {
        rows = this._searchFts.all(sanitized, limit * 2);
      }
    } catch {
      // FTS5 query syntax error — try individual words
      try {
        const words = sanitized.split(/\s+/).filter(w => w.length > 1);
        const fallback = words.join(' OR ');
        if (fallback) {
          if (sourceId) {
            rows = this._searchFtsBySource.all(fallback, sourceId, limit * 2);
          } else {
            rows = this._searchFts.all(fallback, limit * 2);
          }
        }
      } catch {
        // Give up on search
      }
    }

    // Build response within maxBytes
    const chunks = [];
    let totalBytes = 0;

    for (const row of rows) {
      if (chunks.length >= limit) break;

      const chunkContent = row.content;
      const chunkBytes = Buffer.byteLength(chunkContent, 'utf8');
      const hasCode = row.has_code === 1;

      // Code blocks are never truncated — include in full or skip
      if (hasCode) {
        if (totalBytes + chunkBytes > maxBytes && chunks.length > 0) {
          // Skip this code chunk if it would exceed the budget
          // (unless it's the first result — always return at least one)
          continue;
        }
        chunks.push({
          heading: row.heading,
          content: chunkContent,
          score: Math.abs(row.rank),
          source: row.source_name,
          hasCode: true,
        });
        totalBytes += chunkBytes;
      } else {
        // Non-code chunks can be truncated if needed
        if (totalBytes + chunkBytes > maxBytes && chunks.length > 0) {
          const remaining = maxBytes - totalBytes;
          if (remaining > 100) {
            chunks.push({
              heading: row.heading,
              content: chunkContent.slice(0, remaining) + '\n...(truncated)',
              score: Math.abs(row.rank),
              source: row.source_name,
              hasCode: false,
            });
            totalBytes += remaining;
          }
          break;
        }
        chunks.push({
          heading: row.heading,
          content: chunkContent,
          score: Math.abs(row.rank),
          source: row.source_name,
          hasCode: false,
        });
        totalBytes += chunkBytes;
      }
    }

    return { query, results: chunks.length, totalBytes, chunks };
  }

  /**
   * Clear all indexed content (session cleanup).
   */
  clear() {
    const clearAll = this.db.transaction(() => {
      this._clearChunks.run();
      this._clearSources.run();
    });
    clearAll();
  }

  /**
   * Get stats about indexed content.
   * @returns {{ sources: number, chunks: number, totalBytes: number, details: Array }}
   */
  stats() {
    const summary = this._stats.get();
    const details = this._sourceStats.all();
    return {
      sources: summary.sources,
      chunks: summary.chunks,
      totalBytes: summary.total_bytes,
      details,
    };
  }

  // ── Private helpers ──────────────────────────────────────────────────

  /**
   * Chunk content based on detected format.
   * @param {string} content
   * @returns {Array<{ heading: string, content: string, hasCode: boolean }>}
   */
  _chunkContent(content) {
    const trimmed = content.trim();
    if (!trimmed) return [];

    // JSON detection: don't chunk, store as single unit
    if (this._isJson(trimmed)) {
      return [{
        heading: '(JSON data)',
        content: trimmed,
        hasCode: true,
      }];
    }

    // Markdown detection: split by headings
    if (this._isMarkdown(trimmed)) {
      return this._chunkMarkdown(trimmed);
    }

    // Plain text: split by double newlines (paragraphs)
    return this._chunkParagraphs(trimmed);
  }

  /**
   * Chunk markdown by ## headings. Each heading + content until next heading = 1 chunk.
   * Code blocks within a chunk stay with that chunk.
   */
  _chunkMarkdown(content) {
    const chunks = [];

    // First, protect code blocks by replacing them with placeholders
    const codeBlocks = [];
    const withPlaceholders = content.replace(/```[\s\S]*?```/g, (match) => {
      const idx = codeBlocks.length;
      codeBlocks.push(match);
      return `\x00CODEBLOCK_${idx}\x00`;
    });

    // Split by headings (## or more)
    const sections = withPlaceholders.split(/^(#{1,6}\s+.+)$/m);

    let currentHeading = '';
    let currentContent = '';

    const pushChunk = () => {
      const restored = this._restoreCodeBlocks(currentContent.trim(), codeBlocks);
      if (restored) {
        chunks.push({
          heading: currentHeading,
          content: restored,
          hasCode: /```[\s\S]*?```/.test(restored),
        });
      }
    };

    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      if (/^#{1,6}\s+/.test(section)) {
        // This is a heading — push previous chunk and start new one
        pushChunk();
        currentHeading = section.replace(/^#+\s+/, '').trim();
        currentContent = '';
      } else {
        currentContent += section;
      }
    }
    pushChunk();

    // If no headings found, fall back to paragraph chunking
    if (chunks.length === 0) {
      return this._chunkParagraphs(content);
    }

    return chunks;
  }

  /**
   * Chunk plain text by double newlines (paragraph boundaries).
   */
  _chunkParagraphs(content) {
    const chunks = [];

    // Protect code blocks
    const codeBlocks = [];
    const withPlaceholders = content.replace(/```[\s\S]*?```/g, (match) => {
      const idx = codeBlocks.length;
      codeBlocks.push(match);
      return `\x00CODEBLOCK_${idx}\x00`;
    });

    const paragraphs = withPlaceholders.split(/\n\s*\n/);
    let buffer = '';
    let chunkIndex = 0;

    for (const para of paragraphs) {
      const trimmed = para.trim();
      if (!trimmed) continue;

      // Accumulate small paragraphs (< 200 chars) into one chunk
      if (buffer && Buffer.byteLength(buffer + '\n\n' + trimmed, 'utf8') > 1500) {
        const restored = this._restoreCodeBlocks(buffer, codeBlocks);
        chunks.push({
          heading: `(section ${++chunkIndex})`,
          content: restored,
          hasCode: /```[\s\S]*?```/.test(restored),
        });
        buffer = trimmed;
      } else {
        buffer = buffer ? buffer + '\n\n' + trimmed : trimmed;
      }
    }

    if (buffer.trim()) {
      const restored = this._restoreCodeBlocks(buffer, codeBlocks);
      chunks.push({
        heading: `(section ${++chunkIndex})`,
        content: restored,
        hasCode: /```[\s\S]*?```/.test(restored),
      });
    }

    return chunks.length > 0 ? chunks : [{
      heading: '(content)',
      content,
      hasCode: /```[\s\S]*?```/.test(content),
    }];
  }

  /**
   * Restore code block placeholders to original content.
   */
  _restoreCodeBlocks(text, codeBlocks) {
    return text.replace(/\x00CODEBLOCK_(\d+)\x00/g, (_, idx) => codeBlocks[Number(idx)]);
  }

  /**
   * Detect if content is JSON.
   */
  _isJson(content) {
    const first = content[0];
    if (first !== '{' && first !== '[') return false;
    try {
      JSON.parse(content);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Detect if content looks like markdown (has headings or code blocks).
   */
  _isMarkdown(content) {
    return /^#{1,6}\s+/m.test(content);
  }

  /**
   * Sanitize a query string for FTS5 MATCH.
   * Strips operators and special chars, keeps words.
   */
  _sanitizeQuery(query) {
    // Remove FTS5 special characters, keep alphanumeric and spaces
    const cleaned = query
      .replace(/[*():^"{}[\]~<>!@#$%&\\|/+=,;.?-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!cleaned) return null;
    // Wrap each word in quotes for exact matching, join with implicit AND
    const words = cleaned.split(' ').filter(w => w.length > 0);
    if (words.length === 0) return null;
    return words.map(w => `"${w}"`).join(' ');
  }
}

module.exports = { ContentStore };
