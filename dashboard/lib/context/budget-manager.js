'use strict';

class BudgetManager {
  constructor(db) {
    this.db = db;
    this.agentUsage = new Map();
    this.sessionUsage = 0;
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
      session_usage: this.sessionUsage,
      session_pct: row.session_limit > 0 ? Math.round((this.sessionUsage / row.session_limit) * 100) : 0,
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
    this.sessionUsage += bytes;
  }

  getUsage(agent) {
    return this.agentUsage.get(agent) || 0;
  }

  /**
   * Check if an agent should be throttled (at 80% of limit).
   * Returns false if budget is disabled or no limit is set.
   */
  shouldThrottle(agent) {
    const settings = this.getSettings();
    if (!settings.enabled) return false;

    // Check session-level limit
    if (this.sessionUsage >= settings.session_limit * 0.8) return true;

    // Check per-agent limit
    const agentLimit = settings.agent_limits[agent];
    if (agentLimit && this.getUsage(agent) >= agentLimit * 0.8) return true;

    return false;
  }

  /**
   * Check if output should be blocked entirely (hard_stop overflow at 100%).
   * Returns { blocked: bool, reason: string }
   */
  shouldBlock(agent) {
    const settings = this.getSettings();
    if (!settings.enabled) return { blocked: false, reason: null };
    if (settings.overflow !== 'hard_stop') return { blocked: false, reason: null };

    if (this.sessionUsage >= settings.session_limit) {
      return { blocked: true, reason: `Session budget exceeded (${this.sessionUsage}/${settings.session_limit} bytes)` };
    }

    const agentLimit = settings.agent_limits[agent];
    if (agentLimit && this.getUsage(agent) >= agentLimit) {
      return { blocked: true, reason: `Agent ${agent} budget exceeded (${this.getUsage(agent)}/${agentLimit} bytes)` };
    }

    return { blocked: false, reason: null };
  }

  /**
   * Get the overflow strategy for the current settings.
   * Returns 'aggressive_truncation' | 'warn' | 'hard_stop'
   */
  getOverflowStrategy() {
    return this.getSettings().overflow;
  }

  resetSession() {
    this.agentUsage.clear();
    this.sessionUsage = 0;
  }
}

module.exports = { BudgetManager };
