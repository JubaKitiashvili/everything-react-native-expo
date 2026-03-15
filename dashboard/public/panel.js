/**
 * ERNE Dashboard — HTML bottom panel with agent cards
 */
(function () {
  'use strict';

  let panelEl = null;
  let agentListEl = null;
  let connectionDotEl = null;
  let connectionLabel = null;
  let onAgentClick = null;

  const AGENT_ORDER = [
    'architect', 'senior-developer', 'feature-builder',
    'native-bridge-builder', 'expo-config-resolver', 'ui-designer',
    'code-reviewer', 'upgrade-assistant',
    'tdd-guide', 'performance-profiler',
    'pipeline-orchestrator',
  ];

  const init = (container, agentClickHandler) => {
    onAgentClick = agentClickHandler;

    panelEl = document.createElement('div');
    panelEl.className = 'panel';
    panelEl.innerHTML =
      '<div class="panel-header">' +
        '<h2>AGENTS</h2>' +
        '<div class="panel-header-right">' +
          '<div class="connection-badge">' +
            '<div class="connection-dot" id="connDot"></div>' +
            '<span id="connLabel">Disconnected</span>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="panel-agents" id="agentList"></div>';
    container.appendChild(panelEl);

    agentListEl = document.getElementById('agentList');
    connectionDotEl = document.getElementById('connDot');
    connectionLabel = document.getElementById('connLabel');

    for (var i = 0; i < AGENT_ORDER.length; i++) {
      var name = AGENT_ORDER[i];
      var row = document.createElement('div');
      row.className = 'agent-row';
      row.dataset.agent = name;
      var emoji = (window.AgentSprites && window.AgentSprites.AGENT_DEFS[name] && window.AgentSprites.AGENT_DEFS[name].emoji) || '';
      var emojiSpan = emoji ? '<span class="agent-emoji">' + escapeHtml(emoji) + '</span>' : '';
      row.innerHTML =
        '<div class="agent-dot idle" id="dot-' + name + '"></div>' +
        '<div class="agent-info">' +
          '<div class="agent-name-row">' +
            emojiSpan +
            '<span class="agent-name">' + name + '</span>' +
            '<span class="agent-status idle" id="status-' + name + '">IDLE</span>' +
          '</div>' +
          '<div class="agent-task" id="task-' + name + '"></div>' +
          '<div class="agent-progress" id="prog-' + name + '" style="display:none">' +
            '<div class="agent-progress-fill" id="prog-fill-' + name + '"></div>' +
          '</div>' +
        '</div>' +
        '<div class="agent-duration" id="dur-' + name + '"></div>';
      row.addEventListener('click', (function (n) {
        return function () { if (onAgentClick) onAgentClick(n); };
      })(name));
      agentListEl.appendChild(row);
    }

    setInterval(updateDurations, 1000);
  };

  let lastAgentState = {};
  let stripEl = null;
  let isCollapsed = false;

  const update = (agents) => {
    lastAgentState = agents || {};
    for (var i = 0; i < AGENT_ORDER.length; i++) {
      var name = AGENT_ORDER[i];
      var agent = agents[name];
      if (!agent) continue;

      var status = agent.status || 'idle';
      var task = agent.task || '';

      // Row highlight
      var rowEl = agentListEl.querySelector('[data-agent="' + name + '"]');
      if (rowEl) {
        rowEl.className = 'agent-row' + (status !== 'idle' ? ' is-' + status : '');
      }

      var dot = document.getElementById('dot-' + name);
      if (dot) dot.className = 'agent-dot ' + status;

      var statusEl = document.getElementById('status-' + name);
      if (statusEl) {
        statusEl.className = 'agent-status ' + status;
        statusEl.textContent = status.toUpperCase();
      }

      var taskEl = document.getElementById('task-' + name);
      if (taskEl) {
        taskEl.textContent = task;
        taskEl.title = task;
      }

      // Progress bar
      var progEl = document.getElementById('prog-' + name);
      var progFill = document.getElementById('prog-fill-' + name);
      if (progEl && progFill) {
        if (status === 'working' || status === 'planning') {
          progEl.style.display = 'block';
          progFill.className = 'agent-progress-fill' + (status === 'planning' ? ' planning' : '');
        } else {
          progEl.style.display = 'none';
        }
      }
    }
    updateDurations();
    updateStrip();
  };

  const updateDurations = () => {
    for (var i = 0; i < AGENT_ORDER.length; i++) {
      var name = AGENT_ORDER[i];
      var agent = lastAgentState[name];
      var durEl = document.getElementById('dur-' + name);
      if (!durEl || !agent) continue;

      if (agent.status === 'working' && agent.startedAt) {
        var elapsed = Date.now() - new Date(agent.startedAt).getTime();
        durEl.textContent = History.formatDuration(elapsed);
      } else {
        durEl.textContent = '';
      }
    }
  };

  const setConnected = (connected) => {
    if (connectionDotEl) {
      connectionDotEl.className = 'connection-dot' + (connected ? ' live' : '');
    }
    if (connectionLabel) {
      connectionLabel.textContent = connected ? 'Live' : 'Disconnected';
    }
  };

  const updateStrip = () => {
    if (!stripEl) return;
    var agents = lastAgentState;
    var working = 0, planning = 0, idle = 0;
    var tickerText = '';
    var names = Object.keys(agents);
    for (var i = 0; i < names.length; i++) {
      var a = agents[names[i]];
      if (!a) continue;
      if (a.status === 'working') { working++; if (!tickerText && a.task) tickerText = escapeHtml(names[i]) + ': ' + escapeHtml(a.task); }
      else if (a.status === 'planning') { planning++; if (!tickerText && a.task) tickerText = escapeHtml(names[i]) + ': ' + escapeHtml(a.task); }
      else { idle++; }
    }
    stripEl.innerHTML =
      '<span class="strip-dot green"></span><span class="strip-count">' + working + ' working</span>' +
      '<span class="strip-dot orange"></span><span class="strip-count">' + planning + ' planning</span>' +
      '<span class="strip-dot grey"></span><span class="strip-count">' + idle + ' idle</span>' +
      (tickerText ? '<span class="strip-divider">│</span><span class="strip-ticker">' + tickerText + '</span>' : '');
  };

  const collapse = () => {
    if (isCollapsed) return;
    isCollapsed = true;
    if (panelEl) panelEl.style.display = 'none';
    if (!stripEl) {
      stripEl = document.createElement('div');
      stripEl.className = 'agent-strip';
      stripEl.addEventListener('click', function () {
        if (!panelEl) return;
        panelEl.classList.add('panel-overlay');
        panelEl.style.display = '';
        var dismiss = function (e) {
          if (!panelEl.contains(e.target)) {
            panelEl.style.display = 'none';
            panelEl.classList.remove('panel-overlay');
            document.removeEventListener('click', dismiss);
          }
        };
        setTimeout(function () { document.addEventListener('click', dismiss); }, 0);
      });
      if (panelEl && panelEl.parentNode) {
        panelEl.parentNode.insertBefore(stripEl, panelEl.nextSibling);
      }
    }
    stripEl.style.display = 'flex';
    updateStrip();
  };

  const expand = () => {
    if (!isCollapsed) return;
    isCollapsed = false;
    if (panelEl) {
      panelEl.classList.remove('panel-overlay');
      panelEl.style.display = '';
    }
    if (stripEl) stripEl.style.display = 'none';
  };

  function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  window.Panel = {
    init,
    update,
    setConnected,
    collapse,
    expand,
  };
})();
