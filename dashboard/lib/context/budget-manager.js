'use strict';

class BudgetManager {
  constructor(db) {
    this.db = db;
    this.agentUsage = new Map();
    this._ensureSettings();
  }

  _ensureSettings() {
    const existing = this.db.prepare('SELECT * FROM budget_settings WHERE id = 1').get();
    if (!existing) {
      this.db.prepare("INSERT INTO budget_settings (id, enabled, session_limit, overflow, agent_limits) VALUES (1, 0, 50000, 'aggressive_truncation', '{}')").run();
    }
  }

  getSettings() {
    const row = this.db.prepare('SELECT * FROM budget_settings WHERE id = 1').get();
    return {
      enabled: !!row.enabled,
      session_limit: row.session_limit,
      overflow: row.overflow,
      agent_limits: JSON.parse(row.agent_limits || '{}'),
      agents: Object.fromEntries(
        [...this.agentUsage.entries()].map(([k, v]) => [k, { limit: JSON.parse(row.agent_limits || '{}')[k] || 0, used: v }])
      )
    };
  }

  updateSettings({ enabled, session_limit, overflow, agent_limits }) {
    const current = this.getSettings();
    this.db.prepare(`UPDATE budget_settings SET
      enabled = ?, session_limit = ?, overflow = ?, agent_limits = ? WHERE id = 1`
    ).run(
      enabled !== undefined ? (enabled ? 1 : 0) : (current.enabled ? 1 : 0),
      session_limit || current.session_limit,
      overflow || current.overflow,
      JSON.stringify(agent_limits || current.agent_limits)
    );
  }

  trackUsage(agent, bytes) {
    const current = this.agentUsage.get(agent) || 0;
    this.agentUsage.set(agent, current + bytes);
  }

  getUsage(agent) {
    return this.agentUsage.get(agent) || 0;
  }

  shouldThrottle(agent) {
    const settings = this.getSettings();
    if (!settings.enabled) return false;
    const limit = settings.agent_limits[agent];
    if (!limit) return false;
    return this.getUsage(agent) >= limit * 0.8;
  }

  resetSession() {
    this.agentUsage.clear();
  }
}

module.exports = { BudgetManager };
