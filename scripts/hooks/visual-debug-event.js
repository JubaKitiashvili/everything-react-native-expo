#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');

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

const DASHBOARD_PORT = parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);

const toolName = hookContext.tool_name || hookContext.toolName || '';
const toolInput = hookContext.tool_input || hookContext.toolInput || {};
const prompt = toolInput.prompt || toolInput.description || '';
const lower = prompt.toLowerCase();

if (toolName !== 'Agent' || !lower.includes('visual-debugger')) {
  process.exit(0);
}

let eventType = null;
if (lower.includes('screenshot') || lower.includes('capture')) {
  eventType = 'visual-debug:screenshot';
} else if (lower.includes('fix') || lower.includes('edit') || lower.includes('style')) {
  eventType = 'visual-debug:fix';
} else if (lower.includes('compare') || lower.includes('before') || lower.includes('after')) {
  eventType = 'visual-debug:compare';
}

if (!eventType) {
  process.exit(0);
}

const payload = JSON.stringify({
  type: eventType,
  agent: 'visual-debugger',
  task: prompt.slice(0, 100).split('\n')[0],
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
