# Dashboard Agent Detail & Activity History — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add real-time task details per agent and a persistent activity history/memory to the ERNE pixel-art dashboard, with a redesigned UI using an HTML+Canvas hybrid layout.

**Architecture:** The pixel-art office stays on `<canvas>` for rendering. The 220px canvas sidebar is replaced with a 340px HTML right panel that shows richer agent info, current tasks, and recent activity. Clicking an agent opens an HTML overlay with full history. The server gains an in-memory activity log (ring buffer per agent) that persists to a JSON file on disk. WebSocket payloads are enriched with history data on initial connection.

**Tech Stack:** Node.js (vanilla), HTML/CSS/JS (no framework), Canvas 2D API, WebSocket (`ws` package), JSON file storage

---

## File Structure

### Modified Files

| File | Changes |
|------|---------|
| `dashboard/server.js` | Add activity history ring buffer, JSON persistence, `GET /api/history` endpoint, enriched WebSocket initial payload |
| `dashboard/public/index.html` | Switch from single `<canvas>` layout to HTML+Canvas hybrid with flexbox container, load new modules |
| `dashboard/public/canvas.js` | Remove sidebar width from canvas dimensions (office-only), add click-to-agent hit detection |
| `dashboard/public/ws-client.js` | Handle enriched initial payload `{ agents, history }` vs incremental `{ agents }` |
| `dashboard/public/agents.js` | No changes needed |
| `scripts/hooks/dashboard-event.js` | No changes needed (already sends task text) |

### New Files

| File | Responsibility |
|------|---------------|
| `dashboard/public/styles.css` | All HTML element styling — panel, overlay, agent rows, history entries, responsive breakpoints |
| `dashboard/public/panel.js` | Right panel: agent list with status, task, duration. Manages DOM elements, click handlers |
| `dashboard/public/overlay.js` | Agent detail overlay: full history timeline, current task detail, stats summary |
| `dashboard/public/history.js` | Client-side history data manager: stores received history, provides query methods |

### Removed Files

| File | Reason |
|------|--------|
| `dashboard/public/sidebar.js` | Replaced entirely by HTML-based `panel.js` |

---

## Chunk 1: Server — Activity History & Persistence

### Task 1: Add activity history ring buffer to server

**Files:**
- Modify: `dashboard/server.js:1-47`

- [ ] **Step 1: Add history constants and data structure**

After `DONE_TO_IDLE_DELAY_MS` (line 10), add:

```js
const MAX_HISTORY_PER_AGENT = 50;
const HISTORY_FILE = path.join(__dirname, 'activity-history.json');
```

After `initAgentState()` call (line 47), add:

```js
const activityHistory = {};

const initHistory = () => {
  for (const def of AGENT_DEFINITIONS) {
    activityHistory[def.name] = [];
  }
  // Load persisted history if exists
  try {
    const saved = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf8'));
    for (const [name, entries] of Object.entries(saved)) {
      if (activityHistory[name]) {
        activityHistory[name] = entries.slice(-MAX_HISTORY_PER_AGENT);
      }
    }
  } catch {
    // No saved history or corrupt file — start fresh
  }
};

initHistory();
```

- [ ] **Step 2: Run server to verify it starts without errors**

Run: `cd /Users/macbook/Desktop/Projects/ERNE && node dashboard/server.js &`
Expected: "ERNE Dashboard running on http://localhost:3333" — then kill the process.

- [ ] **Step 3: Commit**

```bash
git add dashboard/server.js
git commit -m "feat(dashboard): add activity history ring buffer with JSON persistence loading"
```

### Task 2: Record events in history and persist to disk

**Files:**
- Modify: `dashboard/server.js:49-77` (handleEvent function)

- [ ] **Step 1: Create `addHistoryEntry` and `persistHistory` functions**

Add before `handleEvent`:

```js
const addHistoryEntry = (agentName, entry) => {
  if (!activityHistory[agentName]) return;
  activityHistory[agentName].push(entry);
  if (activityHistory[agentName].length > MAX_HISTORY_PER_AGENT) {
    activityHistory[agentName].shift();
  }
};

let persistTimer = null;
const persistHistory = () => {
  if (persistTimer) return; // debounce
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      fs.writeFileSync(HISTORY_FILE, JSON.stringify(activityHistory, null, 2));
    } catch {
      // Silent fail — persistence is best-effort
    }
  }, 5000);
};
```

- [ ] **Step 2: Modify `handleEvent` to record history entries**

Replace the `handleEvent` function body:

```js
const handleEvent = (event) => {
  const { type, agent, task } = event;
  if (!agent || !agentState[agent]) {
    return { error: `Unknown agent: ${agent}` };
  }

  const now = new Date().toISOString();
  const state = agentState[agent];
  state.lastEvent = now;

  if (type === 'agent:start') {
    state.status = 'working';
    state.task = task || null;
    state.startedAt = now;
    addHistoryEntry(agent, {
      type: 'start',
      task: task || null,
      timestamp: now,
    });
    persistHistory();
  } else if (type === 'agent:complete') {
    const duration = state.startedAt
      ? Date.now() - new Date(state.startedAt).getTime()
      : null;
    addHistoryEntry(agent, {
      type: 'complete',
      task: task || state.task,
      timestamp: now,
      durationMs: duration,
    });
    state.status = 'done';
    state.task = task || state.task;
    state.startedAt = null;
    persistHistory();
    setTimeout(() => {
      if (agentState[agent].status === 'done') {
        agentState[agent].status = 'idle';
        agentState[agent].task = null;
        broadcastState();
      }
    }, DONE_TO_IDLE_DELAY_MS);
  }

  return { ok: true };
};
```

- [ ] **Step 3: Add `GET /api/history` endpoint and enriched WebSocket initial send**

In the HTTP server handler, add before the static file serve:

```js
if (req.method === 'GET' && req.url === '/api/history') {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(activityHistory));
  return;
}
```

Modify the WebSocket connection handler:

```js
wss.on('connection', (ws) => {
  ws.send(JSON.stringify({
    type: 'init',
    agents: agentState,
    history: activityHistory,
  }));
});
```

- [ ] **Step 4: Add `.gitignore` entry for activity-history.json**

Append to `dashboard/.gitignore` (create if needed):

```
activity-history.json
```

- [ ] **Step 5: Verify server starts and `/api/state` + `/api/history` respond**

Run: `cd /Users/macbook/Desktop/Projects/ERNE && node dashboard/server.js &`
Run: `curl -s http://localhost:3333/api/state | head -c 200`
Run: `curl -s http://localhost:3333/api/history | head -c 200`
Expected: Both return valid JSON. Kill the process.

- [ ] **Step 6: Commit**

```bash
git add dashboard/server.js dashboard/.gitignore
git commit -m "feat(dashboard): record activity history per agent with disk persistence"
```

---

## Chunk 2: Frontend — HTML+Canvas Hybrid Layout

### Task 3: Create CSS stylesheet

**Files:**
- Create: `dashboard/public/styles.css`

- [ ] **Step 1: Write the complete stylesheet**

```css
:root {
  --bg: #0a0a1a;
  --panel-bg: #12121e;
  --panel-header: #1a1a2e;
  --row-even: #16162a;
  --row-odd: #1a1a30;
  --text: #E0E0E0;
  --text-muted: #888;
  --text-dim: #555;
  --border: #4A3F5C;
  --green: #4CAF50;
  --blue: #2196F3;
  --orange: #FF9800;
  --red: #f44336;
  --grey: #9E9E9E;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body {
  background: var(--bg);
  font-family: 'Courier New', monospace;
  color: var(--text);
  overflow: hidden;
  height: 100vh;
}

.dashboard-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.canvas-container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
}

canvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
  cursor: pointer;
}

/* ── Right Panel ── */

.panel {
  width: 340px;
  min-width: 340px;
  background: var(--panel-bg);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.panel-header {
  background: var(--panel-header);
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.panel-header h2 {
  font-size: 13px;
  letter-spacing: 0.1em;
  font-weight: bold;
}

.connection-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--red);
}

.connection-dot.live { background: var(--green); }

.panel-agents {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.agent-row {
  display: flex;
  align-items: flex-start;
  padding: 10px 16px;
  cursor: pointer;
  transition: background 0.15s;
  border-bottom: 1px solid rgba(255,255,255,0.03);
}

.agent-row:nth-child(even) { background: var(--row-even); }
.agent-row:nth-child(odd) { background: var(--row-odd); }
.agent-row:hover { background: rgba(255,255,255,0.05); }

.agent-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-top: 4px;
  margin-right: 10px;
  flex-shrink: 0;
}

.agent-dot.idle { background: var(--grey); }
.agent-dot.working { background: var(--green); animation: pulse 1.5s infinite; }
.agent-dot.done { background: var(--blue); }

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

.agent-info {
  flex: 1;
  min-width: 0;
}

.agent-name {
  font-size: 11px;
  font-weight: bold;
  margin-bottom: 2px;
}

.agent-status {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.agent-status.idle { color: var(--grey); }
.agent-status.working { color: var(--green); }
.agent-status.done { color: var(--blue); }

.agent-task {
  font-size: 9px;
  color: var(--text-muted);
  margin-top: 2px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.agent-duration {
  font-size: 9px;
  color: var(--text-dim);
  margin-left: auto;
  flex-shrink: 0;
  padding-left: 8px;
  padding-top: 3px;
}

/* ── Agent Detail Overlay ── */

.overlay-backdrop {
  display: none;
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.7);
  z-index: 100;
  justify-content: center;
  align-items: center;
}

.overlay-backdrop.open {
  display: flex;
}

.overlay {
  background: var(--panel-bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 520px;
  max-width: 90vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.overlay-header {
  background: var(--panel-header);
  padding: 16px 20px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid var(--border);
}

.overlay-header h3 {
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
}

.overlay-close {
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
}

.overlay-close:hover { color: var(--text); }

.overlay-current {
  padding: 16px 20px;
  border-bottom: 1px solid var(--border);
}

.overlay-current-label {
  font-size: 9px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: 6px;
}

.overlay-current-task {
  font-size: 12px;
  color: var(--text);
  line-height: 1.5;
}

.overlay-current-idle {
  font-size: 11px;
  color: var(--text-dim);
  font-style: italic;
}

.overlay-stats {
  display: flex;
  gap: 16px;
  padding: 12px 20px;
  border-bottom: 1px solid var(--border);
  background: rgba(255,255,255,0.02);
}

.overlay-stat {
  text-align: center;
}

.overlay-stat-value {
  font-size: 16px;
  font-weight: bold;
}

.overlay-stat-label {
  font-size: 8px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.overlay-history {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--border) transparent;
}

.overlay-history-label {
  font-size: 9px;
  color: var(--text-dim);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  padding: 12px 20px 6px;
}

.history-entry {
  padding: 8px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.03);
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.history-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  margin-top: 5px;
  flex-shrink: 0;
}

.history-dot.start { background: var(--green); }
.history-dot.complete { background: var(--blue); }

.history-info {
  flex: 1;
  min-width: 0;
}

.history-task {
  font-size: 10px;
  color: var(--text);
  margin-bottom: 2px;
}

.history-time {
  font-size: 8px;
  color: var(--text-dim);
}

.history-duration {
  font-size: 9px;
  color: var(--text-muted);
  flex-shrink: 0;
}

.history-empty {
  padding: 20px;
  text-align: center;
  color: var(--text-dim);
  font-size: 11px;
}

/* ── Responsive ── */

@media (max-width: 900px) {
  .dashboard-layout {
    flex-direction: column;
  }

  .panel {
    width: 100%;
    min-width: unset;
    max-height: 45vh;
    border-left: none;
    border-top: 1px solid var(--border);
  }

  .canvas-container {
    flex: unset;
    height: 55vh;
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/styles.css
git commit -m "feat(dashboard): add CSS stylesheet for HTML+Canvas hybrid layout"
```

### Task 4: Create client-side history manager

**Files:**
- Create: `dashboard/public/history.js`

- [ ] **Step 1: Write the history data manager**

```js
/**
 * ERNE Dashboard — Client-side activity history manager
 */
(function () {
  'use strict';

  let historyData = {};

  const setHistory = (data) => {
    historyData = data || {};
  };

  const getAgentHistory = (agentName) => {
    return historyData[agentName] || [];
  };

  const getAgentStats = (agentName) => {
    const entries = getAgentHistory(agentName);
    const completions = entries.filter(e => e.type === 'complete');
    const totalTasks = completions.length;
    const totalMs = completions.reduce((sum, e) => sum + (e.durationMs || 0), 0);
    const avgMs = totalTasks > 0 ? Math.round(totalMs / totalTasks) : 0;
    return { totalTasks, totalMs, avgMs };
  };

  const formatDuration = (ms) => {
    if (!ms || ms <= 0) return '--';
    if (ms < 1000) return ms + 'ms';
    const s = Math.floor(ms / 1000);
    if (s < 60) return s + 's';
    const m = Math.floor(s / 60);
    const rs = s % 60;
    return m + 'm ' + rs + 's';
  };

  const formatTime = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatRelativeTime = (iso) => {
    if (!iso) return '';
    const diff = Date.now() - new Date(iso).getTime();
    if (diff < 60000) return 'just now';
    if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
    if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
    return Math.floor(diff / 86400000) + 'd ago';
  };

  window.History = {
    setHistory,
    getAgentHistory,
    getAgentStats,
    formatDuration,
    formatTime,
    formatRelativeTime,
  };
})();
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/history.js
git commit -m "feat(dashboard): add client-side history data manager"
```

### Task 5: Create right panel module

**Files:**
- Create: `dashboard/public/panel.js`

- [ ] **Step 1: Write the panel module**

```js
/**
 * ERNE Dashboard — HTML right panel replacing canvas sidebar
 */
(function () {
  'use strict';

  let panelEl = null;
  let agentListEl = null;
  let connectionDotEl = null;
  let onAgentClick = null;
  let durationIntervalId = null;

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

    // Build agent rows
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
    durationIntervalId = setInterval(updateDurations, 1000);
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/panel.js
git commit -m "feat(dashboard): add HTML right panel with agent status and duration"
```

### Task 6: Create agent detail overlay module

**Files:**
- Create: `dashboard/public/overlay.js`

- [ ] **Step 1: Write the overlay module**

```js
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

    // Close on backdrop click
    backdropEl.addEventListener('click', function (e) {
      if (e.target === backdropEl) close();
    });

    document.getElementById('overlayClose').addEventListener('click', close);

    // Close on Escape key
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
      currentAgent;

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
    // Show newest first
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
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/overlay.js
git commit -m "feat(dashboard): add agent detail overlay with history timeline and stats"
```

---

## Chunk 3: Frontend — Wiring & Integration

### Task 7: Update canvas.js — remove sidebar, add click detection

**Files:**
- Modify: `dashboard/public/canvas.js`

- [ ] **Step 1: Add click-to-agent hit detection method**

Add before `window.OfficeCanvas = {`:

```js
const getAgentAtPoint = (canvasX, canvasY) => {
  for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
    for (const d of desks) {
      const room = ROOMS[roomName];
      const ax = (room.x + d.x) * TILE_SIZE + 10;
      const ay = (room.y + d.y) * TILE_SIZE + 20;
      const half = 20; // click radius
      if (canvasX >= ax - half && canvasX <= ax + half &&
          canvasY >= ay - half && canvasY <= ay + half) {
        return d.agent;
      }
    }
  }
  return null;
};
```

Export it by adding to the `window.OfficeCanvas` object:

```js
getAgentAtPoint,
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/canvas.js
git commit -m "feat(dashboard): add click-to-agent hit detection on canvas"
```

### Task 8: Update ws-client.js — handle enriched payload

**Files:**
- Modify: `dashboard/public/ws-client.js`

- [ ] **Step 1: Update message handler to handle `init` type with history**

Replace the `ws.onmessage` handler:

```js
ws.onmessage = (event) => {
  try {
    const data = JSON.parse(event.data);
    if (data.type === 'init' && data.agents) {
      // Initial payload with agents + history
      onStateUpdate(data.agents);
      if (onHistoryUpdate && data.history) {
        onHistoryUpdate(data.history);
      }
    } else if (data.type === 'state' && data.agents) {
      onStateUpdate(data.agents);
    } else if (!data.type) {
      // Raw agent state object (incremental broadcast)
      onStateUpdate(data);
    }
  } catch (e) {
    // Ignore malformed messages
  }
};
```

Update `createWSClient` signature to accept a third callback:

```js
const createWSClient = (onStateUpdate, onConnectionChange, onHistoryUpdate) => {
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/ws-client.js
git commit -m "feat(dashboard): handle enriched init payload with history data"
```

### Task 9: Rewrite index.html — HTML+Canvas hybrid

**Files:**
- Modify: `dashboard/public/index.html`

- [ ] **Step 1: Replace entire index.html with hybrid layout**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERNE Dashboard</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div class="dashboard-layout">
    <div class="canvas-container" id="canvasContainer">
      <canvas id="dashboard"></canvas>
    </div>
    <!-- Panel and overlay are created by JS modules -->
  </div>

  <script src="canvas.js"></script>
  <script src="agents.js"></script>
  <script src="history.js"></script>
  <script src="panel.js"></script>
  <script src="overlay.js"></script>
  <script src="ws-client.js"></script>
  <script>
    (function () {
      'use strict';

      var CANVAS_W = OfficeCanvas.CANVAS_W;
      var CANVAS_H = OfficeCanvas.CANVAS_H;

      var canvas = document.getElementById('dashboard');
      var ctx = canvas.getContext('2d');
      var container = document.querySelector('.dashboard-layout');

      canvas.width = CANVAS_W;
      canvas.height = CANVAS_H;

      // Scale canvas to fit container
      var resizeCanvas = function () {
        var containerEl = document.getElementById('canvasContainer');
        var cw = containerEl.clientWidth;
        var ch = containerEl.clientHeight;
        var scaleX = cw / CANVAS_W;
        var scaleY = ch / CANVAS_H;
        var scale = Math.min(scaleX, scaleY, 2);
        canvas.style.width = Math.floor(CANVAS_W * scale) + 'px';
        canvas.style.height = Math.floor(CANVAS_H * scale) + 'px';
      };

      window.addEventListener('resize', resizeCanvas);
      resizeCanvas();

      // Init sprites
      AgentSprites.initAgentSprites();

      // Init HTML panel
      Panel.init(container, function onAgentClick(agentName) {
        Overlay.open(agentName, agentServerState);
      });

      // Init overlay
      Overlay.init(document.body);

      // Canvas click → agent detection
      canvas.addEventListener('click', function (e) {
        var rect = canvas.getBoundingClientRect();
        var scaleX = CANVAS_W / rect.width;
        var scaleY = CANVAS_H / rect.height;
        var cx = (e.clientX - rect.left) * scaleX;
        var cy = (e.clientY - rect.top) * scaleY;
        var agent = OfficeCanvas.getAgentAtPoint(cx, cy);
        if (agent) {
          Overlay.open(agent, agentServerState);
        }
      });

      // State
      var agentServerState = {};

      // WebSocket connection
      WSClient.createWSClient(
        function onStateUpdate(agents) {
          agentServerState = agents;
          // Sync sprite states
          for (var name in agents) {
            if (agents.hasOwnProperty(name)) {
              var status = agents[name].status || 'idle';
              if (AgentSprites.agentSprites[name] &&
                  AgentSprites.agentSprites[name].status !== status) {
                AgentSprites.updateAgentState(name, status);
              }
            }
          }
          // Update HTML panel and overlay
          Panel.update(agents);
          Overlay.updateState(agents);
        },
        function onConnectionChange(connected) {
          Panel.setConnected(connected);
        },
        function onHistoryUpdate(history) {
          History.setHistory(history);
        }
      );

      // Main render loop
      var lastTime = performance.now();

      var render = function (now) {
        var dt = (now - lastTime) / 1000;
        lastTime = now;
        if (dt > 0.1) dt = 0.1;

        AgentSprites.updateAgentSprites(dt);

        ctx.clearRect(0, 0, CANVAS_W, CANVAS_H);
        OfficeCanvas.drawOffice(ctx);
        AgentSprites.drawAgentSprites(ctx);

        requestAnimationFrame(render);
      };

      requestAnimationFrame(render);
    })();
  </script>
</body>
</html>
```

- [ ] **Step 2: Delete sidebar.js (no longer needed)**

```bash
rm dashboard/public/sidebar.js
```

- [ ] **Step 3: Verify everything loads in browser**

Run: `cd /Users/macbook/Desktop/Projects/ERNE && node dashboard/server.js &`
Open: `http://localhost:3333`
Expected: Pixel-art office on left, HTML panel on right with 10 agents listed. Click an agent → overlay opens. Kill the process.

- [ ] **Step 4: Commit**

```bash
git add dashboard/public/index.html dashboard/public/overlay.js dashboard/public/panel.js dashboard/public/history.js dashboard/public/styles.css dashboard/public/canvas.js dashboard/public/ws-client.js
git rm dashboard/public/sidebar.js
git commit -m "feat(dashboard): HTML+Canvas hybrid layout with detail panel and history overlay"
```

---

## Chunk 4: Polish & Integration Testing

### Task 10: Manual integration test

- [ ] **Step 1: Start the dashboard**

```bash
cd /Users/macbook/Desktop/Projects/ERNE
node dashboard/server.js &
```

- [ ] **Step 2: Simulate agent events to test the full pipeline**

```bash
# Start an agent
curl -X POST http://localhost:3333/api/events \
  -H "Content-Type: application/json" \
  -d '{"type":"agent:start","agent":"architect","task":"Designing auth module architecture"}'

# Start another
curl -X POST http://localhost:3333/api/events \
  -H "Content-Type: application/json" \
  -d '{"type":"agent:start","agent":"tdd-guide","task":"Writing failing tests for auth hook"}'

# Complete the first
curl -X POST http://localhost:3333/api/events \
  -H "Content-Type: application/json" \
  -d '{"type":"agent:complete","agent":"architect","task":"Designing auth module architecture"}'

# Start and complete more to build history
curl -X POST http://localhost:3333/api/events \
  -H "Content-Type: application/json" \
  -d '{"type":"agent:start","agent":"code-reviewer","task":"Reviewing PR #42 auth changes"}'

curl -X POST http://localhost:3333/api/events \
  -H "Content-Type: application/json" \
  -d '{"type":"agent:complete","agent":"tdd-guide","task":"Writing failing tests for auth hook"}'

curl -X POST http://localhost:3333/api/events \
  -H "Content-Type: application/json" \
  -d '{"type":"agent:complete","agent":"code-reviewer","task":"Reviewing PR #42 auth changes"}'
```

Expected in browser:
- architect: working → done → idle (with animation transitions)
- tdd-guide: working → done → idle
- code-reviewer: working → done → idle
- Click any agent → overlay shows history entries with timestamps and durations

- [ ] **Step 3: Verify history persistence**

```bash
curl -s http://localhost:3333/api/history | python3 -m json.tool | head -30
```

Expected: JSON with history entries for architect, tdd-guide, code-reviewer.

- [ ] **Step 4: Verify activity-history.json was written to disk**

```bash
ls -la dashboard/activity-history.json
cat dashboard/activity-history.json | python3 -m json.tool | head -20
```

- [ ] **Step 5: Kill server, restart, verify history persists**

```bash
kill %1
node dashboard/server.js &
curl -s http://localhost:3333/api/history | python3 -m json.tool | head -10
```

Expected: History entries still present after restart.

- [ ] **Step 6: Test responsive layout by resizing browser to < 900px width**

Expected: Panel moves below the canvas.

- [ ] **Step 7: Final commit with any polish fixes**

```bash
git add -A
git commit -m "feat(dashboard): agent detail panel and activity history — complete"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | History ring buffer | `server.js` |
| 2 | Record events + persistence | `server.js`, `.gitignore` |
| 3 | CSS stylesheet | `styles.css` (new) |
| 4 | History client manager | `history.js` (new) |
| 5 | HTML right panel | `panel.js` (new) |
| 6 | Detail overlay | `overlay.js` (new) |
| 7 | Canvas click detection | `canvas.js` |
| 8 | WebSocket enriched payload | `ws-client.js` |
| 9 | Hybrid layout integration | `index.html`, remove `sidebar.js` |
| 10 | Integration test | Manual verification |
