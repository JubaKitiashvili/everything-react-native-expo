// dashboard/public/health-tab.js
(function () {
  'use strict';

  var container = null;

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'health-container';
    tabContent.appendChild(container);
  }

  function activate() {
    container.innerHTML = '<div class="eco-loading">' + '<div class="eco-skeleton"></div>'.repeat(4) + '</div>';

    Promise.all([
      fetch('/api/audit').then(function (r) { return r.json(); }).catch(function () { return {}; }),
      fetch('/api/upgrades/scan').then(function (r) { return r.json(); }).catch(function () { return { packages: [] }; })
    ]).then(function (results) {
      render(results[0], results[1]);
    }).catch(function () {
      container.innerHTML = '<div class="eco-error">Could not load health data.</div>';
    });
  }

  function deactivate() {}

  function render(audit, upgrades) {
    container.innerHTML = '';

    // Top: 4 metric score cards
    container.appendChild(renderScoreCards(audit));

    // Middle row: Findings + Upgrades side-by-side
    var midRow = el('div', 'health-mid-row');
    midRow.appendChild(renderFindings(audit));
    midRow.appendChild(renderUpgrades(upgrades));
    container.appendChild(midRow);

    // Bottom: Code quality bars + health trend
    var bottomRow = el('div', 'health-bottom-row');
    bottomRow.appendChild(renderQualityBars(audit));
    bottomRow.appendChild(renderHealthTrend(audit));
    container.appendChild(bottomRow);
  }

  // ── Score Cards ────────────────────────────────────────────────────────────

  function renderScoreCards(audit) {
    var row = el('div', 'grid-4 health-scores');

    var score = audit.score || 0;
    var onboarding = audit.onboarding || 0;
    var typeSafety = audit.typeSafety || audit.typeScore || 0;
    var testRatio = audit.testRatio || audit.testCoverage || 0;

    row.appendChild(makeScoreCard('Doctor Score', score, '/100', scoreColor(score)));
    row.appendChild(makeScoreCard('Onboarding', onboarding, '/10', onboarding >= 8 ? 'green' : onboarding >= 5 ? 'orange' : 'red'));
    row.appendChild(makeScoreCard('Type Safety', typeSafety, '%', typeSafety >= 80 ? 'green' : typeSafety >= 50 ? 'orange' : 'red'));
    row.appendChild(makeScoreCard('Test Ratio', testRatio, '%', testRatio >= 60 ? 'green' : testRatio >= 30 ? 'orange' : 'red'));

    return row;
  }

  function makeScoreCard(label, value, suffix, color) {
    var card = el('div', 'card health-score-card');
    card.innerHTML =
      '<div class="metric-label">' + label + '</div>' +
      '<div class="metric-value ' + color + '">' + value + '<span class="health-suffix">' + suffix + '</span></div>';
    return card;
  }

  function scoreColor(score) {
    if (score >= 90) return 'green';
    if (score >= 75) return 'blue';
    if (score >= 60) return 'orange';
    return 'red';
  }

  // ── Findings ───────────────────────────────────────────────────────────────

  function renderFindings(audit) {
    var section = el('div', 'card health-findings');
    var findings = audit.findings || [];
    var strengths = audit.strengths || [];

    var critical = findings.filter(function (f) { return f.severity === 'critical'; });
    var warnings = findings.filter(function (f) { return f.severity === 'warning'; });
    var suggestions = findings.filter(function (f) { return f.severity !== 'critical' && f.severity !== 'warning'; });

    section.innerHTML = '<div class="section-label">Findings</div>';

    if (findings.length === 0 && strengths.length === 0) {
      section.innerHTML += '<div class="worker-empty">No audit data available. Run <code>erne audit</code> first.</div>';
      return section;
    }

    // Summary pills
    var summary = el('div', 'health-finding-summary');
    summary.innerHTML =
      '<span class="pill status-error">' + critical.length + ' critical</span>' +
      '<span class="pill" style="background:rgba(251,191,36,0.15);color:#fbbf24">' + warnings.length + ' warnings</span>' +
      '<span class="pill status-idle">' + suggestions.length + ' suggestions</span>';
    section.appendChild(summary);

    // List findings
    var list = el('div', 'health-finding-list');
    findings.forEach(function (f) {
      var row = el('div', 'health-finding-row');
      var sevClass = f.severity === 'critical' ? 'status-error' : f.severity === 'warning' ? 'status-idle' : '';
      var icon = f.severity === 'critical' ? '!!' : f.severity === 'warning' ? '&#9888;' : '&#8594;';
      row.innerHTML =
        '<span class="health-finding-icon ' + sevClass + '">' + icon + '</span>' +
        '<span class="health-finding-text">' + esc(f.title || f.message || '') + '</span>' +
        (f.fix ? '<span class="badge" title="' + esc(f.fix) + '">FIX</span>' : '');
      list.appendChild(row);
    });
    section.appendChild(list);

    // Strengths
    if (strengths.length > 0) {
      var strengthsEl = el('div', 'health-strengths');
      strengthsEl.innerHTML = '<div class="metric-label" style="margin-top:12px">STRENGTHS</div>';
      strengths.forEach(function (s) {
        var row = el('div', 'health-strength-row');
        row.innerHTML = '<span class="status-active">&#10003;</span> ' + esc(s.title || s);
        strengthsEl.appendChild(row);
      });
      section.appendChild(strengthsEl);
    }

    return section;
  }

  // ── Upgrades (merged from upgrades tab) ────────────────────────────────────

  function renderUpgrades(data) {
    var section = el('div', 'card health-upgrades');
    var packages = data.packages || [];

    section.innerHTML = '<div class="section-label">Dependency Updates</div>';

    if (packages.length === 0) {
      section.innerHTML += '<div class="worker-empty">All dependencies up to date.</div>';
      return section;
    }

    var summary = el('div', 'health-upgrade-summary');
    var major = packages.filter(function (p) { return p.bump === 'major'; }).length;
    var minor = packages.filter(function (p) { return p.bump === 'minor'; }).length;
    var patch = packages.filter(function (p) { return p.bump === 'patch'; }).length;
    summary.innerHTML =
      '<span class="pill status-error">' + major + ' major</span>' +
      '<span class="pill" style="background:rgba(251,191,36,0.15);color:#fbbf24">' + minor + ' minor</span>' +
      '<span class="pill status-active">' + patch + ' patch</span>';
    section.appendChild(summary);

    var list = el('div', 'health-upgrade-list');
    packages.slice(0, 15).forEach(function (pkg) {
      var row = el('div', 'health-upgrade-row');
      var bumpColor = pkg.bump === 'major' ? 'status-error' : pkg.bump === 'minor' ? '' : 'status-active';
      row.innerHTML =
        '<span class="health-upgrade-name">' + esc(pkg.name) + '</span>' +
        '<span class="health-upgrade-ver">' + esc(pkg.current) + ' &rarr; ' + esc(pkg.latest) + '</span>' +
        '<span class="pill ' + bumpColor + '" style="font-size:10px">' + esc(pkg.bump) + '</span>';
      list.appendChild(row);
    });
    if (packages.length > 15) {
      var more = el('div', 'health-upgrade-more');
      more.textContent = '+ ' + (packages.length - 15) + ' more';
      list.appendChild(more);
    }
    section.appendChild(list);

    return section;
  }

  // ── Code Quality Bars ──────────────────────────────────────────────────────

  function renderQualityBars(audit) {
    var section = el('div', 'card health-quality');
    section.innerHTML = '<div class="section-label">Code Quality</div>';

    var metrics = [
      { label: 'Dead Code', value: audit.deadCode || 0, max: 100, color: 'var(--red)' },
      { label: 'Tech Debt', value: audit.techDebt || 0, max: 100, color: 'var(--orange)' },
      { label: 'Deps Health', value: audit.depsHealth || audit.dependencyHealth || 0, max: 100, color: 'var(--green)' },
      { label: 'Bundle Size', value: audit.bundleScore || 0, max: 100, color: 'var(--blue)' }
    ];

    metrics.forEach(function (m) {
      var row = el('div', 'health-quality-row');
      var pct = Math.max(0, Math.min(100, m.value));
      row.innerHTML =
        '<span class="health-quality-label">' + m.label + '</span>' +
        '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%;background:' + m.color + '"></div></div>' +
        '<span class="health-quality-val">' + pct + '</span>';
      section.appendChild(row);
    });

    return section;
  }

  // ── Health Trend ───────────────────────────────────────────────────────────

  function renderHealthTrend(audit) {
    var section = el('div', 'card health-trend');
    section.innerHTML = '<div class="section-label">Health Trend</div>';

    var history = audit.history || audit.trend || [];
    if (history.length === 0) {
      section.innerHTML += '<div class="worker-empty">Not enough data for trend. Runs daily.</div>';
      // Show placeholder bars
      var placeholder = el('div', 'health-trend-bars');
      for (var i = 0; i < 7; i++) {
        var bar = el('div', 'health-trend-bar');
        var h = 15 + Math.random() * 60;
        bar.style.height = h + '%';
        bar.style.opacity = '0.3';
        placeholder.appendChild(bar);
      }
      section.appendChild(placeholder);
      return section;
    }

    var bars = el('div', 'health-trend-bars');
    var maxVal = Math.max.apply(null, history.map(function (h) { return h.score || h.value || 0; }));
    if (maxVal === 0) maxVal = 100;

    history.slice(-14).forEach(function (entry) {
      var bar = el('div', 'health-trend-bar');
      var val = entry.score || entry.value || 0;
      var pct = (val / maxVal) * 100;
      bar.style.height = pct + '%';
      bar.title = (entry.date || '') + ': ' + val;
      bar.style.background = val >= 75 ? 'var(--green)' : val >= 50 ? 'var(--orange)' : 'var(--red)';
      bars.appendChild(bar);
    });

    section.appendChild(bars);
    return section;
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

  Tabs.registerTab('health', { init: init, activate: activate, deactivate: deactivate });
})();
