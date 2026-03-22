#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');

// Read stdin
let stdinData = '';
try {
  stdinData = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let hookContext;
try {
  hookContext = JSON.parse(stdinData);
} catch {
  process.exit(0);
}

const { resolveDashboardPort } = require('./lib/port-registry');
const DASHBOARD_PORT = resolveDashboardPort();

const AGENT_KEYWORDS = [
  'architect', 'code-reviewer', 'tdd-guide', 'performance-profiler',
  'native-bridge-builder', 'expo-config-resolver', 'ui-designer', 'upgrade-assistant',
  'senior-developer', 'feature-builder', 'pipeline-orchestrator', 'visual-debugger',
  'documentation-generator',
];

function detectAgent(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const keyword of AGENT_KEYWORDS) {
    if (lower.includes(keyword)) return keyword;
  }
  return null;
}

function extractTaskDescription(text) {
  if (!text) return '';
  return text.slice(0, 100).split('\n')[0];
}

const event = hookContext.event || '';
const toolName = hookContext.tool_name || hookContext.toolName || '';
const toolInput = hookContext.tool_input || hookContext.toolInput || {};

if (toolName !== 'Agent' && toolName !== 'agent') {
  process.exit(0);
}

const prompt = toolInput.prompt || toolInput.description || '';
const agentName = detectAgent(prompt);

if (!agentName) {
  process.exit(0);
}

let eventType;
if (event.toLowerCase().includes('pre')) {
  eventType = 'agent:start';
} else if (event.toLowerCase().includes('post')) {
  eventType = 'agent:complete';
} else {
  process.exit(0);
}

const payload = JSON.stringify({
  type: eventType,
  agent: agentName,
  task: extractTaskDescription(prompt),
});

const req = http.request(
  {
    hostname: '127.0.0.1',
    port: DASHBOARD_PORT,
    path: '/api/events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout: 2000,
  },
  () => { process.exit(0); }
);

req.on('error', () => { process.exit(0); });
req.on('timeout', () => { req.destroy(); process.exit(0); });
req.write(payload);
req.end();
