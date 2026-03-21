// dashboard/public/worker-tab.js
(function () {
  'use strict';

  var container = null;
  var pollTimer = null;

  var PIPELINE_STEPS = ['Validate', 'Score', 'Route', 'Build', 'Review', 'Test', 'Health', 'PR'];
  var PIPELINE_COLORS = ['#818cf8', '#6366f1', '#8b5cf6', '#a78bfa', '#34d399', '#2dd4bf', '#fbbf24', '#4CAF50'];

  function init(tabContent) {
    container = document.createElement('div');
    container.className = 'worker-container';
    tabContent.appendChild(container);
  }

  function activate() {
    container.innerHTML = '<div class="eco-loading">' + '<div class="eco-skeleton"></div>'.repeat(4) + '</div>';
    fetchData();
    pollTimer = setInterval(fetchData, 5000);
  }

  function deactivate() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }

  function fetchData() {
    fetch('/api/worker')
      .then(function (r) { return r.json(); })
      .then(function (data) { render(data); })
      .catch(function () {
        container.innerHTML = '<div class="eco-error">Could not load worker data.</div>';
      });
  }

  function render(data) {
    container.innerHTML = '';

    // Status banner
    container.appendChild(renderStatusBanner(data));

    // Main layout: left (current ticket + pipeline + log) | right (history)
    var layout = el('div', 'worker-layout');

    var left = el('div', 'worker-left');
    left.appendChild(renderCurrentTicket(data));
    left.appendChild(renderPipeline(data));
    left.appendChild(renderLog(data));
    layout.appendChild(left);

    var right = el('div', 'worker-right');
    right.appendChild(renderHistory(data));
    layout.appendChild(right);

    container.appendChild(layout);
  }

  // ── Status Banner ──────────────────────────────────────────────────────────

  function renderStatusBanner(data) {
    var banner = el('div', 'card worker-banner');
    var isActive = data.status === 'running' || data.status === 'active' || data.status === 'polling';
    var statusClass = isActive ? 'status-active' : 'status-idle';
    var statusLabel = isActive ? 'RUNNING' : 'STOPPED';

    banner.innerHTML =
      '<div class="worker-banner-row">' +
        '<div class="worker-banner-left">' +
          '<span class="pill ' + statusClass + '">' + statusLabel + '</span>' +
          '<span class="worker-banner-label">Provider</span>' +
          '<span class="metric-value" style="font-size:14px">' + esc(data.provider || 'none') + '</span>' +
        '</div>' +
        '<div class="worker-banner-right">' +
          '<div class="worker-banner-stat">' +
            '<span class="metric-label">Poll Interval</span>' +
            '<span class="metric-value">' + (data.pollInterval || '--') + 's</span>' +
          '</div>' +
          '<div class="worker-banner-stat">' +
            '<span class="metric-label">Repo</span>' +
            '<span class="metric-value" style="font-size:12px">' + esc(data.repo || '--') + '</span>' +
          '</div>' +
          '<div class="worker-banner-stat">' +
            '<span class="metric-label">Tickets Today</span>' +
            '<span class="metric-value">' + (data.ticketsToday || 0) + '</span>' +
          '</div>' +
        '</div>' +
      '</div>';

    return banner;
  }

  // ── Current Ticket ─────────────────────────────────────────────────────────

  function renderCurrentTicket(data) {
    var section = el('div', 'card worker-current');
    var ticket = data.currentTicket;

    if (!ticket) {
      section.innerHTML =
        '<div class="section-label">Current Ticket</div>' +
        '<div class="worker-empty">No active ticket. Worker is idle.</div>';
      return section;
    }

    section.innerHTML =
      '<div class="section-label">Current Ticket</div>' +
      '<div class="worker-ticket-card">' +
        '<div class="worker-ticket-header">' +
          '<span class="worker-ticket-id">' + esc(ticket.identifier || ticket.id || '--') + '</span>' +
          '<span class="pill">' + esc(ticket.agent || 'routing') + '</span>' +
        '</div>' +
        '<div class="worker-ticket-title">' + esc(ticket.title || 'Untitled') + '</div>' +
        (ticket.confidence != null ? '<div class="worker-ticket-meta">Confidence: <strong>' + ticket.confidence + '%</strong></div>' : '') +
        (ticket.step ? '<div class="worker-ticket-meta">Step: <strong>' + esc(ticket.step) + '</strong></div>' : '') +
      '</div>';

    return section;
  }

  // ── Pipeline Progress ──────────────────────────────────────────────────────

  function renderPipeline(data) {
    var section = el('div', 'card worker-pipeline');
    section.innerHTML = '<div class="section-label">Pipeline Progress</div>';

    var ticket = data.currentTicket;
    var currentStep = ticket ? (ticket.pipelineStep || 0) : 0;

    var bar = el('div', 'worker-pipeline-bar');

    PIPELINE_STEPS.forEach(function (step, i) {
      var segment = el('div', 'worker-pipeline-segment');
      var isDone = i < currentStep;
      var isCurrent = i === currentStep && ticket;
      var isUpcoming = i > currentStep || !ticket;

      if (isDone) {
        segment.className += ' done';
        segment.style.background = PIPELINE_COLORS[i];
      } else if (isCurrent) {
        segment.className += ' current';
        segment.style.background = PIPELINE_COLORS[i];
        segment.style.opacity = '0.7';
      } else {
        segment.className += ' upcoming';
      }

      segment.innerHTML =
        '<div class="worker-pipeline-step-label">' + step + '</div>';
      bar.appendChild(segment);
    });

    section.appendChild(bar);

    // Progress percentage
    if (ticket) {
      var pct = Math.round((currentStep / PIPELINE_STEPS.length) * 100);
      var pctEl = el('div', 'worker-pipeline-pct');
      pctEl.innerHTML = '<div class="progress-bar"><div class="progress-fill" style="width:' + pct + '%"></div></div>' +
        '<span class="metric-label" style="margin-top:4px">' + pct + '% complete</span>';
      section.appendChild(pctEl);
    }

    return section;
  }

  // ── Live Log ───────────────────────────────────────────────────────────────

  function renderLog(data) {
    var section = el('div', 'card worker-log-section');
    section.innerHTML = '<div class="section-label">Live Log</div>';

    var logArea = el('div', 'worker-log');
    var lines = data.log || data.logs || [];
    if (lines.length === 0) {
      logArea.innerHTML = '<span class="worker-log-empty">No log entries yet.</span>';
    } else {
      var last20 = lines.slice(-20);
      last20.forEach(function (line) {
        var lineEl = el('div', 'worker-log-line');
        if (typeof line === 'string') {
          lineEl.textContent = line;
        } else {
          var ts = line.timestamp ? new Date(line.timestamp).toLocaleTimeString() + ' ' : '';
          lineEl.textContent = ts + (line.message || line.text || JSON.stringify(line));
        }
        // Color code by level
        if (typeof line === 'object' && line.level === 'error') lineEl.classList.add('log-error');
        else if (typeof line === 'object' && line.level === 'warn') lineEl.classList.add('log-warn');
        logArea.appendChild(lineEl);
      });
    }

    section.appendChild(logArea);
    return section;
  }

  // ── Ticket History ─────────────────────────────────────────────────────────

  function renderHistory(data) {
    var section = el('div', 'card worker-history');
    section.innerHTML = '<div class="section-label">Ticket History</div>';

    var history = data.history || data.recentTickets || [];
    if (history.length === 0) {
      section.innerHTML += '<div class="worker-empty">No completed tickets yet.</div>';
      return section;
    }

    var list = el('div', 'worker-history-list');
    history.slice(0, 20).forEach(function (ticket) {
      var row = el('div', 'worker-history-row');
      var status = ticket.status || 'unknown';
      var icon = status === 'completed' || status === 'done' || status === 'merged' ? '&#10003;' :
                 status === 'failed' || status === 'error' ? '&#10007;' :
                 status === 'rejected' ? '&#8709;' : '&#8943;';
      var statusClass = status === 'completed' || status === 'done' || status === 'merged' ? 'status-active' :
                        status === 'failed' || status === 'error' ? 'status-error' :
                        'status-idle';

      row.innerHTML =
        '<span class="worker-history-icon ' + statusClass + '">' + icon + '</span>' +
        '<div class="worker-history-info">' +
          '<div class="worker-history-title">' + esc(ticket.title || ticket.identifier || '--') + '</div>' +
          '<div class="worker-history-meta">' +
            (ticket.agent ? esc(ticket.agent) + ' &middot; ' : '') +
            (ticket.timestamp ? formatTimeAgo(ticket.timestamp) : '') +
          '</div>' +
        '</div>' +
        '<span class="pill ' + statusClass + '" style="font-size:10px">' + esc(status) + '</span>';

      list.appendChild(row);
    });

    section.appendChild(list);
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

  function formatTimeAgo(iso) {
    if (!iso) return '';
    var diff = Date.now() - new Date(iso).getTime();
    var mins = Math.floor(diff / 60000);
    if (mins < 60) return mins + 'm ago';
    var hrs = Math.floor(mins / 60);
    if (hrs < 24) return hrs + 'h ago';
    return Math.floor(hrs / 24) + 'd ago';
  }

  Tabs.registerTab('worker', { init: init, activate: activate, deactivate: deactivate });
})();
