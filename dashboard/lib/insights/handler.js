'use strict';
const collector = require('./collector');
const trends = require('./trends');
const fs = require('fs');
const path = require('path');

function sendJSON(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handler(req, res, urlPath, body) {
  var projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

  // GET /api/insights/snapshots
  if (req.method === 'GET' && urlPath === '/api/insights/snapshots') {
    var snapshots = collector.readSnapshots(projectDir);
    return sendJSON(res, 200, { snapshots: snapshots });
  }

  // POST /api/insights/snapshot — force snapshot
  if (req.method === 'POST' && urlPath === '/api/insights/snapshot') {
    var snapshot = collector.takeSnapshot(projectDir);
    var all = collector.readSnapshots(projectDir);
    // Replace today's if exists, else append
    var today = new Date().toISOString().split('T')[0];
    var filtered = all.filter(function (s) { return s.date !== today; });
    filtered.push(snapshot);
    collector.writeSnapshots(projectDir, filtered);
    return sendJSON(res, 200, snapshot);
  }

  // GET /api/insights/agents
  if (req.method === 'GET' && urlPath === '/api/insights/agents') {
    try {
      var histFile = path.join(require('os').homedir(), '.erne', 'activity-history.json');
      var history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
      var utilization = trends.computeAgentUtilization(history);
      return sendJSON(res, 200, { agents: utilization });
    } catch (e) {
      return sendJSON(res, 200, { agents: [] });
    }
  }

  sendJSON(res, 404, { error: 'Not found' });
}

handler.autoSnapshot = function (projectDir) {
  collector.snapshotIfNeeded(projectDir);
};

module.exports = handler;
