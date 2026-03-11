/**
 * ERNE Dashboard — Agent detail overlay with history timeline
 */
(function () {
  'use strict';

  let backdropEl = null;
  let currentAgent = null;
  let currentAgentState = {};

  const init = (container) => {
    backdropEl = document.createElement('div');
    backdropEl.className = 'overlay-backdrop';
    backdropEl.innerHTML =
      '<div class="overlay" id="overlayPanel">' +
        '<div class="overlay-header">' +
          '<h3 id="overlayTitle"></h3>' +
          '<button class="overlay-close" id="overlayClose">&times;</button>' +
        '</div>' +
        '<div class="overlay-current" id="overlayCurrent"></div>' +
        '<div class="overlay-stats" id="overlayStats"></div>' +
        '<div class="overlay-history">' +
          '<div class="overlay-history-label">Activity History</div>' +
          '<div id="overlayHistory"></div>' +
        '</div>' +
      '</div>';
    container.appendChild(backdropEl);

    backdropEl.addEventListener('click', function (e) {
      if (e.target === backdropEl) close();
    });

    document.getElementById('overlayClose').addEventListener('click', close);

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') close();
    });
  };

  const open = (agentName, agents) => {
    currentAgent = agentName;
    currentAgentState = agents || {};
    render();
    backdropEl.classList.add('open');
  };

  const close = () => {
    currentAgent = null;
    backdropEl.classList.remove('open');
  };

  const updateState = (agents) => {
    currentAgentState = agents || {};
    if (currentAgent && backdropEl.classList.contains('open')) {
      render();
    }
  };

  const render = () => {
    if (!currentAgent) return;

    var agent = currentAgentState[currentAgent];
    var status = agent ? agent.status || 'idle' : 'idle';
    var task = agent ? agent.task || '' : '';

    // Title
    document.getElementById('overlayTitle').innerHTML =
      '<span class="agent-dot ' + status + '" style="display:inline-block"></span> ' +
      escapeHtml(currentAgent);

    // Current task
    var currentEl = document.getElementById('overlayCurrent');
    if (status === 'working' && task) {
      var elapsed = agent.startedAt
        ? Date.now() - new Date(agent.startedAt).getTime()
        : 0;
      currentEl.innerHTML =
        '<div class="overlay-current-label">Currently Working On</div>' +
        '<div class="overlay-current-task">' + escapeHtml(task) + '</div>' +
        '<div style="font-size:9px;color:var(--text-dim);margin-top:4px">Duration: ' +
        History.formatDuration(elapsed) + '</div>';
    } else if (status === 'done' && task) {
      currentEl.innerHTML =
        '<div class="overlay-current-label">Just Completed</div>' +
        '<div class="overlay-current-task">' + escapeHtml(task) + '</div>';
    } else {
      currentEl.innerHTML =
        '<div class="overlay-current-idle">Agent is idle — waiting for next task</div>';
    }

    // Stats
    var stats = History.getAgentStats(currentAgent);
    document.getElementById('overlayStats').innerHTML =
      '<div class="overlay-stat">' +
        '<div class="overlay-stat-value">' + stats.totalTasks + '</div>' +
        '<div class="overlay-stat-label">Tasks Done</div>' +
      '</div>' +
      '<div class="overlay-stat">' +
        '<div class="overlay-stat-value">' + History.formatDuration(stats.totalMs) + '</div>' +
        '<div class="overlay-stat-label">Total Time</div>' +
      '</div>' +
      '<div class="overlay-stat">' +
        '<div class="overlay-stat-value">' + History.formatDuration(stats.avgMs) + '</div>' +
        '<div class="overlay-stat-label">Avg / Task</div>' +
      '</div>';

    // History timeline
    var entries = History.getAgentHistory(currentAgent);
    var historyEl = document.getElementById('overlayHistory');

    if (entries.length === 0) {
      historyEl.innerHTML = '<div class="history-empty">No activity recorded yet</div>';
      return;
    }

    var html = '';
    for (var i = entries.length - 1; i >= 0; i--) {
      var e = entries[i];
      html +=
        '<div class="history-entry">' +
          '<div class="history-dot ' + e.type + '"></div>' +
          '<div class="history-info">' +
            '<div class="history-task">' + escapeHtml(e.task || 'Unknown task') + '</div>' +
            '<div class="history-time">' +
              (e.type === 'complete' ? 'Completed ' : 'Started ') +
              History.formatRelativeTime(e.timestamp) +
              ' at ' + History.formatTime(e.timestamp) +
            '</div>' +
          '</div>' +
          (e.durationMs
            ? '<div class="history-duration">' + History.formatDuration(e.durationMs) + '</div>'
            : '') +
        '</div>';
    }
    historyEl.innerHTML = html;
  };

  const escapeHtml = (str) => {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  };

  window.Overlay = {
    init,
    open,
    close,
    updateState,
  };
})();
