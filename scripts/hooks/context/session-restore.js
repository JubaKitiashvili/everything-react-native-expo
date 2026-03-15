'use strict';
const { getSync } = require('../lib/context-client');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

async function restore() {
  const sessionId = crypto.randomUUID();
  const erneDir = path.join(process.env.ERNE_PROJECT_DIR || process.cwd(), '.erne');
  try {
    if (!fs.existsSync(erneDir)) fs.mkdirSync(erneDir, { recursive: true });
    fs.writeFileSync(path.join(erneDir, 'current-session-id'), sessionId);
  } catch { /* ignore */ }

  const snapshot = await getSync('snapshot', 2000);
  if (!snapshot || !snapshot.active) return;

  const age = Date.now() - new Date(snapshot.created_at).getTime();
  if (age > 86_400_000) {
    console.log(`[ERNE] Last session: ${(snapshot.completed || []).length} tasks completed. Run ctx_session("full") for details.`);
    return;
  }

  const parts = ['## Session Continuity (restored by ERNE)\n'];
  if (snapshot.active?.agent) parts.push(`**Last active:** ${snapshot.active.agent} was working on: ${snapshot.active.task}`);
  if (snapshot.active?.files_open?.length) parts.push(`**Files in progress:** ${snapshot.active.files_open.join(', ')}`);
  if (snapshot.completed?.length) {
    parts.push('\n**Completed this session:**');
    parts.push(snapshot.completed.map(t => `- ✅ ${t.agent}: ${t.task}`).join('\n'));
  }
  if (snapshot.decisions?.length) {
    parts.push('\n**Key decisions:**');
    parts.push(snapshot.decisions.map(d => `- ${d}`).join('\n'));
  }
  if (snapshot.errors?.length) {
    parts.push('\n**Unresolved errors:**');
    parts.push(snapshot.errors.map(e => `- ❌ \`${e.command}\`: ${e.error}`).join('\n'));
  }
  if (snapshot.commits?.length) parts.push(`\n**Commits:** ${snapshot.commits.join(' → ')}`);
  console.log(parts.join('\n'));
}

restore().catch(() => process.exit(0));
