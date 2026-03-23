'use strict';
const { execFile } = require('child_process');

// Only allow these command prefixes
const ALLOWED_CMDS = ['npm', 'npx', 'node'];
// Flags that allow arbitrary code execution
const DANGEROUS_FLAGS = ['-c', '-e', '--eval', 'exec', '--', '-p', '--print', '--require'];

function isCommandSafe(fix) {
  const trimmed = fix.trim();
  // Reject shell metacharacters
  if (/[;&|`$(){}\\<>]/.test(trimmed)) return false;
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  // Must start with allowed command
  if (!ALLOWED_CMDS.includes(cmd)) return false;
  // Reject dangerous flags that allow arbitrary execution
  if (parts.some((p) => DANGEROUS_FLAGS.includes(p))) return false;
  return true;
}

function handleIssueFix(req, res, urlPath, body, broadcast) {
  if (req.method !== 'POST' || urlPath !== '/api/issues/fix') return false;

  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const { findingId, fix } = parsed;

    if (!fix) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'fix string required' }));
      return true;
    }

    if (!isCommandSafe(fix)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({ error: 'Command not allowed. Only npm/npx/node commands are permitted.' }),
      );
      return true;
    }

    const parts = fix.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

    // Execute safely with execFile (no shell)
    const child = execFile(
      cmd,
      args,
      { cwd: projectDir, timeout: 60000 },
      (err, stdout, stderr) => {
        // Broadcast completion
        if (broadcast) {
          broadcast({
            type: 'fix_complete',
            findingId,
            success: !err,
            output: (stdout || '') + (stderr || ''),
          });
        }
      },
    );

    // Stream output lines via WebSocket
    if (child.stdout && broadcast) {
      child.stdout.on('data', (data) => {
        broadcast({ type: 'fix_output', findingId, line: data.toString() });
      });
    }
    if (child.stderr && broadcast) {
      child.stderr.on('data', (data) => {
        broadcast({ type: 'fix_output', findingId, line: data.toString() });
      });
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, findingId, command: fix }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }

  return true;
}

module.exports = { handleIssueFix };
