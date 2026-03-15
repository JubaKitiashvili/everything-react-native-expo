'use strict';

function computeTrend(snapshots, field) {
  if (!snapshots || snapshots.length === 0) {
    return { current: 0, delta: 0, direction: 'flat', sparkline: [] };
  }

  var sorted = snapshots.slice().sort(function (a, b) {
    return a.date < b.date ? -1 : 1;
  });

  // Extract sparkline data (last 30 points)
  var sparkline = sorted.slice(-30).map(function (s) {
    // Handle nested fields like 'dependencies.outdated'
    var parts = field.split('.');
    var val = s;
    for (var i = 0; i < parts.length; i++) {
      val = val ? val[parts[i]] : 0;
    }
    return val || 0;
  });

  var current = sparkline[sparkline.length - 1];
  var first = sparkline[0];
  var delta = current - first;
  var direction = delta > 0 ? 'up' : delta < 0 ? 'down' : 'flat';

  return { current: current, delta: delta, direction: direction, sparkline: sparkline };
}

function computeAgentUtilization(history) {
  var agents = {};
  var totalMs = 0;

  for (var name in history) {
    if (!history.hasOwnProperty(name)) continue;
    var entries = history[name] || [];
    var agentMs = 0;
    entries.forEach(function (e) {
      if (e.type === 'complete' && e.durationMs) agentMs += e.durationMs;
    });
    if (agentMs > 0) {
      agents[name] = agentMs;
      totalMs += agentMs;
    }
  }

  if (totalMs === 0) return [];

  var result = [];
  for (var n in agents) {
    result.push({ name: n, ms: agents[n], pct: Math.round((agents[n] / totalMs) * 100) });
  }
  result.sort(function (a, b) { return b.pct - a.pct; });
  return result;
}

module.exports = { computeTrend: computeTrend, computeAgentUtilization: computeAgentUtilization };
