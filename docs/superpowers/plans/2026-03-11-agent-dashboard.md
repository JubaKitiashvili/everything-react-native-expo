# ERNE Agent Dashboard Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a pixel-art visual dashboard that shows ERNE agents working in real-time via Claude Code hooks, WebSocket, and HTML5 Canvas.

**Architecture:** Standalone Node.js server receives events from Claude Code hooks (PreToolUse/PostToolUse on Agent tool) via HTTP POST, maintains in-memory agent state, and pushes updates to the browser over WebSocket. The browser renders a pixel-art office with 4 rooms and 8 agent sprites using HTML5 Canvas.

**Tech Stack:** Node.js (built-in `http`, `fs`, `path`, `net`, `child_process`), `ws` npm package, HTML5 Canvas API, vanilla JavaScript.

**Spec:** `docs/superpowers/specs/2026-03-11-agent-dashboard-design.md`

---

## Chunk 1: Dashboard Server + Event API

### Task 1: Initialize dashboard package

**Files:**
- Create: `dashboard/package.json`
- Create: `dashboard/server.js`

- [ ] **Step 1: Create dashboard/package.json**

```json
{
  "name": "erne-dashboard",
  "version": "1.0.0",
  "private": true,
  "description": "ERNE Agent Visual Dashboard",
  "main": "server.js",
  "dependencies": {
    "ws": "^8.0.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Note: `ws` is scoped to `dashboard/package.json` only (not root `package.json`) to keep the dashboard self-contained. The spec's mention of updating root `package.json` is intentionally overridden — the dashboard is an independent sub-package.

Run: `cd dashboard && npm install`
Expected: `node_modules/` created with `ws` package

- [ ] **Step 3: Create dashboard/server.js with HTTP + WebSocket**

```js
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');

const PORT = parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);
const PUBLIC_DIR = path.join(__dirname, 'public');

// In-memory agent state
const AGENTS = {
  'architect': { status: 'idle', task: '', room: 'development', startedAt: 0, lastEvent: 0 },
  'native-bridge-builder': { status: 'idle', task: '', room: 'development', startedAt: 0, lastEvent: 0 },
  'expo-config-resolver': { status: 'idle', task: '', room: 'development', startedAt: 0, lastEvent: 0 },
  'ui-designer': { status: 'idle', task: '', room: 'development', startedAt: 0, lastEvent: 0 },
  'code-reviewer': { status: 'idle', task: '', room: 'review', startedAt: 0, lastEvent: 0 },
  'upgrade-assistant': { status: 'idle', task: '', room: 'review', startedAt: 0, lastEvent: 0 },
  'tdd-guide': { status: 'idle', task: '', room: 'testing', startedAt: 0, lastEvent: 0 },
  'performance-profiler': { status: 'idle', task: '', room: 'testing', startedAt: 0, lastEvent: 0 },
};

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
};

// Auto-timeout: reset agents idle after 5 minutes of no events
const TIMEOUT_MS = 5 * 60 * 1000;

setInterval(() => {
  const now = Date.now();
  for (const [name, agent] of Object.entries(AGENTS)) {
    if (agent.status === 'working' && agent.lastEvent > 0 && (now - agent.lastEvent) > TIMEOUT_MS) {
      agent.status = 'idle';
      agent.task = '';
      broadcast({ type: 'state', agents: AGENTS });
    }
  }
}, 30000);

// WebSocket clients
const wsClients = new Set();

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const client of wsClients) {
    if (client.readyState === 1) {
      client.send(msg);
    }
  }
}

function handleEvent(event) {
  const { type, agent, task } = event;
  if (!agent || !AGENTS[agent]) return;

  const now = Date.now();
  const agentState = AGENTS[agent];
  agentState.lastEvent = now;

  switch (type) {
    case 'agent:start':
      agentState.status = 'working';
      agentState.task = task || '';
      agentState.startedAt = now;
      break;
    case 'agent:complete':
      agentState.status = 'done';
      agentState.task = '';
      // Transition to idle after 3 seconds
      setTimeout(() => {
        agentState.status = 'idle';
        broadcast({ type: 'state', agents: AGENTS });
      }, 3000);
      break;
    default:
      // tool:call or unknown — just update lastEvent
      break;
  }

  broadcast({ type: 'state', agents: AGENTS });
}

const server = http.createServer((req, res) => {
  // API endpoint
  if (req.method === 'POST' && req.url === '/api/events') {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      try {
        const event = JSON.parse(body);
        event.timestamp = Date.now();
        handleEvent(event);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end('{"ok":true}');
      } catch {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end('{"error":"invalid json"}');
      }
    });
    return;
  }

  // GET /api/state — current state snapshot
  if (req.method === 'GET' && req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents: AGENTS }));
    return;
  }

  // Static file serving
  let filePath = req.url === '/' ? '/index.html' : req.url;
  filePath = path.join(PUBLIC_DIR, filePath);

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(filePath);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  wsClients.add(ws);
  // Send current state on connect
  ws.send(JSON.stringify({ type: 'state', agents: AGENTS }));
  ws.on('close', () => wsClients.delete(ws));
});

server.listen(PORT, () => {
  console.log(`ERNE Dashboard running at http://localhost:${PORT}`);
});
```

- [ ] **Step 4: Create minimal dashboard/public/index.html for testing**

```html
<!DOCTYPE html>
<html><head><title>ERNE Dashboard</title></head>
<body>
  <h1>ERNE Dashboard</h1>
  <pre id="state"></pre>
  <script>
    const ws = new WebSocket(`ws://${location.host}`);
    ws.onmessage = (e) => {
      document.getElementById('state').textContent = JSON.stringify(JSON.parse(e.data), null, 2);
    };
  </script>
</body>
</html>
```

- [ ] **Step 5: Test server manually**

Run: `cd dashboard && node server.js &`
Run: `curl -s http://localhost:3333/api/state`
Expected: JSON with all 8 agents in `idle` status

Run: `curl -s -X POST http://localhost:3333/api/events -H 'Content-Type: application/json' -d '{"type":"agent:start","agent":"architect","task":"Planning auth"}'`
Expected: `{"ok":true}`

Run: `curl -s http://localhost:3333/api/state | node -e "process.stdin.on('data',d=>{const s=JSON.parse(d);console.log(s.agents.architect.status)})"`
Expected: `working`

Run: `kill %1` (stop server)

- [ ] **Step 6: Commit**

```bash
git add dashboard/package.json dashboard/package-lock.json dashboard/server.js dashboard/public/index.html
git commit -m "feat(dashboard): add HTTP + WebSocket server with agent state management"
```

---

### Task 2: Hook script for Claude Code integration

**Files:**
- Create: `scripts/hooks/dashboard-event.js`
- Modify: `hooks/hooks.json`

- [ ] **Step 1: Create scripts/hooks/dashboard-event.js**

```js
#!/usr/bin/env node
'use strict';

const http = require('http');
const fs = require('fs');

// Read stdin (hook context from Claude Code)
let stdinData = '';
try {
  stdinData = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let hookContext;
try {
  hookContext = JSON.parse(stdinData);
} catch {
  process.exit(0);
}

const DASHBOARD_PORT = parseInt(process.env.ERNE_DASHBOARD_PORT || '3333', 10);

// Known ERNE agent keywords
const AGENT_KEYWORDS = [
  'architect', 'code-reviewer', 'tdd-guide', 'performance-profiler',
  'native-bridge-builder', 'expo-config-resolver', 'ui-designer', 'upgrade-assistant',
];

function detectAgent(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const keyword of AGENT_KEYWORDS) {
    if (lower.includes(keyword)) return keyword;
  }
  return null;
}

function extractTaskDescription(text) {
  if (!text) return '';
  // Take first 100 chars as task description
  return text.slice(0, 100).split('\n')[0];
}

// Determine event type from hook context
// PreToolUse with Agent tool → agent:start
// PostToolUse with Agent tool → agent:complete
const event = hookContext.event || '';
const toolName = hookContext.tool_name || hookContext.toolName || '';
const toolInput = hookContext.tool_input || hookContext.toolInput || {};

if (toolName !== 'Agent' && toolName !== 'agent') {
  process.exit(0);
}

const prompt = toolInput.prompt || toolInput.description || '';
const agentName = detectAgent(prompt);

if (!agentName) {
  process.exit(0);
}

let eventType;
if (event.toLowerCase().includes('pre')) {
  eventType = 'agent:start';
} else if (event.toLowerCase().includes('post')) {
  eventType = 'agent:complete';
} else {
  process.exit(0);
}

const payload = JSON.stringify({
  type: eventType,
  agent: agentName,
  task: extractTaskDescription(prompt),
});

// POST to dashboard server (fire and forget, silent on error)
const req = http.request(
  {
    hostname: '127.0.0.1',
    port: DASHBOARD_PORT,
    path: '/api/events',
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    timeout: 2000,
  },
  () => { process.exit(0); }
);

req.on('error', () => { process.exit(0); });
req.on('timeout', () => { req.destroy(); process.exit(0); });
req.write(payload);
req.end();
```

- [ ] **Step 2: Add hook entries to hooks/hooks.json**

Add these two entries to the `hooks` array in `hooks/hooks.json`:

```json
{
  "event": "PreToolUse",
  "pattern": "Agent",
  "script": "dashboard-event.js",
  "command": "node scripts/hooks/run-with-flags.js dashboard-event.js",
  "profiles": ["minimal", "standard", "strict"]
},
{
  "event": "PostToolUse",
  "pattern": "Agent",
  "script": "dashboard-event.js",
  "command": "node scripts/hooks/run-with-flags.js dashboard-event.js",
  "profiles": ["minimal", "standard", "strict"]
}
```

- [ ] **Step 3: Test hook script manually**

Run dashboard server first: `cd dashboard && node server.js &`

Then simulate a PreToolUse hook:
```bash
echo '{"event":"PreToolUse","tool_name":"Agent","tool_input":{"prompt":"Use architect to plan the auth module"}}' | node scripts/hooks/dashboard-event.js
```

Check state:
```bash
curl -s http://localhost:3333/api/state | node -e "process.stdin.on('data',d=>{const s=JSON.parse(d);console.log(s.agents.architect.status)})"
```
Expected: `working`

Simulate PostToolUse:
```bash
echo '{"event":"PostToolUse","tool_name":"Agent","tool_input":{"prompt":"Use architect to plan the auth module"}}' | node scripts/hooks/dashboard-event.js
```
Expected: status becomes `done`, then `idle` after 3 seconds.

Run: `kill %1`

- [ ] **Step 4: Commit**

```bash
git add scripts/hooks/dashboard-event.js hooks/hooks.json
git commit -m "feat(dashboard): add Claude Code hook script for agent event tracking"
```

---

## Chunk 2: Pixel Art Canvas Frontend

### Task 3: Canvas office renderer

**Files:**
- Create: `dashboard/public/canvas.js`

- [ ] **Step 1: Create dashboard/public/canvas.js**

This file renders the office background: 4 rooms with walls, floors, doors, desks, and computers.

```js
'use strict';

// Office layout constants
const TILE_SIZE = 16;
const OFFICE_COLS = 52;
const OFFICE_ROWS = 36;
const CANVAS_W = OFFICE_COLS * TILE_SIZE; // 832
const CANVAS_H = OFFICE_ROWS * TILE_SIZE; // 576

// Color palette
const COLORS = {
  wall: '#2C2137',
  wallLight: '#4A3F5C',
  floor: '#8B7355',
  floorAlt: '#7A6548',
  desk: '#5C4033',
  deskTop: '#8B6914',
  computer: '#1a1a2e',
  computerScreen: '#16213e',
  computerScreenOn: '#4CAF50',
  door: '#6B4226',
  doorFrame: '#8B5A2B',
  whiteboard: '#E8E8E8',
  whiteboardFrame: '#666666',
  coffeeMachine: '#333333',
  chair: '#4A3F5C',
  roomLabel: '#FFFFFF',
  headerBg: '#1a1a2e',
  headerText: '#E0E0E0',
};

// Room definitions (in tile coordinates)
const ROOMS = {
  development: { x: 1, y: 3, w: 24, h: 14, label: 'DEVELOPMENT' },
  review:      { x: 27, y: 3, w: 24, h: 14, label: 'REVIEW' },
  testing:     { x: 1, y: 19, w: 24, h: 14, label: 'TESTING' },
  conference:  { x: 27, y: 19, w: 24, h: 14, label: 'CONFERENCE' },
};

// Desk positions per room (tile coordinates, relative to room)
const DESK_POSITIONS = {
  development: [
    { x: 4, y: 4, agent: 'architect' },
    { x: 12, y: 4, agent: 'native-bridge-builder' },
    { x: 4, y: 9, agent: 'expo-config-resolver' },
    { x: 12, y: 9, agent: 'ui-designer' },
  ],
  review: [
    { x: 4, y: 4, agent: 'code-reviewer' },
    { x: 12, y: 4, agent: 'upgrade-assistant' },
  ],
  testing: [
    { x: 4, y: 4, agent: 'tdd-guide' },
    { x: 12, y: 4, agent: 'performance-profiler' },
  ],
  conference: [],
};

function drawOffice(ctx) {
  // Background
  ctx.fillStyle = COLORS.wall;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  // Header
  ctx.fillStyle = COLORS.headerBg;
  ctx.fillRect(0, 0, CANVAS_W, 3 * TILE_SIZE);
  ctx.fillStyle = COLORS.headerText;
  ctx.font = 'bold 20px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ERNE HQ', CANVAS_W / 2, 2 * TILE_SIZE);

  // Draw each room
  for (const [name, room] of Object.entries(ROOMS)) {
    drawRoom(ctx, room, name);
  }
}

function drawRoom(ctx, room, name) {
  const px = room.x * TILE_SIZE;
  const py = room.y * TILE_SIZE;
  const pw = room.w * TILE_SIZE;
  const ph = room.h * TILE_SIZE;

  // Floor (checkerboard)
  for (let row = 0; row < room.h; row++) {
    for (let col = 0; col < room.w; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.floor : COLORS.floorAlt;
      ctx.fillRect(px + col * TILE_SIZE, py + row * TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
  }

  // Walls (top and sides, 2px thick appearance)
  ctx.strokeStyle = COLORS.wallLight;
  ctx.lineWidth = 3;
  ctx.strokeRect(px, py, pw, ph);

  // Room label
  ctx.fillStyle = COLORS.roomLabel;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillText(room.label, px + pw / 2, py + 14);

  // Door (bottom center of room)
  const doorX = px + pw / 2 - TILE_SIZE;
  const doorY = py + ph - 2;
  ctx.fillStyle = COLORS.door;
  ctx.fillRect(doorX, doorY, TILE_SIZE * 2, 4);
  ctx.fillStyle = COLORS.doorFrame;
  ctx.fillRect(doorX - 2, doorY, 2, 4);
  ctx.fillRect(doorX + TILE_SIZE * 2, doorY, 2, 4);

  // Desks
  const desks = DESK_POSITIONS[name] || [];
  for (const desk of desks) {
    drawDesk(ctx, px + desk.x * TILE_SIZE, py + desk.y * TILE_SIZE);
  }

  // Room-specific furniture
  if (name === 'conference') {
    drawConferenceTable(ctx, px, py, pw, ph);
  }
  if (name === 'development') {
    drawWhiteboard(ctx, px + 20 * TILE_SIZE, py + 2 * TILE_SIZE);
  }
  if (name === 'testing') {
    drawWhiteboard(ctx, px + 20 * TILE_SIZE, py + 2 * TILE_SIZE);
  }
}

function drawDesk(ctx, x, y) {
  // Desk surface
  ctx.fillStyle = COLORS.desk;
  ctx.fillRect(x, y, TILE_SIZE * 3, TILE_SIZE * 2);
  ctx.fillStyle = COLORS.deskTop;
  ctx.fillRect(x + 2, y + 2, TILE_SIZE * 3 - 4, 4);

  // Computer monitor
  ctx.fillStyle = COLORS.computer;
  ctx.fillRect(x + TILE_SIZE, y - TILE_SIZE + 4, TILE_SIZE, TILE_SIZE - 4);
  ctx.fillStyle = COLORS.computerScreen;
  ctx.fillRect(x + TILE_SIZE + 2, y - TILE_SIZE + 6, TILE_SIZE - 4, TILE_SIZE - 10);

  // Chair (below desk)
  ctx.fillStyle = COLORS.chair;
  ctx.fillRect(x + TILE_SIZE - 2, y + TILE_SIZE * 2 + 2, TILE_SIZE + 4, TILE_SIZE - 4);
}

function drawConferenceTable(ctx, rx, ry, rw, rh) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  ctx.fillStyle = COLORS.desk;
  ctx.fillRect(cx - TILE_SIZE * 4, cy - TILE_SIZE * 1.5, TILE_SIZE * 8, TILE_SIZE * 3);
  ctx.fillStyle = COLORS.deskTop;
  ctx.fillRect(cx - TILE_SIZE * 4 + 3, cy - TILE_SIZE * 1.5 + 3, TILE_SIZE * 8 - 6, TILE_SIZE * 3 - 6);
}

function drawWhiteboard(ctx, x, y) {
  ctx.fillStyle = COLORS.whiteboardFrame;
  ctx.fillRect(x, y, TILE_SIZE * 3, TILE_SIZE * 2);
  ctx.fillStyle = COLORS.whiteboard;
  ctx.fillRect(x + 2, y + 2, TILE_SIZE * 3 - 4, TILE_SIZE * 2 - 4);
}

// Get absolute desk position for an agent
function getAgentDeskPosition(agentName) {
  for (const [roomName, desks] of Object.entries(DESK_POSITIONS)) {
    for (const desk of desks) {
      if (desk.agent === agentName) {
        const room = ROOMS[roomName];
        return {
          x: (room.x + desk.x) * TILE_SIZE + TILE_SIZE - 2,
          y: (room.y + desk.y) * TILE_SIZE + TILE_SIZE * 2 + 2,
          room: roomName,
        };
      }
    }
  }
  return null;
}

// Export for use in other modules
window.OfficeCanvas = {
  TILE_SIZE, CANVAS_W, CANVAS_H, COLORS, ROOMS, DESK_POSITIONS,
  drawOffice, getAgentDeskPosition,
};
```

- [ ] **Step 2: Verify canvas renders**

Update `dashboard/public/index.html` to load canvas.js and draw the office:

```html
<!DOCTYPE html>
<html>
<head>
  <title>ERNE Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #1a1a2e; display: flex; }
    #office-canvas { image-rendering: pixelated; }
  </style>
</head>
<body>
  <canvas id="office-canvas"></canvas>
  <script src="canvas.js"></script>
  <script>
    const canvas = document.getElementById('office-canvas');
    canvas.width = OfficeCanvas.CANVAS_W;
    canvas.height = OfficeCanvas.CANVAS_H;
    const ctx = canvas.getContext('2d');
    OfficeCanvas.drawOffice(ctx);
  </script>
</body>
</html>
```

Run: `cd dashboard && node server.js &`
Open: `http://localhost:3333` in browser
Expected: Pixel art office with 4 rooms, desks, computers, doors visible
Run: `kill %1`

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/canvas.js dashboard/public/index.html
git commit -m "feat(dashboard): add pixel-art office canvas renderer with 4 rooms"
```

---

### Task 4: Procedural agent sprites

**Files:**
- Create: `dashboard/public/agents.js`

- [ ] **Step 1: Create dashboard/public/agents.js**

Draws 32x32 pixel art characters procedurally with unique traits per agent.

```js
'use strict';

// Agent visual definitions
const AGENT_DEFS = {
  'architect': { bodyColor: '#3498db', traitColor: '#2980b9', trait: 'hardhat' },
  'native-bridge-builder': { bodyColor: '#e74c3c', traitColor: '#c0392b', trait: 'wrench' },
  'expo-config-resolver': { bodyColor: '#9b59b6', traitColor: '#8e44ad', trait: 'gear' },
  'ui-designer': { bodyColor: '#e91e63', traitColor: '#c2185b', trait: 'paintbrush' },
  'code-reviewer': { bodyColor: '#2ecc71', traitColor: '#27ae60', trait: 'glasses' },
  'upgrade-assistant': { bodyColor: '#f39c12', traitColor: '#e67e22', trait: 'arrow' },
  'tdd-guide': { bodyColor: '#1abc9c', traitColor: '#16a085', trait: 'testtube' },
  'performance-profiler': { bodyColor: '#e67e22', traitColor: '#d35400', trait: 'stopwatch' },
};

const SKIN_COLOR = '#FDBCB4';
const HAIR_COLOR = '#4A3728';

// Generate sprite frames for an agent onto an offscreen canvas
// Returns a canvas with 4 cols x 4 rows of 32x32 frames
function generateSpriteSheet(agentName) {
  const def = AGENT_DEFS[agentName];
  if (!def) return null;

  const sheet = document.createElement('canvas');
  sheet.width = 128;
  sheet.height = 128;
  const ctx = sheet.getContext('2d');

  // Row 0: IDLE (4 frames, subtle head bob)
  for (let f = 0; f < 4; f++) {
    const ox = f * 32;
    const oy = 0;
    const headBob = f === 1 || f === 2 ? -1 : 0;
    drawCharacter(ctx, ox, oy, def, headBob, false);
  }

  // Row 1: WORKING (4 frames, typing animation)
  for (let f = 0; f < 4; f++) {
    const ox = f * 32;
    const oy = 32;
    const armOffset = f % 2 === 0 ? -1 : 1;
    drawCharacter(ctx, ox, oy, def, 0, true, armOffset);
  }

  // Row 2: MOVING (4 frames, walk cycle)
  for (let f = 0; f < 4; f++) {
    const ox = f * 32;
    const oy = 64;
    const legOffset = f < 2 ? 1 : -1;
    drawWalkingCharacter(ctx, ox, oy, def, legOffset);
  }

  // Row 3: DONE (4 frames, checkmark)
  for (let f = 0; f < 4; f++) {
    const ox = f * 32;
    const oy = 96;
    drawCharacter(ctx, ox, oy, def, 0, false);
    if (f < 3) {
      drawCheckmark(ctx, ox, oy, f);
    }
  }

  return sheet;
}

function drawCharacter(ctx, ox, oy, def, headBob, typing, armOffset) {
  // Body (shirt)
  ctx.fillStyle = def.bodyColor;
  ctx.fillRect(ox + 10, oy + 14, 12, 10);

  // Head
  ctx.fillStyle = SKIN_COLOR;
  ctx.fillRect(ox + 11, oy + 4 + headBob, 10, 10);

  // Hair
  ctx.fillStyle = HAIR_COLOR;
  ctx.fillRect(ox + 11, oy + 3 + headBob, 10, 3);

  // Eyes
  ctx.fillStyle = '#333';
  ctx.fillRect(ox + 13, oy + 8 + headBob, 2, 2);
  ctx.fillRect(ox + 18, oy + 8 + headBob, 2, 2);

  // Arms
  ctx.fillStyle = def.bodyColor;
  if (typing && armOffset) {
    ctx.fillRect(ox + 7, oy + 15 + armOffset, 3, 6);
    ctx.fillRect(ox + 22, oy + 15 - armOffset, 3, 6);
  } else {
    ctx.fillRect(ox + 7, oy + 15, 3, 6);
    ctx.fillRect(ox + 22, oy + 15, 3, 6);
  }

  // Hands
  ctx.fillStyle = SKIN_COLOR;
  ctx.fillRect(ox + 7, oy + 21, 3, 2);
  ctx.fillRect(ox + 22, oy + 21, 3, 2);

  // Legs
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(ox + 11, oy + 24, 4, 6);
  ctx.fillRect(ox + 17, oy + 24, 4, 6);

  // Trait
  drawTrait(ctx, ox, oy + headBob, def);
}

function drawWalkingCharacter(ctx, ox, oy, def, legOffset) {
  // Body
  ctx.fillStyle = def.bodyColor;
  ctx.fillRect(ox + 10, oy + 14, 12, 10);

  // Head
  ctx.fillStyle = SKIN_COLOR;
  ctx.fillRect(ox + 11, oy + 4, 10, 10);

  // Hair
  ctx.fillStyle = HAIR_COLOR;
  ctx.fillRect(ox + 11, oy + 3, 10, 3);

  // Eyes
  ctx.fillStyle = '#333';
  ctx.fillRect(ox + 13, oy + 8, 2, 2);
  ctx.fillRect(ox + 18, oy + 8, 2, 2);

  // Arms (swinging)
  ctx.fillStyle = def.bodyColor;
  ctx.fillRect(ox + 7, oy + 15 + legOffset, 3, 6);
  ctx.fillRect(ox + 22, oy + 15 - legOffset, 3, 6);

  // Legs (walking)
  ctx.fillStyle = '#2c3e50';
  ctx.fillRect(ox + 11, oy + 24 + legOffset, 4, 6);
  ctx.fillRect(ox + 17, oy + 24 - legOffset, 4, 6);

  drawTrait(ctx, ox, oy, def);
}

function drawTrait(ctx, ox, oy, def) {
  ctx.fillStyle = def.traitColor;
  switch (def.trait) {
    case 'hardhat':
      ctx.fillRect(ox + 9, oy + 1, 14, 3);
      ctx.fillRect(ox + 11, oy + 0, 10, 2);
      break;
    case 'wrench':
      ctx.fillRect(ox + 24, oy + 6, 6, 2);
      ctx.fillRect(ox + 28, oy + 4, 2, 6);
      break;
    case 'gear':
      ctx.fillRect(ox + 25, oy + 5, 5, 5);
      ctx.fillStyle = def.bodyColor;
      ctx.fillRect(ox + 26, oy + 6, 3, 3);
      break;
    case 'paintbrush':
      ctx.fillRect(ox + 25, oy + 4, 2, 8);
      ctx.fillStyle = '#ff6b6b';
      ctx.fillRect(ox + 24, oy + 3, 4, 2);
      break;
    case 'glasses':
      ctx.fillStyle = '#666';
      ctx.fillRect(ox + 12, oy + 7, 8, 1);
      ctx.fillStyle = '#88CCFF';
      ctx.fillRect(ox + 12, oy + 7, 3, 3);
      ctx.fillRect(ox + 17, oy + 7, 3, 3);
      break;
    case 'arrow':
      ctx.fillRect(ox + 26, oy + 3, 2, 8);
      ctx.fillRect(ox + 24, oy + 3, 6, 2);
      ctx.fillRect(ox + 25, oy + 2, 4, 1);
      break;
    case 'testtube':
      ctx.fillStyle = '#88DDCC';
      ctx.fillRect(ox + 26, oy + 4, 3, 7);
      ctx.fillStyle = '#55BBAA';
      ctx.fillRect(ox + 26, oy + 8, 3, 3);
      break;
    case 'stopwatch':
      ctx.fillRect(ox + 25, oy + 5, 5, 5);
      ctx.fillStyle = '#FFF';
      ctx.fillRect(ox + 26, oy + 6, 3, 3);
      ctx.fillStyle = def.traitColor;
      ctx.fillRect(ox + 27, oy + 3, 1, 2);
      break;
  }
}

function drawCheckmark(ctx, ox, oy, frame) {
  const scale = (frame + 1) / 3;
  ctx.fillStyle = '#4CAF50';
  const cx = ox + 16;
  const cy = oy - 2;
  const s = Math.floor(4 * scale);
  ctx.fillRect(cx - s, cy - s, s * 2, s * 2);
  ctx.fillStyle = '#FFF';
  // Simple checkmark pixels
  if (frame >= 1) {
    ctx.fillRect(cx - 2, cy, 1, 1);
    ctx.fillRect(cx - 1, cy + 1, 1, 1);
    ctx.fillRect(cx, cy, 1, 1);
    ctx.fillRect(cx + 1, cy - 1, 1, 1);
  }
}

// Sprite animation state manager
const agentSprites = {};

function initAgentSprites() {
  for (const name of Object.keys(AGENT_DEFS)) {
    const sheet = generateSpriteSheet(name);
    const pos = window.OfficeCanvas.getAgentDeskPosition(name);
    agentSprites[name] = {
      sheet,
      x: pos ? pos.x : 0,
      y: pos ? pos.y : 0,
      targetX: pos ? pos.x : 0,
      targetY: pos ? pos.y : 0,
      room: pos ? pos.room : 'development',
      status: 'idle',
      frame: 0,
      frameTimer: 0,
    };
  }
}

function updateAgentState(agentName, status) {
  const sprite = agentSprites[agentName];
  if (!sprite) return;
  sprite.status = status;
  sprite.frame = 0;
  sprite.frameTimer = 0;
}

function updateAgentSprites(dt) {
  for (const sprite of Object.values(agentSprites)) {
    sprite.frameTimer += dt;
    if (sprite.frameTimer > 1000 / 12) { // 12 FPS sprite animation
      sprite.frameTimer = 0;
      sprite.frame = (sprite.frame + 1) % 4;
    }
  }
}

function drawAgentSprites(ctx) {
  for (const [name, sprite] of Object.entries(agentSprites)) {
    if (!sprite.sheet) continue;

    const row = sprite.status === 'idle' ? 0
      : sprite.status === 'working' ? 1
      : sprite.status === 'moving' ? 2
      : 3; // done

    const sx = sprite.frame * 32;
    const sy = row * 32;

    ctx.drawImage(sprite.sheet, sx, sy, 32, 32, sprite.x, sprite.y, 32, 32);

    // Status indicator dot above head
    const dotColor = sprite.status === 'working' ? '#4CAF50'
      : sprite.status === 'done' ? '#2196F3'
      : '#9E9E9E';
    ctx.fillStyle = dotColor;
    ctx.fillRect(sprite.x + 14, sprite.y - 4, 4, 4);

    // Name label
    ctx.fillStyle = '#FFF';
    ctx.font = '8px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(name.split('-')[0], sprite.x + 16, sprite.y + 38);
  }
}

window.AgentSprites = {
  AGENT_DEFS, agentSprites,
  initAgentSprites, updateAgentState, updateAgentSprites, drawAgentSprites,
};
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/agents.js
git commit -m "feat(dashboard): add procedural pixel-art agent sprites with animations"
```

---

### Task 5: Sidebar status panel

**Files:**
- Create: `dashboard/public/sidebar.js`

- [ ] **Step 1: Create dashboard/public/sidebar.js**

```js
'use strict';

const SIDEBAR_W = 220;
const SIDEBAR_PAD = 12;
const ROW_H = 52;

const STATUS_COLORS = {
  idle: '#9E9E9E',
  working: '#4CAF50',
  done: '#2196F3',
};

const STATUS_LABELS = {
  idle: 'IDLE',
  working: 'WORKING',
  done: 'DONE',
};

function drawSidebar(ctx, agents, canvasW, canvasH) {
  const sx = canvasW;
  const sy = 0;

  // Background
  ctx.fillStyle = '#16213e';
  ctx.fillRect(sx, sy, SIDEBAR_W, canvasH);

  // Header
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(sx, sy, SIDEBAR_W, 40);
  ctx.fillStyle = '#E0E0E0';
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('AGENTS', sx + SIDEBAR_W / 2, 26);

  // Separator
  ctx.fillStyle = '#2C2137';
  ctx.fillRect(sx, 40, SIDEBAR_W, 2);

  // Agent rows
  const agentNames = Object.keys(agents);
  let y = 46;

  for (const name of agentNames) {
    const agent = agents[name];
    const status = agent.status || 'idle';

    // Row background (alternating)
    ctx.fillStyle = agentNames.indexOf(name) % 2 === 0 ? '#1a1a3e' : '#16213e';
    ctx.fillRect(sx, y, SIDEBAR_W, ROW_H);

    // Status dot
    ctx.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.idle;
    ctx.beginPath();
    ctx.arc(sx + SIDEBAR_PAD + 6, y + 16, 5, 0, Math.PI * 2);
    ctx.fill();

    // Agent name
    ctx.fillStyle = '#E0E0E0';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(name, sx + SIDEBAR_PAD + 18, y + 19);

    // Status label
    ctx.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.idle;
    ctx.font = '9px monospace';
    ctx.fillText(STATUS_LABELS[status] || 'IDLE', sx + SIDEBAR_PAD + 18, y + 32);

    // Task (truncated)
    if (agent.task) {
      ctx.fillStyle = '#888';
      ctx.font = '8px monospace';
      const taskText = agent.task.length > 24 ? agent.task.slice(0, 24) + '...' : agent.task;
      ctx.fillText(taskText, sx + SIDEBAR_PAD + 18, y + 44);
    }

    y += ROW_H;
  }

  // Connection indicator (drawn by main loop)
}

function drawConnectionIndicator(ctx, canvasW, canvasH, connected) {
  const sx = canvasW + SIDEBAR_W - 16;
  const sy = canvasH - 16;
  ctx.fillStyle = connected ? '#4CAF50' : '#F44336';
  ctx.beginPath();
  ctx.arc(sx, sy, 5, 0, Math.PI * 2);
  ctx.fill();
}

window.Sidebar = {
  SIDEBAR_W,
  drawSidebar,
  drawConnectionIndicator,
};
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/sidebar.js
git commit -m "feat(dashboard): add sidebar status panel with agent list and status badges"
```

---

### Task 6: WebSocket client with auto-reconnect

**Files:**
- Create: `dashboard/public/ws-client.js`

- [ ] **Step 1: Create dashboard/public/ws-client.js**

```js
'use strict';

function createWSClient(onStateUpdate, onConnectionChange) {
  let ws = null;
  let reconnectDelay = 1000;
  const MAX_DELAY = 30000;
  let connected = false;

  function connect() {
    ws = new WebSocket(`ws://${location.host}`);

    ws.onopen = () => {
      connected = true;
      reconnectDelay = 1000;
      onConnectionChange(true);
    };

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'state' && data.agents) {
          onStateUpdate(data.agents);
        }
      } catch {}
    };

    ws.onclose = () => {
      connected = false;
      onConnectionChange(false);
      setTimeout(connect, reconnectDelay);
      reconnectDelay = Math.min(reconnectDelay * 2, MAX_DELAY);
    };

    ws.onerror = () => {
      ws.close();
    };
  }

  connect();

  return {
    isConnected: () => connected,
  };
}

window.WSClient = { createWSClient };
```

- [ ] **Step 2: Commit**

```bash
git add dashboard/public/ws-client.js
git commit -m "feat(dashboard): add WebSocket client with exponential backoff reconnect"
```

---

### Task 7: Wire everything together in index.html

**Files:**
- Modify: `dashboard/public/index.html`

- [ ] **Step 1: Rewrite dashboard/public/index.html**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERNE Dashboard</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #0a0a1a;
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      overflow: hidden;
    }
    canvas {
      image-rendering: pixelated;
      image-rendering: crisp-edges;
    }
  </style>
</head>
<body>
  <canvas id="dashboard"></canvas>

  <script src="canvas.js"></script>
  <script src="agents.js"></script>
  <script src="sidebar.js"></script>
  <script src="ws-client.js"></script>
  <script>
    const canvas = document.getElementById('dashboard');
    const totalW = OfficeCanvas.CANVAS_W + Sidebar.SIDEBAR_W;
    const totalH = OfficeCanvas.CANVAS_H;
    canvas.width = totalW;
    canvas.height = totalH;
    const ctx = canvas.getContext('2d');

    // Scale canvas to fit viewport
    function scaleCanvas() {
      const scaleX = window.innerWidth / totalW;
      const scaleY = window.innerHeight / totalH;
      const scale = Math.min(scaleX, scaleY, 2);
      canvas.style.width = Math.floor(totalW * scale) + 'px';
      canvas.style.height = Math.floor(totalH * scale) + 'px';
    }
    scaleCanvas();
    window.addEventListener('resize', scaleCanvas);

    // Initialize sprites
    AgentSprites.initAgentSprites();

    // State
    let agentServerState = {};
    let wsConnected = false;

    // WebSocket
    WSClient.createWSClient(
      (agents) => {
        agentServerState = agents;
        // Update sprite states
        for (const [name, state] of Object.entries(agents)) {
          AgentSprites.updateAgentState(name, state.status);
          if (AgentSprites.agentSprites[name]) {
            AgentSprites.agentSprites[name].task = state.task || '';
          }
        }
      },
      (connected) => {
        wsConnected = connected;
      }
    );

    // Main render loop
    let lastTime = 0;
    function render(time) {
      const dt = time - lastTime;
      lastTime = time;

      // Update animations
      AgentSprites.updateAgentSprites(dt);

      // Clear
      ctx.clearRect(0, 0, totalW, totalH);

      // Draw office
      OfficeCanvas.drawOffice(ctx);

      // Draw agents
      AgentSprites.drawAgentSprites(ctx);

      // Draw sidebar
      Sidebar.drawSidebar(ctx, agentServerState, OfficeCanvas.CANVAS_W, totalH);
      Sidebar.drawConnectionIndicator(ctx, OfficeCanvas.CANVAS_W, totalH, wsConnected);

      requestAnimationFrame(render);
    }
    requestAnimationFrame(render);
  </script>
</body>
</html>
```

- [ ] **Step 2: Test full integration**

Run: `cd dashboard && node server.js &`
Open: `http://localhost:3333`
Expected: Pixel art office with all 8 agents at their desks, sidebar showing all agents as IDLE, green connection dot.

Test agent status change:
```bash
curl -s -X POST http://localhost:3333/api/events -H 'Content-Type: application/json' -d '{"type":"agent:start","agent":"architect","task":"Planning navigation"}'
```
Expected: Architect sprite switches to typing animation, sidebar shows WORKING with green dot, task text visible.

```bash
curl -s -X POST http://localhost:3333/api/events -H 'Content-Type: application/json' -d '{"type":"agent:complete","agent":"architect"}'
```
Expected: Architect shows DONE with checkmark, then after 3s returns to IDLE.

Run: `kill %1`

- [ ] **Step 3: Commit**

```bash
git add dashboard/public/index.html
git commit -m "feat(dashboard): wire canvas, sprites, sidebar, and WebSocket into main render loop"
```

---

## Chunk 3: CLI Integration

### Task 8: lib/dashboard.js command

**Files:**
- Create: `lib/dashboard.js`

- [ ] **Step 1: Create lib/dashboard.js**

```js
'use strict';

const { fork } = require('child_process');
const { createServer } = require('net');
const { resolve } = require('path');
const { exec } = require('child_process');

module.exports = async function dashboard() {
  const args = process.argv.slice(3);
  let port = 3333;
  let noOpen = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = parseInt(args[i + 1], 10);
      i++;
    }
    if (args[i] === '--no-open') {
      noOpen = true;
    }
  }

  // Validate port
  if (isNaN(port) || port < 1 || port > 65535) {
    console.error(`Invalid port: ${process.argv[process.argv.indexOf('--port') + 1]}. Must be 1-65535.`);
    process.exit(1);
  }

  // Check port availability
  const available = await checkPort(port);
  if (!available) {
    console.error(`Port ${port} is already in use. Try: erne dashboard --port ${port + 1}`);
    process.exit(1);
  }

  // Auto-configure hooks if needed
  await ensureHooksConfigured();

  // Start dashboard server
  const serverPath = resolve(__dirname, '../dashboard/server.js');
  const child = fork(serverPath, [], {
    env: { ...process.env, ERNE_DASHBOARD_PORT: String(port) },
    stdio: 'pipe',
  });

  child.stdout.on('data', (data) => process.stdout.write(data));
  child.stderr.on('data', (data) => process.stderr.write(data));

  // Wait for server to be ready
  await new Promise((resolve) => setTimeout(resolve, 500));

  const url = `http://localhost:${port}`;
  console.log(`ERNE Dashboard running at ${url}`);

  // Open browser
  if (!noOpen) {
    const openCmd = process.platform === 'darwin' ? 'open'
      : process.platform === 'win32' ? 'start'
      : 'xdg-open';
    exec(`${openCmd} ${url}`);
  }

  // Clean shutdown
  process.on('SIGINT', () => {
    child.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    child.kill();
    process.exit(0);
  });

  // Keep alive
  child.on('exit', (code) => {
    console.log(`Dashboard server exited with code ${code}`);
    process.exit(code || 0);
  });
};

function checkPort(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port);
  });
}

async function ensureHooksConfigured() {
  const fs = require('fs');
  const path = require('path');
  const readline = require('readline/promises');

  const hooksPath = resolve(__dirname, '../hooks/hooks.json');
  let config;
  try {
    config = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
  } catch {
    return; // No hooks file, skip
  }

  const hasDashboardHook = config.hooks.some(h => h.script === 'dashboard-event.js');
  if (hasDashboardHook) return;

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question('Dashboard hooks not configured. Add them now? (Y/n) ');
  rl.close();

  if (answer.toLowerCase() === 'n') return;

  config.hooks.push(
    {
      event: 'PreToolUse',
      pattern: 'Agent',
      script: 'dashboard-event.js',
      command: 'node scripts/hooks/run-with-flags.js dashboard-event.js',
      profiles: ['minimal', 'standard', 'strict'],
    },
    {
      event: 'PostToolUse',
      pattern: 'Agent',
      script: 'dashboard-event.js',
      command: 'node scripts/hooks/run-with-flags.js dashboard-event.js',
      profiles: ['minimal', 'standard', 'strict'],
    }
  );

  fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2) + '\n');
  console.log('Dashboard hooks added to hooks/hooks.json');
}
```

- [ ] **Step 2: Create lib/start.js**

**Files:**
- Create: `lib/start.js`

```js
'use strict';

const { spawn } = require('child_process');
const { resolve } = require('path');

module.exports = async function start() {
  // Run init — lib/init.js exports async function init() directly
  const init = require('./init');
  await init();

  // Start dashboard in background
  const port = 3333;
  const serverPath = resolve(__dirname, '../dashboard/server.js');

  const child = spawn('node', [serverPath], {
    env: { ...process.env, ERNE_DASHBOARD_PORT: String(port) },
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
  console.log(`ERNE Dashboard started in background at http://localhost:${port}`);
};
```

- [ ] **Step 3: Update bin/cli.js with new commands**

Add `dashboard` and `start` to the `COMMANDS` object in `bin/cli.js`:

```js
dashboard: () => require('../lib/dashboard'),
start: () => require('../lib/start'),
```

Update the help text to include:
```
    dashboard  Launch the visual agent dashboard
    start      Initialize project + launch dashboard
```

- [ ] **Step 4: Test CLI commands**

Run: `node bin/cli.js dashboard --no-open &`
Expected: `ERNE Dashboard running at http://localhost:3333`

Run: `curl -s http://localhost:3333/api/state | head -c 50`
Expected: JSON starting with `{"agents":{`

Run: `kill %1`

Run: `node bin/cli.js help`
Expected: Help text includes `dashboard` and `start` commands

- [ ] **Step 5: Commit**

```bash
git add lib/dashboard.js lib/start.js bin/cli.js
git commit -m "feat(cli): add 'erne dashboard' and 'erne start' commands"
```

---

### Task 9: End-to-end integration test

- [ ] **Step 1: Full flow test**

Start the dashboard:
```bash
node bin/cli.js dashboard --no-open &
```

Simulate a full agent lifecycle via hook script:
```bash
# Agent starts
echo '{"event":"PreToolUse","tool_name":"Agent","tool_input":{"prompt":"Use architect to plan the auth module"}}' | node scripts/hooks/dashboard-event.js

# Wait and check
sleep 1
curl -s http://localhost:3333/api/state | node -e "process.stdin.on('data',d=>{const a=JSON.parse(d).agents;console.log('architect:',a.architect.status,'task:',a.architect.task)})"
```
Expected: `architect: working task: Use architect to plan the auth module`

```bash
# Agent completes
echo '{"event":"PostToolUse","tool_name":"Agent","tool_input":{"prompt":"Use architect to plan the auth module"}}' | node scripts/hooks/dashboard-event.js

sleep 1
curl -s http://localhost:3333/api/state | node -e "process.stdin.on('data',d=>{const a=JSON.parse(d).agents;console.log('architect:',a.architect.status)})"
```
Expected: `architect: done` (then `idle` after 3 more seconds)

```bash
# Test multiple agents
echo '{"event":"PreToolUse","tool_name":"Agent","tool_input":{"prompt":"Run code-reviewer on PR #42"}}' | node scripts/hooks/dashboard-event.js
echo '{"event":"PreToolUse","tool_name":"Agent","tool_input":{"prompt":"Use tdd-guide for auth tests"}}' | node scripts/hooks/dashboard-event.js

sleep 1
curl -s http://localhost:3333/api/state | node -e "process.stdin.on('data',d=>{const a=JSON.parse(d).agents;console.log('code-reviewer:',a['code-reviewer'].status);console.log('tdd-guide:',a['tdd-guide'].status)})"
```
Expected:
```
code-reviewer: working
tdd-guide: working
```

Run: `kill %1`

- [ ] **Step 2: Commit final integration**

```bash
git add -A
git commit -m "feat(dashboard): complete ERNE Agent Dashboard v1 with pixel-art office"
```

---

## Summary

| Task | Description | Files |
|------|-------------|-------|
| 1 | Dashboard server + event API | `dashboard/server.js`, `dashboard/package.json` |
| 2 | Hook script for Claude Code | `scripts/hooks/dashboard-event.js`, `hooks/hooks.json` |
| 3 | Canvas office renderer | `dashboard/public/canvas.js` |
| 4 | Procedural agent sprites | `dashboard/public/agents.js` |
| 5 | Sidebar status panel | `dashboard/public/sidebar.js` |
| 6 | WebSocket client | `dashboard/public/ws-client.js` |
| 7 | Wire everything in index.html | `dashboard/public/index.html` |
| 8 | CLI commands (dashboard, start) | `lib/dashboard.js`, `lib/start.js`, `bin/cli.js` |
| 9 | End-to-end integration test | Manual test script |
