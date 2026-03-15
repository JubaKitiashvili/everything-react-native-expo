'use strict';

const MAX_SNAPSHOT_BYTES = 2048;

function buildSnapshot(sessionDb, sessionId) {
  const p1 = sessionDb.prepare('SELECT * FROM events WHERE priority = 1 ORDER BY timestamp').all()
    .map(e => ({ ...e, data: JSON.parse(e.data) }));
  const p2 = sessionDb.prepare('SELECT * FROM events WHERE priority = 2 ORDER BY timestamp DESC LIMIT 20').all()
    .map(e => ({ ...e, data: JSON.parse(e.data) }));

  // Find current active agent (started but not completed)
  const starts = p1.filter(e => e.event_type === 'task_start');
  const completes = p1.filter(e => e.event_type === 'task_complete');
  const completedAgents = new Set(completes.map(e => e.data.agent || e.agent));
  const activeStart = starts.reverse().find(e => !completedAgents.has(e.data.agent || e.agent));

  // Recent files
  const fileEvents = [...p1, ...p2].filter(e => ['file_create', 'file_modify'].includes(e.event_type));
  const recentFiles = [...new Set(fileEvents.slice(-5).map(e => e.data.path))];

  const snapshot = {
    version: 1,
    session_id: sessionId,
    created_at: new Date().toISOString(),
    active: {
      agent: activeStart?.data?.agent || activeStart?.agent || null,
      task: activeStart?.data?.task || null,
      files_open: recentFiles,
    },
    completed: completes.map(e => ({
      agent: e.data.agent || e.agent,
      task: e.data.task,
      files: fileEvents.filter(f =>
        f.timestamp >= (starts.find(s => (s.data.agent || s.agent) === (e.data.agent || e.agent))?.timestamp || '')
        && f.timestamp <= e.timestamp
      ).map(f => f.data.path)
    })),
    decisions: p2.filter(e => e.event_type === 'decision')
      .map(e => `${e.data.choice}: ${e.data.reason}`).slice(0, 5),
    errors: p1.filter(e => e.event_type === 'error'
      && !p1.some(f => f.event_type === 'error_fix' && f.data.error_id === e.id))
      .map(e => ({ command: e.data.command, error: (e.data.stderr || '').slice(0, 150) })).slice(0, 3),
    commits: p2.filter(e => e.event_type === 'git_commit')
      .map(e => `${(e.data.sha || '').slice(0, 7)} ${e.data.message}`).slice(0, 5),
    stats: (function () {
      const eventsTotal = sessionDb.prepare('SELECT COUNT(*) as c FROM events').get().c;
      const bytesRow = sessionDb.prepare('SELECT SUM(context_bytes) as saved FROM events WHERE context_bytes > 0').get();
      const savedBytes = bytesRow ? bytesRow.saved || 0 : 0;
      // Estimate original bytes from events that tracked savings
      const origRow = sessionDb.prepare(
        "SELECT SUM(json_extract(data, '$.original_bytes')) as orig FROM events WHERE json_extract(data, '$.original_bytes') > 0"
      ).get();
      const origBytes = origRow ? origRow.orig || 0 : 0;
      return {
        context_saved_pct: origBytes > 0 ? Math.round(((origBytes - savedBytes) / origBytes) * 100) : 0,
        context_saved_bytes: savedBytes,
        events_total: eventsTotal,
        knowledge_added: sessionDb.prepare("SELECT COUNT(*) as c FROM events WHERE event_type = 'knowledge_hit'").get().c
      };
    })()
  };

  return trimSnapshot(snapshot);
}

function trimSnapshot(snapshot) {
  let json = JSON.stringify(snapshot);
  if (json.length <= MAX_SNAPSHOT_BYTES) return snapshot;

  const s = { ...snapshot };

  // Trim order: stats, commits, errors, decisions, completed, files
  if (json.length > MAX_SNAPSHOT_BYTES) { delete s.stats; json = JSON.stringify(s); }
  if (json.length > MAX_SNAPSHOT_BYTES) { s.commits = []; json = JSON.stringify(s); }
  if (json.length > MAX_SNAPSHOT_BYTES) { s.errors = s.errors.slice(0, 1); json = JSON.stringify(s); }
  if (json.length > MAX_SNAPSHOT_BYTES) { s.decisions = s.decisions.slice(0, 2); json = JSON.stringify(s); }
  if (json.length > MAX_SNAPSHOT_BYTES) { s.completed = s.completed.slice(-3); json = JSON.stringify(s); }
  if (json.length > MAX_SNAPSHOT_BYTES && s.active) { s.active.files_open = s.active.files_open.slice(0, 2); json = JSON.stringify(s); }

  // Last resort — truncate completed task names
  if (json.length > MAX_SNAPSHOT_BYTES) {
    s.completed = s.completed.map(c => ({ agent: c.agent, task: (c.task || '').slice(0, 30) }));
    s.decisions = [];
    s.errors = [];
  }

  return s;
}

function restorePrompt(snapshot) {
  if (!snapshot) return null;

  const age = Date.now() - new Date(snapshot.created_at).getTime();
  if (age > 86_400_000) {
    // Stale — condensed
    return `[ERNE] Last session: ${(snapshot.completed || []).length} tasks completed, ${(snapshot.commits || []).length} commits. Run ctx_session("full") for details.`;
  }

  const parts = [`## Session Continuity (restored by ERNE)\n`];

  if (snapshot.active?.agent) {
    parts.push(`**Last active:** ${snapshot.active.agent} was working on: ${snapshot.active.task}`);
  }
  if (snapshot.active?.files_open?.length) {
    parts.push(`**Files in progress:** ${snapshot.active.files_open.join(', ')}`);
  }
  if (snapshot.completed?.length) {
    parts.push(`\n**Completed this session:**`);
    parts.push(snapshot.completed.map(t => `- ✅ ${t.agent}: ${t.task}`).join('\n'));
  }
  if (snapshot.decisions?.length) {
    parts.push(`\n**Key decisions:**`);
    parts.push(snapshot.decisions.map(d => `- ${d}`).join('\n'));
  }
  if (snapshot.errors?.length) {
    parts.push(`\n**Unresolved errors:**`);
    parts.push(snapshot.errors.map(e => `- ❌ \`${e.command}\`: ${e.error}`).join('\n'));
  }
  if (snapshot.commits?.length) {
    parts.push(`\n**Commits:** ${snapshot.commits.join(' → ')}`);
  }
  if (snapshot.stats?.context_saved_pct) {
    parts.push(`**Context savings:** ${snapshot.stats.context_saved_pct}% tokens saved`);
  }

  return parts.join('\n');
}

function saveSnapshot(projectDb, snapshot) {
  projectDb.prepare('INSERT INTO snapshots (session_id, snapshot) VALUES (?, ?)')
    .run(snapshot.session_id, JSON.stringify(snapshot));
}

function loadLatestSnapshot(projectDb) {
  const row = projectDb.prepare('SELECT snapshot FROM snapshots ORDER BY created_at DESC LIMIT 1').get();
  return row ? JSON.parse(row.snapshot) : null;
}

module.exports = { buildSnapshot, trimSnapshot, restorePrompt, saveSnapshot, loadLatestSnapshot };
