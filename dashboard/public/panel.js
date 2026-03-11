/**
 * ERNE Dashboard — HTML right panel replacing canvas sidebar
 */
(function () {
  'use strict';

  let panelEl = null;
  let agentListEl = null;
  let connectionDotEl = null;
  let onAgentClick = null;

  const AGENT_ORDER = [
    'architect', 'senior-developer', 'feature-builder',
    'native-bridge-builder', 'expo-config-resolver', 'ui-designer',
    'code-reviewer', 'upgrade-assistant',
    'tdd-guide', 'performance-profiler',
  ];

  const init = (container, agentClickHandler) => {
    onAgentClick = agentClickHandler;

    panelEl = document.createElement('div');
    panelEl.className = 'panel';
    panelEl.innerHTML =
      '<div class="panel-header">' +
        '<h2>AGENTS</h2>' +
        '<div class="connection-dot" id="connDot"></div>' +
      '</div>' +
      '<div class="panel-agents" id="agentList"></div>';
    container.appendChild(panelEl);

    agentListEl = document.getElementById('agentList');
    connectionDotEl = document.getElementById('connDot');

    for (var i = 0; i < AGENT_ORDER.length; i++) {
      var name = AGENT_ORDER[i];
      var row = document.createElement('div');
      row.className = 'agent-row';
      row.dataset.agent = name;
      row.innerHTML =
        '<div class="agent-dot idle" id="dot-' + name + '"></div>' +
        '<div class="agent-info">' +
          '<div class="agent-name">' + name + '</div>' +
          '<div class="agent-status idle" id="status-' + name + '">IDLE</div>' +
          '<div class="agent-task" id="task-' + name + '"></div>' +
        '</div>' +
        '<div class="agent-duration" id="dur-' + name + '"></div>';
      row.addEventListener('click', (function (n) {
        return function () { if (onAgentClick) onAgentClick(n); };
      })(name));
      agentListEl.appendChild(row);
    }

    // Update durations every second
    setInterval(updateDurations, 1000);
  };

  let lastAgentState = {};

  const update = (agents) => {
    lastAgentState = agents || {};
    for (var i = 0; i < AGENT_ORDER.length; i++) {
      var name = AGENT_ORDER[i];
      var agent = agents[name];
      if (!agent) continue;

      var status = agent.status || 'idle';
      var task = agent.task || '';

      var dot = document.getElementById('dot-' + name);
      if (dot) {
        dot.className = 'agent-dot ' + status;
      }

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
    }
    updateDurations();
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
  };

  window.Panel = {
    init,
    update,
    setConnected,
  };
})();
