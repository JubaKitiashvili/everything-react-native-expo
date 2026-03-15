'use strict';

(function () {
  var AuditPanel = {
    data: null,
    expanded: false,

    load: function () {
      fetch('/api/audit')
        .then(function (res) { return res.json(); })
        .then(function (data) {
          if (data.score !== null && data.score !== undefined) {
            AuditPanel.data = data;
            AuditPanel.render();
          } else {
            AuditPanel.renderEmpty();
          }
        })
        .catch(function () { AuditPanel.renderEmpty(); });
    },

    runAudit: function () {
      var btn = document.getElementById('audit-run-btn');
      if (btn) { btn.textContent = 'Scanning...'; btn.disabled = true; }
      fetch('/api/audit/run', { method: 'POST' })
        .then(function (res) { return res.json(); })
        .then(function (data) {
          AuditPanel.data = data;
          AuditPanel.render();
        })
        .catch(function () {
          if (btn) { btn.textContent = 'Run Audit'; btn.disabled = false; }
        });
    },

    renderEmpty: function () {
      var el = document.getElementById('audit-panel');
      if (!el) return;
      el.innerHTML =
        '<h3>Project Audit</h3>' +
        '<p style="color:#888;font-size:12px;margin:8px 0">No audit data yet</p>' +
        '<button class="ctx-btn" id="audit-run-btn">Run Audit</button>';
      var btn = document.getElementById('audit-run-btn');
      if (btn) btn.addEventListener('click', AuditPanel.runAudit);
    },

    render: function () {
      var el = document.getElementById('audit-panel');
      if (!el || !this.data) return;
      var d = this.data;
      var score = d.score || 0;
      var scoreColor = score >= 80 ? '#4CAF50' : score >= 60 ? '#FF9800' : '#f44336';
      var critical = (d.findings || []).filter(function (f) { return f.severity === 'critical'; });
      var warnings = (d.findings || []).filter(function (f) { return f.severity === 'warning'; });
      var info = (d.findings || []).filter(function (f) { return f.severity === 'info'; });
      var strengths = d.strengths || [];

      var html = '<h3>Project Audit</h3>';

      // Score gauge
      html += '<div style="display:flex;align-items:center;gap:12px;margin:8px 0">';
      html += '<div style="font-size:28px;font-weight:bold;color:' + scoreColor + ';font-family:monospace">' + score + '</div>';
      html += '<div style="flex:1">';
      html += '<div style="background:#333;height:6px;border-radius:3px"><div style="background:' + scoreColor + ';height:100%;border-radius:3px;width:' + score + '%"></div></div>';
      html += '<div style="display:flex;justify-content:space-between;margin-top:4px;font-size:10px;color:#666"><span>' + critical.length + ' critical</span><span>' + warnings.length + ' warn</span><span>' + strengths.length + ' good</span></div>';
      html += '</div></div>';

      // Findings with Fix buttons
      if (critical.length > 0) {
        html += '<div style="margin-top:8px">';
        for (var i = 0; i < critical.length; i++) {
          html += AuditPanel.renderFinding(critical[i], 'critical', i);
        }
        html += '</div>';
      }

      if (warnings.length > 0 && this.expanded) {
        html += '<div style="margin-top:4px">';
        for (var j = 0; j < warnings.length; j++) {
          html += AuditPanel.renderFinding(warnings[j], 'warning', 100 + j);
        }
        html += '</div>';
      }

      if (info.length > 0 && this.expanded) {
        html += '<div style="margin-top:4px">';
        for (var k = 0; k < Math.min(info.length, 5); k++) {
          html += AuditPanel.renderFinding(info[k], 'info', 200 + k);
        }
        html += '</div>';
      }

      // Strengths (collapsed)
      if (strengths.length > 0 && this.expanded) {
        html += '<div style="margin-top:6px;font-size:10px;color:#4CAF50;text-transform:uppercase;letter-spacing:1px">Strengths</div>';
        for (var s = 0; s < Math.min(strengths.length, 8); s++) {
          html += '<div style="font-size:11px;color:#888;padding:2px 0">✓ ' + strengths[s].title + '</div>';
        }
        if (strengths.length > 8) html += '<div style="font-size:10px;color:#555">+' + (strengths.length - 8) + ' more</div>';
      }

      // Toggle & refresh buttons
      html += '<div style="display:flex;gap:6px;margin-top:8px">';
      html += '<button class="ctx-btn" id="audit-toggle" style="flex:1">' + (this.expanded ? 'Collapse' : 'Show All') + '</button>';
      html += '<button class="ctx-btn" id="audit-refresh" style="flex:1;background:#333;color:#ccc">Refresh</button>';
      html += '</div>';

      el.innerHTML = html;

      // Bind events
      var toggleBtn = document.getElementById('audit-toggle');
      if (toggleBtn) {
        toggleBtn.addEventListener('click', function () {
          AuditPanel.expanded = !AuditPanel.expanded;
          AuditPanel.render();
        });
      }

      var refreshBtn = document.getElementById('audit-refresh');
      if (refreshBtn) refreshBtn.addEventListener('click', AuditPanel.runAudit);

      // Bind fix buttons
      var fixBtns = document.querySelectorAll('.audit-fix-btn');
      fixBtns.forEach(function (btn) {
        btn.addEventListener('click', function () {
          var fix = btn.getAttribute('data-fix');
          AuditPanel.applyFix(fix, btn);
        });
      });
    },

    renderFinding: function (finding, severity, idx) {
      var colors = { critical: '#f44336', warning: '#FF9800', info: '#2196F3' };
      var icons = { critical: '✗', warning: '⚠', info: '→' };
      var color = colors[severity];
      var icon = icons[severity];

      var html = '<div style="display:flex;align-items:flex-start;gap:6px;padding:3px 0;border-bottom:1px solid rgba(255,255,255,0.03)">';
      html += '<span style="color:' + color + ';font-size:11px;flex-shrink:0;margin-top:1px">' + icon + '</span>';
      html += '<div style="flex:1;min-width:0">';
      html += '<div style="font-size:11px;color:#ccc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="' + (finding.detail || '').replace(/"/g, '&quot;') + '">' + finding.title + '</div>';
      html += '</div>';

      if (finding.fix) {
        html += '<button class="audit-fix-btn" data-fix="' + finding.fix.replace(/"/g, '&quot;') + '" style="background:' + color + ';color:#fff;border:none;padding:1px 6px;border-radius:3px;font-size:9px;cursor:pointer;flex-shrink:0;font-family:monospace">FIX</button>';
      }
      html += '</div>';
      return html;
    },

    applyFix: function (fix, btn) {
      btn.textContent = '...';
      btn.disabled = true;

      // Send fix command to dashboard for execution
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
            // Re-run audit after fix
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
