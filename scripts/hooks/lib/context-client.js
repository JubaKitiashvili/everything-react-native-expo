'use strict';
const http = require('node:http');

const PORT = parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);
const HOST = '127.0.0.1';

/**
 * Send data to Dashboard Server — fire-and-forget (non-blocking)
 */
function sendAsync(endpoint, data) {
  const payload = JSON.stringify(data);
  const req = http.request({
    hostname: HOST, port: PORT,
    path: `/api/context/${endpoint}`,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    timeout: 500
  });
  req.on('error', () => {}); // silent failure
  req.write(payload);
  req.end();
}

/**
 * Send data to Dashboard Server — blocking (waits for response)
 */
function sendSync(endpoint, data, timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data);
    const req = http.request({
      hostname: HOST, port: PORT,
      path: `/api/context/${endpoint}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.write(payload);
    req.end();
  });
}

/**
 * GET from Dashboard Server
 */
function getSync(endpoint, timeoutMs = 500) {
  return new Promise((resolve, reject) => {
    const req = http.request({
      hostname: HOST, port: PORT,
      path: `/api/context/${endpoint}`,
      method: 'GET',
      timeout: timeoutMs
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); } catch { resolve(body); }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
    req.end();
  });
}

module.exports = { sendAsync, sendSync, getSync };
