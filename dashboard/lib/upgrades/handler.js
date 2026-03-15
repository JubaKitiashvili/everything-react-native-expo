// dashboard/lib/upgrades/handler.js
'use strict';
const scanner = require('./scanner');
const planner = require('./planner');
const { execFile } = require('child_process');

var pendingScan = null;

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handler(req, res, urlPath, body) {
  var projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

  // GET /api/upgrades/scan — return cached or trigger background rescan
  if (req.method === 'GET' && urlPath === '/api/upgrades/scan') {
    var cache = scanner.readCache(projectDir);
    var stale = !cache || (Date.now() - new Date(cache.lastScanned).getTime() > 3600000);

    if (stale && !pendingScan) {
      pendingScan = scanner.scanDependencies(projectDir).then(function (packages) {
        var data = { lastScanned: new Date().toISOString(), packages: packages };
        scanner.writeCache(projectDir, data);
        pendingScan = null;
        if (handler.broadcast) handler.broadcast({ type: 'upgrade_available', count: packages.length });
        return data;
      }).catch(function () { pendingScan = null; });
    }

    if (cache) {
      return sendJSON(res, 200, Object.assign({}, cache, { stale: stale }));
    }
    // No cache — wait for scan
    if (pendingScan) {
      pendingScan.then(function (data) { sendJSON(res, 200, data || { packages: [], lastScanned: null }); });
    } else {
      sendJSON(res, 200, { packages: [], lastScanned: null, empty: true });
    }
    return;
  }

  // POST /api/upgrades/refresh — force rescan
  if (req.method === 'POST' && urlPath === '/api/upgrades/refresh') {
    scanner.scanDependencies(projectDir).then(function (packages) {
      var data = { lastScanned: new Date().toISOString(), packages: packages };
      scanner.writeCache(projectDir, data);
      sendJSON(res, 200, data);
    }).catch(function (err) { sendJSON(res, 500, { error: err.message }); });
    return;
  }

  // POST /api/upgrades/update — run npm install <pkg>@<version>
  if (req.method === 'POST' && urlPath === '/api/upgrades/update') {
    var parsed;
    try { parsed = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
    if (!parsed.package || !parsed.version) return sendJSON(res, 400, { error: 'Missing package or version' });

    // Validate package name (prevent injection)
    if (!/^[@a-z0-9][\w./-]*$/i.test(parsed.package)) return sendJSON(res, 400, { error: 'Invalid package name' });

    execFile('npm', ['install', parsed.package + '@' + parsed.version], { cwd: projectDir, timeout: 60000 }, function (err, stdout, stderr) {
      if (err) return sendJSON(res, 500, { error: stderr || err.message });
      sendJSON(res, 200, { success: true, output: stdout });
    });
    return;
  }

  // POST /api/upgrades/plan — trigger upgrade-assistant
  if (req.method === 'POST' && urlPath === '/api/upgrades/plan') {
    var planReq;
    try { planReq = typeof body === 'string' ? JSON.parse(body) : body; } catch (e) { return sendJSON(res, 400, { error: 'Invalid JSON' }); }
    // Check if upgrade-assistant is busy
    if (handler.getAgentStatus && handler.getAgentStatus('upgrade-assistant') !== 'idle') {
      return sendJSON(res, 200, { status: 'queued', message: 'upgrade-assistant is currently busy' });
    }
    // Dispatch agent event
    if (handler.postEvent) {
      handler.postEvent({
        type: 'agent:start',
        agent: 'upgrade-assistant',
        task: 'Plan migration: ' + planReq.package + ' ' + planReq.from + ' → ' + planReq.to,
      });
    }
    return sendJSON(res, 200, { status: 'started' });
  }

  // GET /api/upgrades/plan/:package
  var planMatch = urlPath.match(/^\/api\/upgrades\/plan\/(.+)$/);
  if (req.method === 'GET' && planMatch) {
    var plan = planner.readPlan(projectDir, decodeURIComponent(planMatch[1]));
    if (plan) return sendJSON(res, 200, plan);
    return sendJSON(res, 404, { error: 'No plan found' });
  }

  sendJSON(res, 404, { error: 'Not found' });
}

handler.broadcast = null;
handler.getAgentStatus = null;
handler.postEvent = null;

module.exports = handler;
