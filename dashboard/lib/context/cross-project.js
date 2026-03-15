'use strict';

class CrossProjectKnowledge {
  constructor(globalDb, projectDb) {
    this.globalDb = globalDb;
    this.projectDb = projectDb;
  }

  promoteShareable() {
    const shareable = this.projectDb.prepare('SELECT * FROM knowledge WHERE shareable = 1').all();
    const insert = this.globalDb.prepare(`
      INSERT OR IGNORE INTO knowledge (category, title, content, source, tags, shareable)
      VALUES (@category, @title, @content, @source, @tags, 1)
    `);
    for (const entry of shareable) {
      insert.run(entry);
    }
  }

  search(query) {
    try {
      return this.globalDb.prepare(`
        SELECT k.* FROM knowledge_fts f JOIN knowledge k ON f.rowid = k.id
        WHERE knowledge_fts MATCH ? ORDER BY rank LIMIT 5
      `).all(query);
    } catch {
      return [];
    }
  }
}

module.exports = { CrossProjectKnowledge };
