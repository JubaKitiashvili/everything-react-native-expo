// dashboard/public/docs-tab.js
(function () {
  'use strict';

  var container = null;

  var DOC_FILES = [
    { file: 'audit-report.md', description: 'Full project audit report', category: 'audit' },
    { file: 'stack-detection.md', description: 'Detected tech stack summary', category: 'project' },
    { file: 'dependency-report.md', description: 'Dependency analysis and updates', category: 'project' },
    { file: 'dead-code.md', description: 'Unused exports and dead code', category: 'warning' },
    { file: 'todos.md', description: 'TODO/FIXME/HACK comments found', category: 'warning' },
    { file: 'type-coverage.md', description: 'TypeScript coverage analysis', category: 'audit' },
    { file: 'test-coverage.md', description: 'Test file coverage mapping', category: 'audit' },
    { file: 'security-report.md', description: 'Security findings and recommendations', category: 'audit' },
    { file: 'performance-report.md', description: 'Performance analysis results', category: 'audit' },
    { file: 'architecture.md', description: 'Project architecture overview', category: 'project' },
    { file: 'api-surface.md', description: 'Public API and exports map', category: 'project' },
    { file: 'changelog.md', description: 'Auto-generated changelog', category: 'project' }
  ];

  var CATEGORY_COLORS = {
    audit: 'var(--accent)',
    project: 'var(--green)',
    warning: 'var(--orange)'
  };

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'docs-container';
    tabContent.appendChild(container);
  }

  function activate() {
    container.innerHTML = '<div class="eco-loading">' + '<div class="eco-skeleton"></div>'.repeat(3) + '</div>';

    fetch('/api/audit')
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data); })
      .catch(function () { render({}); });
  }

  function deactivate() {}

  function render(auditData) {
    container.innerHTML = '';

    // Header
    var header = el('div', 'docs-header');
    header.innerHTML =
      '<div class="section-label">Generated Documentation</div>' +
      '<div class="docs-subtitle">Files in <code>erne-docs/</code> directory. Run <code>erne audit</code> or <code>erne docs</code> to generate.</div>';
    container.appendChild(header);

    // Stats row
    var generated = auditData.generatedDocs || [];
    var totalCount = DOC_FILES.length;
    var generatedCount = generated.length;

    var statsRow = el('div', 'docs-stats');
    statsRow.innerHTML =
      '<div class="card docs-stat-card">' +
        '<div class="metric-value">' + generatedCount + '</div>' +
        '<div class="metric-label">Generated</div>' +
      '</div>' +
      '<div class="card docs-stat-card">' +
        '<div class="metric-value">' + (totalCount - generatedCount) + '</div>' +
        '<div class="metric-label">Pending</div>' +
      '</div>' +
      '<div class="card docs-stat-card">' +
        '<div class="metric-value">' + totalCount + '</div>' +
        '<div class="metric-label">Total Docs</div>' +
      '</div>';
    container.appendChild(statsRow);

    // Grid of doc file cards
    var grid = el('div', 'grid-3 docs-grid');

    DOC_FILES.forEach(function (doc) {
      var isGenerated = generated.indexOf(doc.file) !== -1;
      var lastUpdated = auditData.docTimestamps ? auditData.docTimestamps[doc.file] : null;
      var isStale = false;

      if (lastUpdated) {
        var age = Date.now() - new Date(lastUpdated).getTime();
        isStale = age > 7 * 24 * 60 * 60 * 1000; // older than 7 days
      }

      var card = el('div', 'card docs-file-card' + (doc.category === 'warning' ? ' docs-warning' : ''));
      var borderColor = CATEGORY_COLORS[doc.category] || 'var(--border)';

      card.style.borderLeft = '3px solid ' + borderColor;

      var statusIcon = isGenerated ? (isStale ? '&#9888;' : '&#10003;') : '&#9679;';
      var statusClass = isGenerated ? (isStale ? 'docs-stale' : 'docs-fresh') : 'docs-missing';
      var statusLabel = isGenerated ? (isStale ? 'Stale' : 'Fresh') : 'Not generated';

      card.innerHTML =
        '<div class="docs-file-header">' +
          '<span class="docs-file-name">' + esc(doc.file) + '</span>' +
          '<span class="docs-file-status ' + statusClass + '">' + statusIcon + '</span>' +
        '</div>' +
        '<div class="docs-file-desc">' + esc(doc.description) + '</div>' +
        '<div class="docs-file-footer">' +
          '<span class="pill ' + statusClass + '" style="font-size:10px">' + statusLabel + '</span>' +
          (lastUpdated ? '<span class="docs-file-age">' + formatTimeAgo(lastUpdated) + '</span>' : '') +
        '</div>';

      grid.appendChild(card);
    });

    container.appendChild(grid);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

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

  Tabs.registerTab('docs', { init: init, activate: activate, deactivate: deactivate });
})();
