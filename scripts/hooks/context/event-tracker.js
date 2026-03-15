'use strict';
const { readStdin } = require('../lib/hook-utils');
const { sendAsync } = require('../lib/context-client');

const input = readStdin();
if (!input) process.exit(0);

const toolName = input.tool_name;
const toolInput = input.tool_input || {};
const toolOutput = input.tool_output || {};

// Map tool calls to event types
function classifyEvent(name, inp, out) {
  switch (name) {
    case 'Write': return { type: 'file_create', data: { path: inp.file_path } };
    case 'Edit': return { type: 'file_modify', data: { path: inp.file_path } };
    case 'Read': return { type: 'file_read', data: { path: inp.file_path } };
    case 'Grep':
    case 'Glob': return { type: 'search', data: { query: inp.pattern, results: 0 } };
    case 'Bash': return classifyBash(inp, out);
    case 'Agent': return classifyAgent(inp, out);
    default: return null;
  }
}

function classifyBash(inp, out) {
  const cmd = inp.command || '';
  const exitCode = out.exit_code || 0;

  if (exitCode !== 0) return { type: 'error', data: { command: cmd, stderr: (out.stderr || '').slice(0, 500), exit_code: exitCode } };
  if (/git commit/.test(cmd)) {
    const sha = ((out.stdout || '').match(/\[[\w-]+ ([a-f0-9]+)\]/) || [])[1] || '';
    const msg = ((out.stdout || '').match(/\] (.+)/) || [])[1] || cmd;
    return { type: 'git_commit', data: { sha, message: msg } };
  }
  if (/npm test|jest|vitest|node --test/.test(cmd)) {
    const stdout = out.stdout || '';
    const passed = (stdout.match(/(\d+) pass/i) || [])[1] || 0;
    const failed = (stdout.match(/(\d+) fail/i) || [])[1] || 0;
    return { type: 'test_run', data: { passed: +passed, failed: +failed, total: +passed + +failed } };
  }
  if (/npm install|yarn add|pnpm add/.test(cmd)) {
    return { type: 'dependency_add', data: { command: cmd } };
  }
  return null;
}

function classifyAgent(inp, out) {
  const prompt = inp.prompt || inp.description || '';
  const agents = ['architect', 'senior-developer', 'feature-builder', 'code-reviewer',
    'tdd-guide', 'performance-profiler', 'ui-designer', 'native-bridge-builder',
    'expo-config-resolver', 'upgrade-assistant', 'pipeline-orchestrator'];
  const agent = agents.find(a => prompt.toLowerCase().includes(a)) || 'unknown';

  const isComplete = out && (out.content || out.result);
  return {
    type: isComplete ? 'task_complete' : 'task_start',
    data: { agent, task: prompt.slice(0, 200), status: isComplete ? 'success' : 'started' }
  };
}

const event = classifyEvent(toolName, toolInput, toolOutput);
if (event) {
  sendAsync('event', { event_type: event.type, data: event.data });
}
