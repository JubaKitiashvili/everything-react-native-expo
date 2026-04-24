#!/usr/bin/env node
// Task 117.2 — MCP server CLI entry.
//
// Spawned by Claude Desktop (or any MCP client) over stdio. Reads
// config from environment variables — nothing on stdin/stdout except
// the MCP framing itself, since that's what Claude parses.
//
// Environment:
//   ERNE_DASHBOARD_URL   base URL for the dashboard-server REST API
//                        (default: http://127.0.0.1:3333)
//   ERNE_API_KEY         dashboard API key, when the dashboard has its
//                        /api/* gate enabled (Task 117.61). Optional.
//   ERNE_MCP_TIMEOUT_MS  per-request HTTP timeout. Default 10_000.

import { startMcpServer } from '../dist/server.js';

startMcpServer({
  dashboardUrl: process.env.ERNE_DASHBOARD_URL ?? 'http://127.0.0.1:3333',
  apiKey: process.env.ERNE_API_KEY ?? null,
  timeoutMs: Number.parseInt(process.env.ERNE_MCP_TIMEOUT_MS ?? '', 10) || 10_000,
}).catch((err) => {
  // stderr is safe to write to — MCP parses stdout only.
  console.error('[erne-monitor-mcp] fatal:', err);
  process.exit(1);
});
