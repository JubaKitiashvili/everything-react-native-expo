#!/usr/bin/env node
'use strict';
const http = require('node:http');
const readline = require('node:readline');

const PORT = parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);

function dashboardRequest(endpoint, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: '127.0.0.1', port: PORT,
      path: `/api/context/${endpoint}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: 30000
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => { try { resolve(JSON.parse(body)); } catch { resolve({ output: body }); } });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// MCP stdio protocol
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', async (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.method === 'initialize') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {
        protocolVersion: '2024-11-05', capabilities: { tools: {} },
        serverInfo: { name: 'erne-context', version: '0.1.0' }
      }}));
    } else if (msg.method === 'tools/list') {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [
        { name: 'ctx_execute', description: 'Run command in sandbox with smart truncation', inputSchema: {
          type: 'object', properties: { command: { type: 'string' }, original_tool: { type: 'string' } }, required: ['command'] }},
        { name: 'ctx_search', description: 'Search ERNE knowledge base (FTS5)', inputSchema: {
          type: 'object', properties: { query: { type: 'string' }, category: { type: 'string' } }, required: ['query'] }},
        { name: 'ctx_session', description: 'Get/restore session state', inputSchema: {
          type: 'object', properties: { action: { type: 'string', enum: ['snapshot', 'stats', 'full'] } }, required: ['action'] }}
      ]}}));
    } else if (msg.method === 'tools/call') {
      const { name, arguments: args } = msg.params;
      const endpoint = name === 'ctx_execute' ? 'execute' : name === 'ctx_search' ? 'search' : 'stats';
      const result = await dashboardRequest(endpoint, args);
      console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {
        content: [{ type: 'text', text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) }]
      }}));
    } else if (msg.method === 'notifications/initialized') {
      // ignore
    } else {
      console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, error: { code: -32601, message: 'Method not found' } }));
    }
  } catch (err) {
    // ignore malformed input
  }
});
