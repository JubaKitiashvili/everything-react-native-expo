'use strict';

(function () {
  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  var AuditPanel = {
    data: null,
    expanded: true,
    initialized: false,

    load: function () {
      var el = document.getElementById('audit-panel');
      if (!el) return;

      // Set up stable structure: h3 (for collapsible) + content div
      el.innerHTML = '<h3>Project Audit</h3><div id="audit-content"></div>';
      this.initialized = true;

      fetch('/api/audit')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.score !== null && data.score !== undefined) {
            AuditPanel.data = data;
            AuditPanel.render();
          } else {
            // No cached audit — auto-run one
            AuditPanel.runAudit();
          }
        })
        .catch(function () { AuditPanel.runAudit(); });
    },

    runAudit: function () {
      var content = document.getElementById('audit-content');
      if (content) content.innerHTML = '<p style="color:#888;font-size:12px;margin:8px 0">Scanning...</p>';
      fetch('/api/audit/run', { method: 'POST' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          AuditPanel.data = data;
          AuditPanel.render();
        })
        .catch(function () {
          if (content) content.innerHTML = '<p style="color:#f44336;font-size:12px;margin:8px 0">Scan failed</p>';
        });
    },

    renderEmpty: function () {
      var content = document.getElementById('audit-content');
      if (!content) return;
      content.innerHTML =
        '<p style="color:#888;font-size:12px;margin:8px 0">No audit data yet</p>' +
        '<button class="ctx-btn" id="audit-run-btn">Run Audit</button>';
      var btn = document.getElementById('audit-run-btn');
      if (btn) btn.addEventListener('click', AuditPanel.runAudit);
    },

    render: function () {
      var content = document.getElementById('audit-content');
      if (!content || !this.data) return;
      var d = this.data;
      var score = d.score || 0;
      var scoreColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#FF9800' : '#f44336';
      var critical = (d.findings || []).filter(function (f) { return f.severity === 'critical'; });
      var warnings = (d.findings || []).filter(function (f) { return f.severity === 'warning'; });
      var info = (d.findings || []).filter(function (f) { return f.severity === 'info'; });
      var strengths = d.strengths || [];

      var html = '';

      // Score gauge
      html += '<div style="display:flex;align-items:center;gap:12px;margin:8px 0">';
      html += '<div style="font-size:28px;font-weight:bold;color:' + scoreColor + ';font-family:monospace">' + score + '</div>';
      html += '<div style="flex:1">';
      html += '<div style="background:#333;height:6px;border-radius:3px"><div style="background:' + scoreColor + ';height:100%;border-radius:3px;width:' + score + '%"></div></div>';
      html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#666"><span>' + critical.length + ' critical</span><span>' + warnings.length + ' warn</span><span>' + strengths.length + ' good</span></div>';
      html += '</div></div>';

      // Always show all findings
      var allFindings = critical.concat(warnings).concat(info);
      if (allFindings.length > 0) {
        html += '<div style="margin-top:8px">';
        allFindings.forEach(function (f) {
          html += AuditPanel.renderFinding(f);
        });
        html += '</div>';
      }

      // Strengths
      if (strengths.length > 0) {
        html += '<div style="margin-top:10px;font-size:10px;color:#4CAF50;text-transform:uppercase;letter-spacing:1px">Strengths</div>';
        strengths.forEach(function (s) {
          html += '<div style="font-size:11px;color:#888;padding:2px 0">' + esc('✓ ' + s.title) + '</div>';
        });
      }

      // Refresh button
      html += '<div style="margin-top:10px">';
      html += '<button class="ctx-btn" id="audit-refresh" style="width:100%;background:#333;color:#ccc">Refresh</button>';
      html += '</div>';

      content.innerHTML = html;

      // Bind events
      var refreshBtn = document.getElementById('audit-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', AuditPanel.runAudit);

      var fixBtns = content.querySelectorAll('.audit-fix-btn');
      fixBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var fix = btn.getAttribute('data-fix');
          AuditPanel.applyFix(fix, btn);
        });
      });
    },

    renderFinding: function (finding) {
      var severity = finding.severity || 'info';
      var colors = { critical: '#f44336', warning: '#FF9800', info: '#2196F3' };
      var icons = { critical: '!!', warning: '⚠', info: '→' };
      var color = colors[severity] || colors.info;
      var icon = icons[severity] || icons.info;

      var html = '<div style="display:flex;align-items:flex-start;gap:6px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.03)">';
      html += '<span style="color:' + color + ';font-size:11px;flex-shrink:0;margin-top:1px">' + icon + '</span>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:11px;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + esc(finding.detail || '') + '">' + esc(finding.title) + '</div>';
      html += '</div>';

      if (finding.fix) {
        html += '<button class="audit-fix-btn" data-fix="' + esc(finding.fix) + '" style="background:' + color + ';color:#fff;border:none;padding:1px 6px;border-radius:3px;font-size:9px;cursor:pointer;flex-shrink:0;font-family:monospace">FIX</button>';
      }
      html += '</div>';
      return html;
    },

    applyFix: function (fix, btn) {
      btn.textContent = '...';
      btn.disabled = true;
      fetch('/api/context/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: fix, original_tool: 'Bash', timeout: 60000 })
      })
      .then(function (res) { return res.json(); })
      .then(function (data) {
        if (data.exit_code === 0) {
          btn.textContent = '✓';
          btn.style.background = '#4CAF50';
          setTimeout(function () { AuditPanel.runAudit(); }, 2000);
        } else {
          btn.textContent = '✗';
          btn.style.background = '#f44336';
          btn.title = data.stderr || 'Fix failed';
          btn.disabled = false;
        }
      })
      .catch(function () {
        btn.textContent = 'ERR';
        btn.disabled = false;
      });
    }
  };

  window.auditPanel = AuditPanel;
  document.addEventListener('DOMContentLoaded', function () { AuditPanel.load(); });
})();
