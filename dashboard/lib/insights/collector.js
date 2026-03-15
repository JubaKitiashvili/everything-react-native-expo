'use strict';
const fs = require('fs');
const path = require('path');

function getCachePath(projectDir) {
  return path.join(projectDir, '.erne', 'insights.json');
}

function readSnapshots(projectDir) {
  try {
    var data = JSON.parse(fs.readFileSync(getCachePath(projectDir), 'utf8'));
    return data.snapshots || [];
  } catch (e) {
    return [];
  }
}

function writeSnapshots(projectDir, snapshots) {
  var dir = path.join(projectDir, '.erne');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  // Keep last 90 days
  var trimmed = snapshots.slice(-90);
  fs.writeFileSync(getCachePath(projectDir), JSON.stringify({ snapshots: trimmed }, null, 2));
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function snapshotIfNeeded(projectDir) {
  var snapshots = readSnapshots(projectDir);
  var today = todayStr();
  if (snapshots.some(function (s) { return s.date === today; })) return null;

  var snapshot = takeSnapshot(projectDir);
  if (snapshot) {
    snapshots.push(snapshot);
    writeSnapshots(projectDir, snapshots);
  }
  return snapshot;
}

function takeSnapshot(projectDir) {
  var today = todayStr();
  var snapshot = {
    date: today,
    auditScore: 0,
    dependencies: { total: 0, outdated: 0, major: 0, security: 0 },
    agents: { tasksCompleted: 0, totalWorkTimeMs: 0, mostUsed: null },
    codeHealth: {},
  };

  // Audit score
  try {
    var audit = require('../../../lib/audit');
    var detect = require('../../../lib/detect');
    var detection = detect.detectProject(projectDir);
    var findings = audit.collectFindings(projectDir, detection);
    snapshot.auditScore = findings.score || 0;
  } catch (e) {}

  // Dependencies from upgrades cache
  try {
    var upgCache = JSON.parse(fs.readFileSync(path.join(projectDir, '.erne', 'upgrades.json'), 'utf8'));
    var pkgs = upgCache.packages || [];
    snapshot.dependencies.total = pkgs.length;
    snapshot.dependencies.outdated = pkgs.length;
    snapshot.dependencies.major = pkgs.filter(function (p) { return p.bump === 'major'; }).length;
    snapshot.dependencies.security = 0; // Would need SEC tag data
  } catch (e) {}

  // Agent stats from activity history
  try {
    var histFile = path.join(require('os').homedir(), '.erne', 'activity-history.json');
    var history = JSON.parse(fs.readFileSync(histFile, 'utf8'));
    var counts = {};
    var totalWork = 0;
    var totalTasks = 0;

    for (var agent in history) {
      if (!history.hasOwnProperty(agent)) continue;
      (history[agent] || []).forEach(function (entry) {
        if (entry.type === 'complete') {
          var entryDate = new Date(entry.timestamp).toISOString().split('T')[0];
          if (entryDate === today) {
            totalTasks++;
            totalWork += entry.durationMs || 0;
            counts[agent] = (counts[agent] || 0) + 1;
          }
        }
      });
    }

    snapshot.agents.tasksCompleted = totalTasks;
    snapshot.agents.totalWorkTimeMs = totalWork;

    var mostUsed = null;
    var maxCount = 0;
    for (var a in counts) {
      if (counts[a] > maxCount) { maxCount = counts[a]; mostUsed = a; }
    }
    snapshot.agents.mostUsed = mostUsed;
  } catch (e) {}

  return snapshot;
}

module.exports = {
  readSnapshots: readSnapshots,
  writeSnapshots: writeSnapshots,
  snapshotIfNeeded: snapshotIfNeeded,
  takeSnapshot: takeSnapshot,
};
