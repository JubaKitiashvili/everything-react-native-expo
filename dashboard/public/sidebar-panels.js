'use strict';

// ─── System Info Panel ────────────────────────────────────────────────────────
(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function load() {
    var el = document.getElementById('system-info-panel');
    if (!el) return;

    // Render h3 + content container immediately so collapsible logic can wrap it
    el.innerHTML = '<h3>System Info</h3><div id="sip-content"><div class="sip-loading">Loading...</div></div>';

    Promise.all([
      fetch('/api/myapp/overview').then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch('/api/myapp/environment').then(function (r) { return r.json(); }).catch(function () { return { checks: [] }; })
    ]).then(function (results) {
      render(results[0], results[1]);
    });
  }

  function render(overview, env) {
    // Find the content container (may be inside ctx-panel-body after collapsible wrapping)
    var content = document.getElementById('sip-content');
    if (!content) return;

    var project = overview.project || {};
    var det = overview.detection || {};
    var framework = det.framework || 'unknown';
    var frameworkLabel = { 'expo-managed': 'Expo (managed)', 'expo-bare': 'Expo (bare)', 'bare-rn': 'Bare React Native' }[framework] || framework;

    var html = '';

    // Project info
    html += '<div class="sip-group">';
    html += '<div class="sip-row"><span class="sip-label">Project</span><span class="sip-value">' + esc(project.name) + '</span></div>';
    html += '<div class="sip-row"><span class="sip-label">Version</span><span class="sip-value">' + esc(project.version) + '</span></div>';
    html += '<div class="sip-row"><span class="sip-label">Framework</span><span class="sip-value">' + esc(frameworkLabel) + '</span></div>';
    if (det.hasTypescript) {
      html += '<div class="sip-row"><span class="sip-label">TypeScript</span><span class="sip-value sip-on">Yes</span></div>';
    }
    if (det.hasNewArch) {
      html += '<div class="sip-row"><span class="sip-label">New Arch</span><span class="sip-value sip-on">Yes</span></div>';
    }
    html += '</div>';

    // Environment
    var checks = env.checks || [];
    if (checks.length > 0) {
      html += '<div class="sip-divider"></div>';
      html += '<div class="sip-group">';
      checks.forEach(function (c) {
        html += '<div class="sip-row">' +
          '<span class="sip-label">' + esc(c.name) + '</span>' +
          '<span class="sip-value ' + (c.ok ? 'sip-on' : 'sip-off') + '">' + (c.version ? esc(c.version) : (c.ok ? 'OK' : 'Missing')) + '</span>' +
        '</div>';
      });
      html += '</div>';
    }

    // Git branch
    html += '<div class="sip-divider"></div>';
    html += '<div class="sip-group" id="sip-git"><div class="sip-row"><span class="sip-label">Branch</span><span class="sip-value" style="color:var(--text-dim)">checking...</span></div></div>';

    content.innerHTML = html;

    // Fetch git branch
    fetch('/api/myapp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: 'git', args: ['rev-parse', '--abbrev-ref', 'HEAD'] })
    })
    .then(function (r) { return r.json(); })
    .then(function (d) {
      var gitEl = document.getElementById('sip-git');
      if (!gitEl) return;
      var branch = d.success && d.stdout ? d.stdout.trim() : 'unknown';
      gitEl.innerHTML = '<div class="sip-row"><span class="sip-label">Branch</span><span class="sip-value">' + esc(branch) + '</span></div>';
    })
    .catch(function () {});
  }

  document.addEventListener('DOMContentLoaded', load);
})();

// ─── Agent Activity Panel ─────────────────────────────────────────────────────
(function () {
  var MAX_ITEMS = 15;

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTimeAgo(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  function render() {
    var el = document.getElementById('agent-activity-panel');
    if (!el) return;

    var allEntries = window.History && History.getAllEntries ? History.getAllEntries() : [];

    // Only show completed tasks, skip start/planning duplicates
    var unique = [];
    var seen = {};
    allEntries.forEach(function (entry) {
      // Prefer 'complete' entries, skip 'start' and 'planning'
      if (entry.type === 'start' || entry.type === 'planning') return;
      var key = (entry.agent || '') + '|' + (entry.task || entry.description || '');
      if (seen[key]) return;
      seen[key] = true;
      unique.push(entry);
    });
    // If no complete entries, fall back to all entries deduped
    if (unique.length === 0) {
      seen = {};
      allEntries.forEach(function (entry) {
        var key = (entry.agent || '') + '|' + (entry.task || entry.description || '');
        if (seen[key]) return;
        seen[key] = true;
        unique.push(entry);
      });
    }

    if (unique.length === 0) {
      el.innerHTML = '<h3>Agent Activity</h3><div id="aap-content"><div class="aap-empty">No activity yet</div></div>';
      return;
    }

    var html = '<h3>Agent Activity</h3><div id="aap-content">';

    // Stats summary
    var agents = {};
    unique.forEach(function (entry) {
      var name = entry.agent || 'unknown';
      if (!agents[name]) agents[name] = 0;
      agents[name]++;
    });
    var agentCount = Object.keys(agents).length;
    var topAgent = '';
    var topCount = 0;
    for (var a in agents) {
      if (agents[a] > topCount) { topCount = agents[a]; topAgent = a; }
    }

    html += '<div class="aap-stats">' +
      '<div class="aap-stat"><span class="aap-stat-num">' + unique.length + '</span><span class="aap-stat-label">tasks</span></div>' +
      '<div class="aap-stat"><span class="aap-stat-num">' + agentCount + '</span><span class="aap-stat-label">agents</span></div>' +
      (topAgent ? '<div class="aap-stat"><span class="aap-stat-num aap-top">' + esc(topAgent) + '</span><span class="aap-stat-label">most active</span></div>' : '') +
    '</div>';

    // Recent entries
    html += '<div class="aap-list">';
    var recent = unique.slice(0, MAX_ITEMS);
    recent.forEach(function (entry) {
      var time = formatTimeAgo(entry.timestamp || entry.completedAt);
      html += '<div class="aap-item">' +
        '<span class="aap-dot"></span>' +
        '<div class="aap-item-content">' +
          '<div class="aap-item-task">' + esc(entry.task || entry.description || '') + '</div>' +
          '<div class="aap-item-meta">' + esc(entry.agent || '') + (time ? ' &middot; ' + time : '') + '</div>' +
        '</div>' +
      '</div>';
    });
    html += '</div>';
    html += '</div>';

    el.innerHTML = html;
  }

  // Re-render when history updates
  function hookHistory() {
    if (!window.History || !History.setHistory) {
      setTimeout(hookHistory, 500);
      return;
    }
    var origSetHistory = History.setHistory;
    History.setHistory = function (h) {
      origSetHistory(h);
      render();
    };
    render();
  }

  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(hookHistory, 500);
  });
})();
