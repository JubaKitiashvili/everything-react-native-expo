'use strict';

const MAX_RESPONSE_BYTES = 2048;

function calculateRelevance(accessedAt, accessCount) {
  const weeks = Math.floor((Date.now() - new Date(accessedAt).getTime()) / 604_800_000);
  const recencyFactor = Math.pow(0.9, Math.max(weeks, 0));
  const accessBoost = Math.log2(accessCount + 1);
  return recencyFactor * Math.max(accessBoost, 1.0);
}

function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => {
    const row = new Array(n + 1);
    row[0] = i;
    return row;
  });
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

class KnowledgeBase {
  constructor(db) {
    this.db = db;
    this._prepareStatements();
  }

  _prepareStatements() {
    this._insert = this.db.prepare(`
      INSERT INTO knowledge (category, title, content, source, tags)
      VALUES (@category, @title, @content, @source, @tags)
    `);
    this._delete = this.db.prepare('DELETE FROM knowledge WHERE id = ?');
    this._updateAccess = this.db.prepare(`
      UPDATE knowledge SET access_count = access_count + 1, accessed_at = datetime('now')
      WHERE id = ?
    `);
    this._searchFts = this.db.prepare(`
      SELECT k.id, k.category, k.title, k.content, k.source, k.relevance_score, k.accessed_at, k.access_count
      FROM knowledge_fts f JOIN knowledge k ON f.rowid = k.id
      WHERE knowledge_fts MATCH ?
      ORDER BY rank LIMIT 10
    `);
    this._searchTrigram = this.db.prepare(`
      SELECT k.id, k.category, k.title, k.content, k.source, k.relevance_score, k.accessed_at, k.access_count
      FROM knowledge_trigram t JOIN knowledge k ON t.rowid = k.id
      WHERE knowledge_trigram MATCH ?
      ORDER BY rank LIMIT 10
    `);
    this._allTitles = this.db.prepare('SELECT id, title, category, content, source, relevance_score, accessed_at, access_count FROM knowledge LIMIT 100');
  }

  add({ category, title, content, source = null, tags = '' }) {
    const result = this._insert.run({ category, title, content, source, tags });
    return result.lastInsertRowid;
  }

  delete(id) {
    this._delete.run(id);
  }

  search(query, opts = {}) {
    const { category, minScore = 0, limit = 5 } = opts;
    let results = [];

    // Layer 1: FTS5 Porter stemming
    try {
      results = this._searchFts.all(query);
    } catch { /* query syntax error — skip */ }

    // Layer 2: Trigram (if insufficient results)
    if (results.length < 3) {
      try {
        const trigram = query.length >= 3 ? query.slice(0, 3) : query;
        const trigramResults = this._searchTrigram.all(trigram);
        const existingIds = new Set(results.map(r => r.id));
        for (const r of trigramResults) {
          if (!existingIds.has(r.id)) results.push(r);
        }
      } catch { /* skip */ }
    }

    // Layer 3: Levenshtein (last resort, only on small sets)
    if (results.length < 2) {
      const all = this._allTitles.all();
      for (const row of all) {
        if (results.find(r => r.id === row.id)) continue;
        if (levenshtein(query.toLowerCase(), row.title.toLowerCase()) <= 2) {
          results.push(row);
        }
      }
    }

    // Filter by category
    if (category) results = results.filter(r => r.category === category);

    // Recalculate relevance and sort
    results = results.map(r => ({
      ...r,
      score: calculateRelevance(r.accessed_at, r.access_count)
    }));
    results.sort((a, b) => b.score - a.score);

    // Filter by minimum score
    if (minScore > 0) results = results.filter(r => r.score >= minScore);

    // Update access counts
    for (const r of results) this._updateAccess.run(r.id);

    // Build compact response within 2KB
    const items = [];
    let totalBytes = 50; // overhead for wrapper
    for (const r of results.slice(0, limit)) {
      const item = {
        title: r.title,
        category: r.category,
        snippet: (r.content || '').slice(0, 150),
        source: r.source,
        score: Math.round(r.score * 100) / 100
      };
      const itemBytes = JSON.stringify(item).length;
      if (totalBytes + itemBytes > MAX_RESPONSE_BYTES) {
        return { query, results: items.length, items, truncated: true, bytes: totalBytes };
      }
      items.push(item);
      totalBytes += itemBytes;
    }

    return { query, results: items.length, items, bytes: totalBytes };
  }

  prune() {
    const threshold = new Date(Date.now() - 90 * 86400000).toISOString();
    this.db.exec(`
      INSERT INTO knowledge_archive (original_id, category, title, content, source, tags, relevance_score, created_at)
      SELECT id, category, title, content, source, tags, relevance_score, created_at
      FROM knowledge WHERE relevance_score < 0.1 AND accessed_at < '${threshold}'
    `);
    this.db.exec(`
      DELETE FROM knowledge WHERE relevance_score < 0.1 AND accessed_at < '${threshold}'
    `);
  }
}

module.exports = { KnowledgeBase, calculateRelevance, levenshtein };
