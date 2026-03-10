# ERNE Agent Dashboard — Design Spec

**Date:** 2026-03-11
**Status:** Approved

## Overview

A local pixel-art visual dashboard that shows all ERNE agents working in real-time. When a user starts the ERNE agent system, a local server launches and opens a browser with an animated "office" where each agent sits at a desk, moves between rooms, and visually reflects its current status.

Inspired by OpenClaw's "Agents Team" view.

## Architecture

```
Claude Code Hooks → HTTP POST → Dashboard Server → WebSocket → Browser Canvas
```

### Components

1. **Dashboard Server** (`dashboard/server.js`) — Node.js HTTP + WebSocket server. Uses `ws` npm package for WebSocket (the only dependency).
2. **Claude Code Hooks** — `PreToolUse` (pattern: `Agent`) and `PostToolUse` (pattern: `Agent`) hooks that POST events to `localhost:3333/api/events` via a Node.js hook script.
3. **Frontend** (`dashboard/public/`) — HTML5 Canvas pixel-art office + WebSocket client
4. **CLI Integration** (`bin/cli.js`) — `erne dashboard` and `erne start` commands added to COMMANDS map

### File Structure

```
dashboard/
├── server.js          # HTTP + WebSocket server (ws package)
├── package.json       # { "dependencies": { "ws": "^8" } }
├── public/
│   ├── index.html     # Entry point
│   ├── canvas.js      # Office renderer (rooms, furniture, grid)
│   ├── agents.js      # Agent sprites & animations
│   ├── sidebar.js     # Status panel
│   ├── ws-client.js   # WebSocket connection (auto-reconnect)
│   └── sprites/       # Pixel art assets (optional future PNGs)
scripts/hooks/
├── dashboard-event.js # Hook script that parses stdin and POSTs to dashboard
```

### Changes to Existing Files

- **`bin/cli.js`**: Add `dashboard` and `start` to `COMMANDS` map. `dashboard` spawns `dashboard/server.js`. `start` runs existing init + spawns dashboard in background.
- **`hooks/hooks.json`**: Add two new entries for `PreToolUse` (pattern: `Agent`) and `PostToolUse` (pattern: `Agent`) pointing to `dashboard-event.js`, profile: `["minimal", "standard", "strict"]`.
- **`package.json`**: Add `ws` as dependency.

## Office Layout

4 rooms, each mapped to agent roles:

```
┌──────────────────────────────────────────────┐
│                  ERNE HQ                     │
│  ┌──────────────┐  ┌──────────────┐          │
│  │ DEVELOPMENT  │  │   REVIEW     │          │
│  │  architect   │  │ code-reviewer│          │
│  │  native-     │  │ upgrade-     │          │
│  │  bridge-     │  │ assistant    │          │
│  │  builder     │  │              │          │
│  │  expo-config │  │              │          │
│  │  ui-designer │  │              │          │
│  └──────────────┘  └──────────────┘          │
│  ┌──────────────┐  ┌──────────────┐ ┌──────┐ │
│  │  TESTING     │  │ CONFERENCE   │ │SIDE- │ │
│  │  tdd-guide   │  │ (multi-agent │ │BAR   │ │
│  │  performance │  │  tasks)      │ │      │ │
│  │  profiler    │  │              │ │      │ │
│  └──────────────┘  └──────────────┘ └──────┘ │
└──────────────────────────────────────────────┘
```

### Agent-Room Assignment

| Agent | Default Room | Sprite Trait |
|-------|-------------|-------------|
| architect | Development | Blue hard hat |
| native-bridge-builder | Development | Wrench |
| expo-config-resolver | Development | Gear icon |
| ui-designer | Development | Paintbrush |
| code-reviewer | Review | Glasses |
| upgrade-assistant | Review | Arrow up |
| tdd-guide | Testing | Test tube |
| performance-profiler | Testing | Stopwatch |

## Agent States & Animations

- **IDLE** — Sitting at desk, head bob animation
- **WORKING** — Typing on computer, screen text animation, colored indicator on desk
- **MOVING** — Walking to Conference Room for multi-agent tasks
- **DONE** — Green checkmark popup, then returns to IDLE

Note: ERROR state is deferred to v2. In v1, agents that time out transition directly from WORKING to IDLE.

## Event System

### Hook Implementation

Claude Code hooks receive context via stdin as JSON. The hook script `scripts/hooks/dashboard-event.js` reads stdin, extracts the agent name from the tool input parameters, and POSTs to the dashboard server.

**Hook entries in `hooks/hooks.json`:**

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

**`dashboard-event.js` logic:**

```js
// Reads hook context from stdin (JSON)
// PreToolUse with Agent pattern → extracts agent name from tool_input.prompt
// PostToolUse with Agent pattern → agent completed
// Maps agent name to ERNE agent by keyword matching
// POSTs { type, agent, task } to http://localhost:3333/api/events
// Silently fails if dashboard server is not running (non-blocking)
```

The script uses `http` built-in module (no dependencies). It matches agent names by scanning the `prompt` field for known ERNE agent keywords (architect, code-reviewer, tdd-guide, etc.).

### Event Schema

```js
{
  type: "agent:start" | "agent:complete" | "tool:call",
  agent: "architect" | "code-reviewer" | ...,
  task: "Planning authentication module",  // optional, from prompt
  timestamp: 1710000000000                  // added by server
}
```

### Server State (in-memory)

```js
agents: {
  "architect": {
    status: "working",    // idle | working | done
    task: "Planning auth module",
    room: "development",
    startedAt: 1710000000000,
    lastEvent: 1710000005000
  }
}
```

Auto-timeout: if no event from agent for 5 minutes, status transitions directly to IDLE.

## CLI Integration

```bash
erne dashboard              # Start on port 3333, open browser
erne dashboard --port 4444  # Custom port
erne dashboard --no-open    # Don't open browser

erne start                  # Existing functionality + dashboard in background
```

### Changes to `bin/cli.js`

Add to `COMMANDS`:

```js
dashboard: () => require('../lib/dashboard'),
start: () => require('../lib/start'),
```

Update help text to include `dashboard` and `start` commands.

### `lib/dashboard.js` Flow

1. Parse `--port` (default 3333) and `--no-open` flags from `process.argv`
2. Check if port is available (try `net.createServer().listen()`)
3. Start `dashboard/server.js` via `child_process.fork()`
4. Open `http://localhost:{port}` in browser (`open` on macOS, `xdg-open` on Linux)
5. Console: `ERNE Dashboard running at http://localhost:{port}`
6. Handle SIGINT for clean shutdown (kill child process)

### `lib/start.js` Flow

1. Run existing `init` logic
2. Spawn dashboard in background (detached, stdio ignored)
3. Log dashboard URL

### Auto Hook Setup

On first `erne dashboard` run, checks `.claude/hooks.json` for dashboard-event entries. If missing, prompts:
```
Dashboard hooks not configured. Add them now? (Y/n)
```
If yes, appends the two hook entries to the hooks array.

## Error Handling

### Dashboard Server
- **Port in use**: Log error and suggest `--port` flag, exit 1
- **CORS**: Not needed — hooks use `curl`/`http.request` (not browser), and the browser frontend is served from the same origin
- **Malformed events**: Validate incoming JSON, ignore invalid payloads with a warning log

### WebSocket Client (browser)
- **Disconnection**: Auto-reconnect with exponential backoff (1s, 2s, 4s, max 30s)
- **Connection indicator**: Small dot in the corner — green=connected, red=disconnected

### Hook Script
- **Dashboard not running**: `dashboard-event.js` catches connection errors silently (no stderr, no exit code) so it never blocks Claude Code
- **Invalid stdin**: Skip and exit 0

## Sprite System

### Procedural Pixel Art (v1)

Sprites are drawn programmatically on Canvas (no PNG files needed for v1). Each agent is 32x32 pixels with unique visual traits.

### Sprite Sheet Layout (per agent, programmatic)

```
┌────┬────┬────┬────┐
│ I1 │ I2 │ I3 │ I4 │  IDLE (row 0)
├────┼────┼────┼────┤
│ W1 │ W2 │ W3 │ W4 │  WORKING (row 1)
├────┼────┼────┼────┤
│ M1 │ M2 │ M3 │ M4 │  MOVING (row 2)
├────┼────┼────┼────┤
│ D1 │ D2 │ D3 │ D4 │  DONE (row 3)
└────┴────┴────┴────┘
128x128 total per agent
```

### Rendering

- Office background: pre-rendered static tilemap
- Rooms separated by doors
- Each desk has assigned `{x, y}` position
- Animation: `requestAnimationFrame` at 12 FPS sprite / 60 FPS canvas
- Room furniture: desks, computers, whiteboard, coffee machine

### Color Palette

- Office background: #2C2137, #4A3F5C, #7B6B8D
- Room floor: #8B7355
- Furniture: #5C4033, #8B6914
- Status: WORKING=#4CAF50, IDLE=#9E9E9E, DONE=#2196F3

## Scope Boundaries

**In scope (v1):**
- Dashboard server with WebSocket (`ws` package)
- Pixel art office with 4 rooms
- 8 agent sprites (procedural)
- Agent status tracking via Claude Code hooks (PreToolUse/PostToolUse with Agent pattern)
- Sidebar with agent list and status
- CLI commands (`erne dashboard`, `erne start` integration)
- Auto hook configuration
- WebSocket auto-reconnect
- Auto-timeout for stale agents

**Out of scope (v2+):**
- ERROR state with dedicated hook
- Hand-drawn PNG sprites
- Task history / timeline view
- Multiple user sessions
- Remote access
- Sound effects
- Agent chat/communication visualization
