'use strict';

const http = require('http');

let resolveDashboardPort;
try {
  resolveDashboardPort = require('../scripts/hooks/lib/port-registry').resolveDashboardPort;
} catch {
  resolveDashboardPort = () => parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);
}
const DASHBOARD_PORT = resolveDashboardPort();

/**
 * Fire-and-forget POST to the ERNE dashboard events endpoint.
 *
 * Valid types:
 *   worker:start, worker:poll, worker:task-start, worker:task-complete,
 *   worker:idle, worker:ticket-rejected, worker:confidence-scored,
 *   worker:tests-run, worker:health-delta
 *
 * Catches ALL errors silently — never blocks the caller.
 *
 * @param {string} type - Event type
 * @param {object} [data] - Additional event data
 */
function publishDashboardEvent(type, data) {
  try {
    const payload = JSON.stringify({ type, ...(data || {}) });

    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: DASHBOARD_PORT,
        path: '/api/events',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 2000,
      },
      () => { /* response ignored */ }
    );

    req.on('error', () => { /* silent */ });
    req.on('timeout', () => { req.destroy(); });
    req.write(payload);
    req.end();
  } catch {
    // Never throw — fire-and-forget
  }
}

module.exports = { publishDashboardEvent };
