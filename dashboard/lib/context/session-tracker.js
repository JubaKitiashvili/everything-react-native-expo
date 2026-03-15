'use strict';

const PRIORITY_MAP = {
  task_start: 1, task_complete: 1, file_create: 1, error: 1, error_fix: 1,
  file_modify: 2, decision: 2, git_commit: 2, test_run: 2,
  dependency_add: 3, knowledge_hit: 3,
  file_read: 4, search: 4
};

class SessionTracker {
  constructor(db) {
    this.db = db;
    this.pendingErrors = new Map();
    this.contextSavedBytes = 0;
    this.contextOriginalBytes = 0;
    this.startTime = Date.now();

    this._insert = db.prepare(`
      INSERT INTO events (timestamp, event_type, priority, agent, data, context_bytes)
      VALUES (@timestamp, @event_type, @priority, @agent, @data, @context_bytes)
    `);
  }

  track(eventType, data, opts = {}) {
    const priority = PRIORITY_MAP[eventType] || 3;
    const agent = data.agent || opts.agent || null;
    const contextBytes = opts.context_bytes || 0;
    const originalBytes = opts.original_bytes || 0;
    this.contextSavedBytes += contextBytes;
    this.contextOriginalBytes += originalBytes;

    const event = {
      timestamp: new Date().toISOString(),
      event_type: eventType,
      priority,
      agent,
      data: JSON.stringify(data),
      context_bytes: contextBytes
    };

    const result = this._insert.run(event);
    const eventId = result.lastInsertRowid;

    // Error→Fix detection
    if (eventType === 'error') {
      this.pendingErrors.set(eventId, { ...event, id: eventId });
    }

    if (eventType === 'test_run' && data.failed === 0 && this.pendingErrors.size > 0) {
      this._detectFixes(eventId);
    }

    return eventId;
  }

  _detectFixes(testEventId) {
    for (const [errorId, errorEvent] of this.pendingErrors) {
      const fixes = this.db.prepare(`
        SELECT * FROM events
        WHERE id > ? AND id < ? AND event_type = 'file_modify'
      `).all(errorId, testEventId);

      if (fixes.length > 0) {
        const fixData = {
          error_id: errorId,
          error_summary: JSON.parse(errorEvent.data).stderr?.slice(0, 200) || '',
          fix_files: fixes.map(f => JSON.parse(f.data).path),
        };
        this.track('error_fix', fixData);
        this.pendingErrors.delete(errorId);
      }
    }
  }

  getStats() {
    const total = this.db.prepare('SELECT COUNT(*) as c FROM events').get().c;
    const byType = {};
    const rows = this.db.prepare('SELECT event_type, COUNT(*) as c FROM events GROUP BY event_type').all();
    for (const r of rows) byType[r.event_type] = r.c;

    const activeAgents = this.db.prepare(`
      SELECT DISTINCT agent FROM events
      WHERE event_type = 'task_start' AND agent NOT IN (
        SELECT agent FROM events WHERE event_type = 'task_complete'
      ) AND agent IS NOT NULL
    `).all().map(r => r.agent);

    const completedAgents = this.db.prepare(`
      SELECT DISTINCT agent FROM events WHERE event_type = 'task_complete' AND agent IS NOT NULL
    `).all().map(r => r.agent);

    return {
      duration: Math.floor((Date.now() - this.startTime) / 1000),
      events_total: total,
      events_by_type: byType,
      agents_active: activeAgents,
      agents_completed: completedAgents,
      context_saved_bytes: this.contextSavedBytes,
      context_saved_pct: this.contextOriginalBytes > 0 ? Math.round((this.contextSavedBytes / this.contextOriginalBytes) * 100) : 0,
      errors_fixed: byType.error_fix || 0,
      knowledge_entries_added: byType.knowledge_hit || 0
    };
  }

  getEventsByPriority(priority, limit = 50) {
    return this.db.prepare('SELECT * FROM events WHERE priority <= ? ORDER BY timestamp DESC LIMIT ?')
      .all(priority, limit)
      .map(e => ({ ...e, data: JSON.parse(e.data) }));
  }
}

module.exports = { SessionTracker, PRIORITY_MAP };
