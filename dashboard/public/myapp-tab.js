// dashboard/public/myapp-tab.js
(function () {
  'use strict';

  var container = null;
  var data = null;

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'myapp-container';
    tabContent.appendChild(container);
  }

  function activate() {
    container.innerHTML = '<div class="eco-loading">' + '<div class="eco-skeleton"></div>'.repeat(5) + '</div>';
    fetch('/api/myapp/overview')
      .then(function (r) { return r.json(); })
      .then(function (d) { data = d; render(); })
      .catch(function () { container.innerHTML = '<div class="eco-error">Could not load app data.</div>'; });
  }

  function deactivate() {}

  // ─── Main Render ─────────────────────────────────────────────────────────────

  function render() {
    container.innerHTML = '';

    // Top row: Overview + MCP
    var topRow = el('div', 'myapp-top-row');
    topRow.appendChild(renderOverview());
    topRow.appendChild(renderMcp());
    container.appendChild(topRow);

    // Project Audit
    if (data.audit) {
      container.appendChild(renderAudit());
    }

    // Quick Actions
    container.appendChild(renderQuickActions());

    // Updates
    if (data.updates && data.updates.length > 0) {
      container.appendChild(renderUpdates());
    }

    // Recommendations
    if (data.recommendations && data.recommendations.length > 0) {
      container.appendChild(renderRecommendations());
    }

    // Recent Fixes
    if (data.fixes && data.fixes.length > 0) {
      container.appendChild(renderFixes());
    }

    // Environment (loaded async)
    var envSection = el('div', 'myapp-section');
    envSection.innerHTML = '<h3 class="myapp-section-title">Environment</h3><div class="myapp-env-loading">Checking...</div>';
    container.appendChild(envSection);
    fetch('/api/myapp/environment')
      .then(function (r) { return r.json(); })
      .then(function (envData) { renderEnvironment(envSection, envData.checks || []); })
      .catch(function () { envSection.querySelector('.myapp-env-loading').textContent = 'Could not check environment.'; });
  }

  // ─── App Overview ────────────────────────────────────────────────────────────

  function renderOverview() {
    var section = el('div', 'myapp-overview');
    var det = data.detection || {};
    var stack = det.stack || {};
    var framework = det.framework || 'unknown';
    var frameworkLabel = { 'expo-managed': 'Expo (managed)', 'expo-bare': 'Expo (bare)', 'bare-rn': 'Bare React Native' }[framework] || framework;

    var scoreHtml = '';
    if (data.audit) {
      var score = data.audit.score;
      var grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : 'D';
      var gradeColor = score >= 90 ? 'green' : score >= 75 ? 'blue' : score >= 60 ? 'orange' : 'red';
      scoreHtml = '<div class="myapp-health"><span class="myapp-grade ' + gradeColor + '">' + grade + '</span><span class="myapp-score">' + score + '/100</span></div>';
    }

    var stackItems = [];
    if (stack.state && stack.state !== 'none') stackItems.push(esc(stack.state));
    if (stack.navigation && stack.navigation !== 'none') stackItems.push(esc(stack.navigation));
    if (stack.styling && stack.styling !== 'stylesheet') stackItems.push(esc(stack.styling));
    if (stack.lists && stack.lists !== 'flatlist') stackItems.push(esc(stack.lists));
    if (stack.serverState && stack.serverState !== 'none') stackItems.push(esc(stack.serverState));
    if (stack.forms && stack.forms !== 'none') stackItems.push(esc(stack.forms));
    if (stack.testing && stack.testing !== 'none') stackItems.push(esc(stack.testing));
    if (stack.build && stack.build !== 'manual') stackItems.push(esc(stack.build));

    section.innerHTML =
      '<h3 class="myapp-section-title">App Overview</h3>' +
      '<div class="myapp-app-name">' + esc(data.project.name) + ' <span class="myapp-version">v' + esc(data.project.version) + '</span></div>' +
      '<div class="myapp-framework">' + esc(frameworkLabel) + (det.hasTypescript ? ' &middot; TypeScript' : '') + (det.hasNewArch ? ' &middot; New Arch' : '') + '</div>' +
      scoreHtml +
      (stackItems.length > 0 ? '<div class="myapp-stack">' + stackItems.map(function (s) { return '<span class="myapp-chip">' + s + '</span>'; }).join('') + '</div>' : '');

    return section;
  }

  // ─── Project Audit ──────────────────────────────────────────────────────────

  function renderAudit() {
    var section = el('div', 'myapp-section myapp-audit');
    var audit = data.audit;
    var score = audit.score;
    var findings = audit.findings || [];
    var strengths = audit.strengths || [];

    var critical = findings.filter(function (f) { return f.severity === 'critical'; }).length;
    var warnings = findings.filter(function (f) { return f.severity === 'warning'; }).length;
    var good = strengths.length;

    // Score bar color
    var barColor = score >= 90 ? '#4CAF50' : score >= 75 ? '#2196F3' : score >= 60 ? '#FF9800' : '#F44336';

    var html = '<h3 class="myapp-section-title">Project Audit</h3>';

    // Score header
    html += '<div class="audit-score-row">' +
      '<span class="audit-score-num">' + score + '</span>' +
      '<div class="audit-score-bar-wrap">' +
        '<div class="audit-score-bar" style="width:' + Math.max(0, Math.min(100, score)) + '%;background:' + barColor + '"></div>' +
      '</div>' +
    '</div>';

    // Summary counts
    html += '<div class="audit-counts">' +
      '<span class="audit-count critical">' + critical + ' critical</span>' +
      '<span class="audit-count warn">' + warnings + ' warn</span>' +
      '<span class="audit-count good">' + good + ' good</span>' +
    '</div>';

    // Findings
    if (findings.length > 0) {
      html += '<div class="audit-findings">';
      findings.forEach(function (f) {
        var icon = f.severity === 'critical' ? '!!' : f.severity === 'warning' ? '⚠' : '→';
        var sevClass = f.severity === 'critical' ? 'critical' : f.severity === 'warning' ? 'warn' : 'info';
        html += '<div class="audit-finding">' +
          '<span class="audit-finding-icon ' + sevClass + '">' + icon + '</span>' +
          '<span class="audit-finding-text">' + esc(f.title) + '</span>' +
          (f.fix ? '<span class="audit-fix-badge" title="' + esc(f.fix) + '">FIX</span>' : '') +
        '</div>';
      });
      html += '</div>';
    }

    // Strengths
    if (strengths.length > 0) {
      html += '<div class="audit-strengths-label">STRENGTHS</div>';
      html += '<div class="audit-strengths">';
      strengths.forEach(function (s) {
        html += '<div class="audit-strength">✓ ' + esc(s.title) + '</div>';
      });
      html += '</div>';
    }

    section.innerHTML = html;
    return section;
  }

  // ─── MCP Integrations ──────────────────────────────────────────────────────

  function renderMcp() {
    var section = el('div', 'myapp-mcp');
    section.innerHTML = '<h3 class="myapp-section-title">MCP Integrations</h3>';

    var list = el('div', 'myapp-mcp-list');
    (data.mcp || []).forEach(function (mcp) {
      var row = el('div', 'myapp-mcp-row' + (mcp.installed ? ' installed' : ''));
      var status = mcp.installed ? '<span class="myapp-mcp-dot on"></span>' : '<span class="myapp-mcp-dot off"></span>';
      row.innerHTML =
        status +
        '<div class="myapp-mcp-info">' +
          '<div class="myapp-mcp-name">' + esc(mcp.id) + '</div>' +
          '<div class="myapp-mcp-desc">' + esc(mcp.description) + '</div>' +
        '</div>' +
        (!mcp.installed && mcp.requires.length > 0 ? '<div class="myapp-mcp-req">Needs: ' + esc(mcp.requires.join(', ')) + '</div>' : '');
      list.appendChild(row);
    });
    section.appendChild(list);
    return section;
  }

  // ─── Quick Actions ─────────────────────────────────────────────────────────

  function renderQuickActions() {
    var section = el('div', 'myapp-section');
    section.innerHTML = '<h3 class="myapp-section-title">Quick Actions</h3>';
    var grid = el('div', 'myapp-actions');

    var ICONS = { play: '▶', build: '🔨', test: '✓', lint: '◉', tool: '⚙' };

    (data.quickActions || []).forEach(function (action) {
      var btn = document.createElement('button');
      btn.className = 'myapp-action-btn';
      btn.innerHTML = '<span class="myapp-action-icon">' + (ICONS[action.icon] || '●') + '</span>' + esc(action.label);
      btn.addEventListener('click', function () { runAction(action, btn); });
      grid.appendChild(btn);
    });

    section.appendChild(grid);
    return section;
  }

  function runAction(action, btn) {
    var originalText = btn.innerHTML;
    btn.disabled = true;
    btn.classList.add('running');
    btn.innerHTML = '<span class="myapp-action-icon">⏳</span>Running...';

    fetch('/api/myapp/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cmd: action.cmd, args: action.args }),
    })
    .then(function (r) { return r.json(); })
    .then(function (result) {
      btn.classList.remove('running');
      if (result.success) {
        btn.innerHTML = '<span class="myapp-action-icon">✓</span>Done!';
        btn.classList.add('success');
      } else {
        btn.innerHTML = '<span class="myapp-action-icon">✗</span>Failed';
        btn.classList.add('failed');
        btn.title = result.error || 'Unknown error';
      }
      setTimeout(function () {
        btn.innerHTML = originalText;
        btn.disabled = false;
        btn.classList.remove('success', 'failed');
      }, 3000);
    })
    .catch(function () {
      btn.innerHTML = originalText;
      btn.disabled = false;
      btn.classList.remove('running');
    });
  }

  // ─── Updates ───────────────────────────────────────────────────────────────

  function renderUpdates() {
    var section = el('div', 'myapp-section');
    var count = data.updates.length;
    section.innerHTML = '<h3 class="myapp-section-title">Updates Available <span class="myapp-count">' + count + '</span></h3>';

    var list = el('div', 'myapp-updates');
    var BUMP_COLORS = { major: 'red', minor: 'orange', patch: 'green' };

    data.updates.forEach(function (pkg) {
      var row = el('div', 'myapp-update-row');
      var safeBump = esc(pkg.bump);
      var safeRisk = parseInt(pkg.risk, 10) || 0;
      var dots = '';
      for (var i = 1; i <= 5; i++) dots += i <= safeRisk ? '●' : '○';

      row.innerHTML =
        '<span class="myapp-pkg-name">' + esc(pkg.name) + '</span>' +
        '<span class="myapp-pkg-ver">' + esc(pkg.current) + ' → ' + esc(pkg.latest) + '</span>' +
        '<span class="myapp-bump ' + (BUMP_COLORS[pkg.bump] || '') + '">' + safeBump + '</span>' +
        '<span class="myapp-risk risk-' + safeRisk + '">' + dots + '</span>';
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  }

  // ─── Recommendations ──────────────────────────────────────────────────────

  function renderRecommendations() {
    var section = el('div', 'myapp-section');
    section.innerHTML = '<h3 class="myapp-section-title">Recommendations <span class="myapp-count">' + data.recommendations.length + '</span></h3>';

    var list = el('div', 'myapp-recs');
    data.recommendations.forEach(function (rec) {
      var row = el('div', 'myapp-rec-row');
      var icon = rec.severity === 'warning' ? '⚠' : 'ℹ';
      var sevClass = rec.severity === 'warning' ? 'warn' : 'info';
      row.innerHTML =
        '<span class="myapp-rec-icon ' + sevClass + '">' + icon + '</span>' +
        '<div class="myapp-rec-content">' +
          '<div class="myapp-rec-title">' + esc(rec.title) + '</div>' +
          '<div class="myapp-rec-detail">' + esc(rec.detail) + '</div>' +
          (rec.fix ? '<div class="myapp-rec-fix">' + esc(rec.fix) + '</div>' : '') +
        '</div>' +
        '<span class="myapp-rec-cat">' + esc(rec.category) + '</span>';
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  }

  // ─── Recent Fixes ─────────────────────────────────────────────────────────

  function renderFixes() {
    var section = el('div', 'myapp-section');
    section.innerHTML = '<h3 class="myapp-section-title">Recent Fixes</h3>';

    var list = el('div', 'myapp-fixes');
    data.fixes.slice(0, 10).forEach(function (fix) {
      var row = el('div', 'myapp-fix-row');
      row.innerHTML =
        '<span class="myapp-fix-check">✓</span>' +
        '<div class="myapp-fix-content">' +
          '<div class="myapp-fix-task">' + esc(fix.task) + '</div>' +
          '<div class="myapp-fix-meta">' + esc(fix.agent) + ' &middot; ' + formatTimeAgo(fix.timestamp) + '</div>' +
        '</div>';
      list.appendChild(row);
    });

    section.appendChild(list);
    return section;
  }

  // ─── Environment ──────────────────────────────────────────────────────────

  function renderEnvironment(section, checks) {
    var loading = section.querySelector('.myapp-env-loading');
    if (loading) loading.remove();

    var grid = el('div', 'myapp-env-grid');
    checks.forEach(function (check) {
      var item = el('div', 'myapp-env-item' + (check.ok ? ' ok' : ' missing'));
      item.innerHTML =
        '<span class="myapp-env-status">' + (check.ok ? '✓' : '✗') + '</span>' +
        '<span class="myapp-env-name">' + esc(check.name) + '</span>' +
        '<span class="myapp-env-ver">' + (check.version ? esc(check.version) : 'not found') + '</span>';
      grid.appendChild(item);
    });

    section.appendChild(grid);
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function el(tag, className) {
    var e = document.createElement(tag);
    if (className) e.className = className;
    return e;
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatTimeAgo(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  Tabs.registerTab('myapp', { init: init, activate: activate, deactivate: deactivate });
})();
