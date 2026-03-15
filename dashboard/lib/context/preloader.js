'use strict';

class AgentPreloader {
  constructor(db) {
    this.db = db;
    this._upsert = db.prepare(`
      INSERT INTO agent_sequences (from_agent, to_agent, frequency)
      VALUES (?, ?, 1)
      ON CONFLICT(from_agent, to_agent) DO UPDATE SET frequency = frequency + 1
    `);
    this._predict = db.prepare(`
      SELECT to_agent, frequency FROM agent_sequences
      WHERE from_agent = ? ORDER BY frequency DESC LIMIT 1
    `);
  }

  recordTransition(fromAgent, toAgent) {
    this._upsert.run(fromAgent, toAgent);
  }

  predictNext(fromAgent) {
    const row = this._predict.get(fromAgent);
    return row ? row.to_agent : null;
  }
}

module.exports = { AgentPreloader };
