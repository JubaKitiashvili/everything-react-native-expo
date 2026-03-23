'use strict';
const { execFile, execFileSync } = require('child_process');

// Only allow these command prefixes for direct execution
const ALLOWED_CMDS = ['npm', 'npx', 'node'];
const DANGEROUS_FLAGS = ['-c', '-e', '--eval', 'exec', '--', '-p', '--print', '--require'];

// Map issue categories to ERNE agents
const CATEGORY_AGENT_MAP = {
  dependency: 'upgrade-assistant',
  outdated: 'upgrade-assistant',
  security: 'code-reviewer',
  performance: 'performance-profiler',
  build: 'expo-config-resolver',
  config: 'expo-config-resolver',
  accessibility: 'ui-designer',
  'type-safety': 'senior-developer',
  'code-quality': 'code-reviewer',
  testing: 'tdd-guide',
};

// Detect if Claude Code CLI is available
let _claudeAvailable = null;
function isClaudeAvailable() {
  if (_claudeAvailable !== null) return _claudeAvailable;
  try {
    execFileSync('claude', ['--version'], { stdio: 'pipe', timeout: 5000 });
    _claudeAvailable = true;
  } catch {
    _claudeAvailable = false;
  }
  return _claudeAvailable;
}

function isCommandSafe(fix) {
  const trimmed = fix.trim();
  if (/[;&|`$(){}\\<>]/.test(trimmed)) return false;
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  if (!ALLOWED_CMDS.includes(cmd)) return false;
  if (parts.some((p) => DANGEROUS_FLAGS.includes(p))) return false;
  return true;
}

function isSimpleFix(fix) {
  if (!fix) return false;
  const trimmed = fix.trim();
  // Simple: npm install, npx expo install --fix, etc.
  return /^(npm|npx)\s+(install|update|i|up|add|remove|uninstall|expo\s+install)/.test(trimmed);
}

function buildAgentPrompt(issue) {
  return [
    `Fix this issue in the project:`,
    ``,
    `## Issue`,
    `**${issue.title}**`,
    issue.detail ? `\nDetails: ${issue.detail}` : '',
    issue.fix ? `\nSuggested command: \`${issue.fix}\`` : '',
    `\nSeverity: ${issue.severity || 'medium'}`,
    `Category: ${issue.category || 'general'}`,
    ``,
    `## Requirements`,
    `1. Fix the issue`,
    `2. Verify the fix works (run tests or type check)`,
    `3. If the fix breaks anything, revert and try a different approach`,
    `4. Report what you changed and verification results`,
  ].filter(Boolean).join('\n');
}

// GET /api/issues/fix-capabilities — check what fix modes are available
function handleFixCapabilities(req, res, urlPath) {
  if (req.method !== 'GET' || urlPath !== '/api/issues/fix-capabilities') return false;

  const claudeAvailable = isClaudeAvailable();
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    agentFix: claudeAvailable,
    directFix: true,
    copyPrompt: true,
    mode: claudeAvailable ? 'agent' : 'direct',
  }));
  return true;
}

// POST /api/issues/fix — adaptive fix (agent or direct)
function handleIssueFix(req, res, urlPath, body, broadcast) {
  if (req.method !== 'POST' || urlPath !== '/api/issues/fix') return false;

  try {
    const parsed = typeof body === 'string' ? JSON.parse(body) : body;
    const { findingId, fix, issue, mode } = parsed;

    const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

    // Mode: agent — use Claude Code
    if (mode === 'agent' && isClaudeAvailable()) {
      const issueData = issue || { title: fix, detail: '', category: 'general', severity: 'medium', fix };
      const prompt = buildAgentPrompt(issueData);
      const agent = CATEGORY_AGENT_MAP[issueData.category] || 'senior-developer';

      // Broadcast agent start
      if (broadcast) {
        broadcast({
          type: 'agent_update',
          agent,
          status: 'working',
          task: issueData.title,
        });
        broadcast({ type: 'fix_output', findingId, line: `[ERNE] Using ${agent} agent to fix...\n` });
      }

      const child = execFile(
        'claude',
        ['--print', '--dangerously-skip-permissions', prompt],
        { cwd: projectDir, timeout: 120000, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          const output = (stdout || '') + (stderr || '');
          const success = !err;

          // Post-verify: run tests
          let verifyOutput = '';
          let verifyPassed = true;
          try {
            verifyOutput = execFileSync('npm', ['test', '--', '--ci', '--passWithNoTests'], {
              cwd: projectDir, stdio: 'pipe', timeout: 60000, encoding: 'utf-8',
            });
          } catch (verifyErr) {
            verifyPassed = false;
            verifyOutput = (verifyErr.stdout || '') + (verifyErr.stderr || '');
          }

          if (broadcast) {
            if (verifyOutput) {
              broadcast({ type: 'fix_output', findingId, line: `\n[VERIFY] ${verifyPassed ? 'Tests passed' : 'Tests failed'}\n` });
            }
            broadcast({
              type: 'fix_complete',
              findingId,
              success: success && verifyPassed,
              output: output + '\n\n--- Verification ---\n' + verifyOutput,
              agent,
              verifyPassed,
            });
            // Reset agent status
            broadcast({
              type: 'agent_update',
              agent,
              status: 'idle',
              task: null,
            });
          }
        },
      );

      // Stream output
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
      res.end(JSON.stringify({ ok: true, findingId, mode: 'agent', agent }));
      return true;
    }

    // Mode: direct — simple npm commands with post-verify
    if (!fix) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'fix string required' }));
      return true;
    }

    if (!isCommandSafe(fix)) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Command not allowed. Only npm/npx/node commands are permitted.' }));
      return true;
    }

    const parts = fix.trim().split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1);

    const child = execFile(
      cmd, args,
      { cwd: projectDir, timeout: 60000 },
      (err, stdout, stderr) => {
        const fixOutput = (stdout || '') + (stderr || '');
        const fixSuccess = !err;

        // Post-verify for simple fixes too
        let verifyPassed = true;
        if (fixSuccess && isSimpleFix(fix)) {
          try {
            execFileSync('npx', ['tsc', '--noEmit'], {
              cwd: projectDir, stdio: 'pipe', timeout: 30000,
            });
          } catch {
            verifyPassed = false;
          }
        }

        if (broadcast) {
          if (!verifyPassed) {
            broadcast({ type: 'fix_output', findingId, line: '\n[VERIFY] TypeScript check failed after fix — review manually\n' });
          }
          broadcast({
            type: 'fix_complete',
            findingId,
            success: fixSuccess,
            output: fixOutput,
            verifyPassed,
          });
        }
      },
    );

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
    res.end(JSON.stringify({ ok: true, findingId, command: fix, mode: 'direct' }));
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }

  return true;
}

module.exports = { handleIssueFix, handleFixCapabilities };
