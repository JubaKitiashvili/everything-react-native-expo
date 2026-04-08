const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
// Optional context features (require better-sqlite3 — a native C++ addon)
let contextAvailable = false;
let openProjectDb, openSessionDb, closeDb, truncate, KnowledgeBase, SessionTracker;
let buildSnapshot, saveSnapshot, loadLatestSnapshot, restorePrompt, BudgetManager, AgentPreloader;

try {
  const db = require('./lib/context/db');
  openProjectDb = db.openProjectDb;
  openSessionDb = db.openSessionDb;
  closeDb = db.closeDb;
  truncate = require('./lib/context/truncation').truncate;
  KnowledgeBase = require('./lib/context/knowledge-base').KnowledgeBase;
  SessionTracker = require('./lib/context/session-tracker').SessionTracker;
  const sc = require('./lib/context/session-continuity');
  buildSnapshot = sc.buildSnapshot;
  saveSnapshot = sc.saveSnapshot;
  loadLatestSnapshot = sc.loadLatestSnapshot;
  restorePrompt = sc.restorePrompt;
  BudgetManager = require('./lib/context/budget-manager').BudgetManager;
  AgentPreloader = require('./lib/context/preloader').AgentPreloader;
  contextAvailable = true;
} catch {
  // better-sqlite3 not installed — context features disabled
  console.warn('  Context features disabled (better-sqlite3 not installed)');
}
const { AGENT_DEFINITIONS: SHARED_AGENT_DEFS } = require('./lib/agents-config');
const { handleTasks, handleUpload } = require('./lib/api/tasks');
const { handleAgents, registerCustomAgents } = require('./lib/api/agents');
const { handleIssueFix, handleFixCapabilities } = require('./lib/api/issues-fix');
const { handleMcp } = require('./lib/api/mcp');

// Tab feature modules (loaded lazily to avoid errors if dirs don't exist yet)
let ecosystemHandler, upgradesHandler, insightsHandler, myappHandler;
try {
  ecosystemHandler = require('./lib/ecosystem/handler');
} catch (e) {
  ecosystemHandler = null;
}
try {
  upgradesHandler = require('./lib/upgrades/handler');
} catch (e) {
  upgradesHandler = null;
}
try {
  insightsHandler = require('./lib/insights/handler');
} catch (e) {
  insightsHandler = null;
}
try {
  myappHandler = require('./lib/myapp/handler');
} catch (e) {
  myappHandler = null;
}

const {
  registerPort,
  unregisterPort,
  findFreePort,
  getRegisteredPort,
  PORT_RANGE_START,
  PORT_RANGE_END,
} = require('../scripts/hooks/lib/port-registry');

// Port resolution: --port flag > ERNE_DASHBOARD_PORT env > registry > find free port
// Actual port is resolved asynchronously at startup; this is the initial value
let PORT = parseInt(process.env.ERNE_DASHBOARD_PORT, 10) || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;
const TIMEOUT_CHECK_INTERVAL_MS = 30 * 1000;
const DONE_TO_IDLE_DELAY_MS = 3000;
const MAX_HISTORY_PER_AGENT = 50;
const ERNE_DIR = path.join(os.homedir(), '.erne');
const HISTORY_FILE = path.join(ERNE_DIR, 'activity-history.json');

// Ensure ~/.erne/ directory exists
try {
  fs.mkdirSync(ERNE_DIR, { recursive: true });
} catch {
  /* ignore */
}

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.map': 'application/json',
};

const AGENT_DEFINITIONS = SHARED_AGENT_DEFS;

// Rate limiting — 60 requests per minute per IP
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 60;
const rateLimitMap = new Map();

const isRateLimited = (ip) => {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry) {
    rateLimitMap.set(ip, { timestamps: [now] });
    return false;
  }
  // Prune timestamps outside the window
  entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (entry.timestamps.length >= RATE_LIMIT_MAX) {
    return true;
  }
  entry.timestamps.push(now);
  return false;
};

// Periodically clean up stale rate limit entries
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    entry.timestamps = entry.timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (entry.timestamps.length === 0) {
      rateLimitMap.delete(ip);
    }
  }
}, RATE_LIMIT_WINDOW_MS);

const agentState = {};

const initAgentState = () => {
  for (const def of AGENT_DEFINITIONS) {
    agentState[def.name] = {
      status: 'idle',
      task: null,
      room: def.room,
      startedAt: null,
      lastEvent: null,
    };
  }

  // Discover agents from .claude/agents/ so init-generated agents appear on dashboard
  const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
  const agentsDir = path.join(projectDir, '.claude', 'agents');
  try {
    if (fs.existsSync(agentsDir)) {
      const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const name = path.basename(file, '.md');
        if (!agentState[name]) {
          agentState[name] = {
            status: 'idle',
            task: null,
            room: 'development',
            startedAt: null,
            lastEvent: null,
          };
        }
      }
    }
  } catch {
    // Silent — agent discovery is best-effort
  }
};

initAgentState();

// Context optimization state
let projectDb = null;
let sessionDb = null;
let knowledgeBase = null;
let sessionTracker = null;
let budgetManager = null;
let preloader = null;
let contextEnabled = false;

function initContext(projectDir) {
  if (!contextAvailable) {
    // better-sqlite3 not installed — skip context initialization
    return null;
  }
  try {
    const erneDir = path.join(projectDir, '.erne');
    const sessionsDir = path.join(erneDir, 'sessions');
    if (!fs.existsSync(erneDir)) fs.mkdirSync(erneDir, { recursive: true });
    if (!fs.existsSync(sessionsDir)) fs.mkdirSync(sessionsDir, { recursive: true });

    projectDb = openProjectDb(path.join(erneDir, 'project.db'));
    const sessionId = crypto.randomUUID();
    sessionDb = openSessionDb(path.join(sessionsDir, `${sessionId}.db`));

    knowledgeBase = new KnowledgeBase(projectDb);
    sessionTracker = new SessionTracker(sessionDb);
    budgetManager = new BudgetManager(projectDb);
    preloader = new AgentPreloader(projectDb);
    contextEnabled = true;

    // Write session ID for hooks
    fs.writeFileSync(path.join(erneDir, 'current-session-id'), sessionId);

    return sessionId;
  } catch (err) {
    console.error('[ERNE] Context init failed:', err.message);
    return null;
  }
}

// Activity history — ring buffer per agent with JSON persistence
const activityHistory = {};

const initHistory = () => {
  for (const def of AGENT_DEFINITIONS) {
    activityHistory[def.name] = [];
  }
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
registerCustomAgents(agentState, activityHistory);

const addHistoryEntry = (agentName, entry) => {
  if (!activityHistory[agentName]) return;
  activityHistory[agentName].push(entry);
  if (activityHistory[agentName].length > MAX_HISTORY_PER_AGENT) {
    activityHistory[agentName].shift();
  }
};

let persistTimer = null;
let persistDirty = false;
const persistHistory = () => {
  persistDirty = true;
  if (persistTimer) return;
  persistTimer = setTimeout(async () => {
    persistTimer = null;
    if (!persistDirty) return;
    persistDirty = false;
    try {
      await fs.promises.writeFile(HISTORY_FILE, JSON.stringify(activityHistory, null, 2));
    } catch {
      // Silent fail — persistence is best-effort
    }
  }, 5000);
};

let lastActiveAgent = null;
let lastAudit = null;
let lastWorkerState = null;
const workerTasks = new Map(); // Multi-task tracking: ticketId -> task state

const handleEvent = (event) => {
  const { type, agent, agents: agentList, task } = event;

  // Planning events affect multiple agents
  if (type === 'planning:start') {
    const now = new Date().toISOString();
    const targets = agentList || Object.keys(agentState);
    for (const name of targets) {
      if (!agentState[name]) continue;
      agentState[name].status = 'planning';
      agentState[name].task = task ? String(task).slice(0, 500) : 'Team planning session';
      agentState[name].lastEvent = now;
      addHistoryEntry(name, {
        type: 'planning',
        task: task || 'Team planning session',
        timestamp: now,
      });
    }
    persistHistory();
    return { ok: true };
  }

  if (type === 'planning:end') {
    const now = new Date().toISOString();
    for (const name of Object.keys(agentState)) {
      if (agentState[name].status === 'planning') {
        agentState[name].status = 'idle';
        agentState[name].task = null;
        agentState[name].lastEvent = now;
      }
    }
    persistHistory();
    return { ok: true };
  }

  if (type === 'audit:complete') {
    lastAudit = { ...event, receivedAt: new Date().toISOString() };
    return { ok: true };
  }

  // Visual debug events — log and store
  if (type && type.startsWith('visual-debug:')) {
    const now = new Date().toISOString();
    if (agent && agentState[agent]) {
      agentState[agent].lastEvent = now;
      addHistoryEntry(agent, { type, task: task || null, timestamp: now });
      persistHistory();
    }
    return { ok: true };
  }

  // Worker events — update worker state, cache tasks, broadcast
  if (type && type.startsWith('worker:')) {
    const now = new Date().toISOString();
    if (type === 'worker:start') {
      lastWorkerState = {
        status: 'polling',
        provider: event.provider || event.providerType,
        repo: event.repo,
        interval: event.intervalMs || event.interval,
        startedAt: now,
        lastEvent: now,
        currentTicket: null,
      };
    } else if (type === 'worker:task-start') {
      const ticketId = event.ticketId || event.identifier;
      const taskState = {
        ticketId,
        title: event.title || ticketId,
        source: event.source || (lastWorkerState && lastWorkerState.provider) || 'worker',
        status: 'in_progress',
        confidence: event.confidence,
        agent: event.agent,
        startedAt: now,
      };
      workerTasks.set(ticketId, taskState);
      if (lastWorkerState) {
        lastWorkerState.status = 'working';
        lastWorkerState.currentTicket = taskState;
        lastWorkerState.lastEvent = now;
      }
    } else if (type === 'worker:step') {
      const ticketId = event.taskId || event.ticketId;
      if (ticketId && workerTasks.has(ticketId)) {
        workerTasks.get(ticketId).step = event.step;
      }
      if (lastWorkerState && lastWorkerState.currentTicket) {
        lastWorkerState.currentTicket.step = event.step;
        lastWorkerState.lastEvent = now;
      }
    } else if (type === 'worker:task-complete') {
      const ticketId = event.ticketId || event.identifier;
      if (ticketId && workerTasks.has(ticketId)) {
        const task = workerTasks.get(ticketId);
        task.status = event.prUrl ? 'in_review' : 'done';
        task.prUrl = event.prUrl;
        task.completedAt = now;
        task.success = event.success;
        task.agent = event.agent || task.agent;
      }
      if (lastWorkerState) {
        lastWorkerState.status = 'polling';
        lastWorkerState.currentTicket = null;
        lastWorkerState.lastEvent = now;
      }
    } else if (type === 'worker:idle') {
      if (lastWorkerState) {
        lastWorkerState.status = 'polling';
        lastWorkerState.lastEvent = now;
      }
    } else if (lastWorkerState) {
      lastWorkerState.lastEvent = now;
    }
    // Broadcast worker state to all WebSocket clients
    broadcast({
      type: 'worker_update',
      state: lastWorkerState,
      tasks: Array.from(workerTasks.values()),
    });
    return { ok: true };
  }

  if (!agent) {
    return { error: 'Missing agent name' };
  }

  // Auto-register unknown agents so dynamically generated agents show up
  if (!agentState[agent]) {
    agentState[agent] = {
      status: 'idle',
      task: null,
      room: 'development',
      startedAt: null,
      lastEvent: null,
    };
    if (!activityHistory[agent]) {
      activityHistory[agent] = [];
    }
  }

  const now = new Date().toISOString();
  const state = agentState[agent];
  state.lastEvent = now;

  if (type === 'agent:start') {
    // Record agent transition for preloader predictions
    if (preloader && lastActiveAgent && lastActiveAgent !== agent) {
      try {
        preloader.recordTransition(lastActiveAgent, agent);
      } catch {}
    }
    lastActiveAgent = agent;

    state.status = 'working';
    state.task = task ? String(task).slice(0, 500) : null;
    state.startedAt = now;
    addHistoryEntry(agent, {
      type: 'start',
      task: task || null,
      timestamp: now,
    });
    persistHistory();
  } else if (type === 'agent:complete') {
    const duration = state.startedAt ? Date.now() - new Date(state.startedAt).getTime() : null;
    addHistoryEntry(agent, {
      type: 'complete',
      task: task || state.task,
      timestamp: now,
      durationMs: duration,
    });
    state.status = 'done';
    state.task = task ? String(task).slice(0, 500) : state.task;
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

let wss;

const broadcastState = () => {
  if (!wss) return;
  const data = JSON.stringify({ type: 'state', agents: agentState });
  for (const client of wss.clients) {
    if (client.readyState === 1) {
      client.send(data);
    }
  }
};

// Auto-timeout: reset agents to idle after 5 minutes of no events
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const name of Object.keys(agentState)) {
    const agent = agentState[name];
    if (agent.status !== 'idle' && agent.lastEvent) {
      const elapsed = now - new Date(agent.lastEvent).getTime();
      if (elapsed > AGENT_TIMEOUT_MS) {
        const timeoutNow = new Date().toISOString();
        addHistoryEntry(name, {
          type: 'timeout',
          task: agent.task,
          timestamp: timeoutNow,
        });
        agent.status = 'idle';
        agent.task = null;
        agent.startedAt = null;
        changed = true;
      }
    }
  }
  if (changed) {
    persistHistory();
    broadcastState();
  }
}, TIMEOUT_CHECK_INTERVAL_MS);

const MAX_PAYLOAD_BYTES = 64 * 1024; // 64KB

const parseBody = (req) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;
    req.on('data', (chunk) => {
      totalBytes += chunk.length;
      if (totalBytes > MAX_PAYLOAD_BYTES) {
        req.destroy();
        reject(new RangeError('Payload too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });

const serveStatic = (req, res) => {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(PUBLIC_DIR, urlPath);
  const resolved = path.resolve(filePath);

  // Directory traversal prevention
  if (!resolved.startsWith(PUBLIC_DIR + path.sep) && resolved !== PUBLIC_DIR) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return;
  }

  const ext = path.extname(resolved);
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  fs.readFile(resolved, (err, data) => {
    if (err) {
      // SPA fallback: serve index.html for non-file, non-API routes
      const indexPath = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexPath, (err2, indexData) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('Not Found');
          return;
        }
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(indexData);
      });
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
};

function handleContextApi(req, res, urlPath, body) {
  // Status check — always available
  if (urlPath === '/api/context/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ enabled: contextEnabled }));
    return;
  }

  // Enable context at runtime from dashboard
  if (urlPath === '/api/context/enable' && req.method === 'POST') {
    if (contextEnabled) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true,"message":"already enabled"}');
      return;
    }
    const dir = process.env.ERNE_PROJECT_DIR || process.cwd();
    const sessionId = initContext(dir);
    if (sessionId) {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, sessionId: sessionId.slice(0, 8) }));
    } else {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":"failed to initialize context"}');
    }
    return;
  }

  if (!contextEnabled) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"error":"context not enabled"}');
    return;
  }

  try {
    // POST /api/context/execute — sandbox execution (env-gated)
    if (urlPath === '/api/context/execute' && req.method === 'POST') {
      if (process.env.ERNE_ALLOW_EXECUTE !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(
          JSON.stringify({
            error: 'Execute endpoint disabled. Set ERNE_ALLOW_EXECUTE=true to enable.',
          }),
        );
        return;
      }
      const { command, original_tool, timeout = 30000 } = JSON.parse(body);
      const cwd = process.env.ERNE_PROJECT_DIR || process.cwd();
      execFile(
        'sh',
        ['-c', command],
        { cwd, timeout, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          const raw = stdout || '';
          const aggressive = budgetManager && budgetManager.shouldThrottle(original_tool || 'Bash');
          const tr = truncate(raw, original_tool || 'Bash', { aggressive });
          if (sessionTracker) {
            sessionTracker.track(
              'file_read',
              { tool: original_tool || 'Bash', tier: tr.tier },
              {
                context_bytes: tr.truncatedBytes,
                original_bytes: tr.originalBytes,
              },
            );
          }
          if (budgetManager) budgetManager.trackUsage(original_tool || 'Bash', tr.truncatedBytes);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              output: tr.output,
              stderr: (stderr || '').slice(0, 500),
              exit_code: err ? err.code || 1 : 0,
              original_bytes: tr.originalBytes,
              truncated_bytes: tr.truncatedBytes,
              tier: tr.tier,
              savings_pct: tr.savingsPct,
            }),
          );
        },
      );
      return;
    }

    // POST /api/context/search — FTS5 knowledge search
    if (urlPath === '/api/context/search' && req.method === 'POST') {
      const { query, category, min_score, limit } = JSON.parse(body);
      const results = knowledgeBase.search(query, { category, minScore: min_score, limit });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(results));
      return;
    }

    // POST /api/context/event — track session event
    if (urlPath === '/api/context/event' && req.method === 'POST') {
      const { event_type, data, agent, context_bytes } = JSON.parse(body);
      sessionTracker.track(event_type, data, { agent, context_bytes });
      broadcastContextEvent(event_type, data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    // GET /api/context/snapshot
    if (urlPath === '/api/context/snapshot' && req.method === 'GET') {
      const snap = loadLatestSnapshot(projectDb);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snap || {}));
      return;
    }

    // POST /api/context/snapshot — save snapshot (PreCompact)
    if (urlPath === '/api/context/snapshot' && req.method === 'POST') {
      const sessionIdFile = path.join(
        process.env.ERNE_PROJECT_DIR || process.cwd(),
        '.erne',
        'current-session-id',
      );
      const sessionId = fs.existsSync(sessionIdFile)
        ? fs.readFileSync(sessionIdFile, 'utf8').trim()
        : 'unknown';
      const snap = buildSnapshot(sessionDb, sessionId);
      saveSnapshot(projectDb, snap);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snap));
      return;
    }

    // GET /api/context/knowledge — browse knowledge base
    if (urlPath === '/api/context/knowledge' && req.method === 'GET') {
      const all = projectDb
        .prepare(
          'SELECT id, category, title, relevance_score, access_count, created_at FROM knowledge ORDER BY relevance_score DESC LIMIT 50',
        )
        .all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(all));
      return;
    }

    // GET /api/context/predict?agent=<name> — predict next agent
    if (urlPath.startsWith('/api/context/predict') && req.method === 'GET') {
      const agentParam =
        new URL(urlPath, 'http://localhost').searchParams.get('agent') || lastActiveAgent;
      const predicted = preloader && agentParam ? preloader.predictNext(agentParam) : null;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ from: agentParam, predicted }));
      return;
    }

    // POST /api/context/knowledge — add knowledge entry
    if (urlPath === '/api/context/knowledge' && req.method === 'POST') {
      const entry = JSON.parse(body);
      const id = knowledgeBase.add(entry);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id }));
      return;
    }

    // GET /api/context/stats — current session stats
    if (urlPath === '/api/context/stats' && req.method === 'GET') {
      const stats = sessionTracker.getStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
      return;
    }

    // GET /api/context/budget
    if (urlPath === '/api/context/budget' && req.method === 'GET') {
      const settings = budgetManager.getSettings();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(settings));
      return;
    }

    // PUT /api/context/budget
    if (urlPath === '/api/context/budget' && req.method === 'PUT') {
      const data = JSON.parse(body);
      budgetManager.updateSettings(data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    // POST /api/context/graduate — promote session knowledge to project DB
    if (urlPath === '/api/context/graduate' && req.method === 'POST') {
      if (sessionTracker && knowledgeBase && sessionDb) {
        const p1Events = sessionDb
          .prepare(
            "SELECT * FROM events WHERE priority <= 2 AND event_type IN ('error_fix', 'decision') ORDER BY timestamp",
          )
          .all();
        for (const evt of p1Events) {
          try {
            const data = JSON.parse(evt.data);
            knowledgeBase.add({
              category: evt.event_type === 'decision' ? 'decision' : 'error',
              title: data.choice || data.error_summary || evt.event_type,
              content: JSON.stringify(data),
              source: 'session-graduate',
              tags: 'auto-graduated',
            });
          } catch {
            /* skip malformed */
          }
        }
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
      return;
    }

    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end('{"error":"not found"}');
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

function broadcastContextEvent(eventType, data) {
  const PRIORITY_EVENTS = [
    'task_start',
    'task_complete',
    'file_create',
    'error',
    'error_fix',
    'file_modify',
    'decision',
    'git_commit',
    'test_run',
  ];
  if (!PRIORITY_EVENTS.includes(eventType)) return;

  const icons = {
    task_start: '🏗️',
    task_complete: '✅',
    file_create: '📝',
    error: '❌',
    error_fix: '✅',
    file_modify: '📝',
    decision: '💡',
    git_commit: '📦',
    test_run: '🧪',
  };

  const msg = JSON.stringify({
    type: 'session_event',
    data: {
      time: new Date().toLocaleTimeString('en-US', {
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
      }),
      icon: icons[eventType] || '📌',
      text: `${eventType}: ${data.task || data.path || data.command || data.agent || ''}`,
    },
  });
  wss?.clients?.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}

const server = http.createServer(async (req, res) => {
  // Route context API requests
  const urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/api/context/')) {
    let body = '';
    let bodyBytes = 0;
    let destroyed = false;
    req.on('data', (chunk) => {
      bodyBytes += chunk.length;
      if (bodyBytes > MAX_PAYLOAD_BYTES) {
        destroyed = true;
        req.destroy();
        return;
      }
      body += chunk;
    });
    req.on('end', () => {
      if (destroyed) return;
      handleContextApi(req, res, urlPath, body);
    });
    return;
  }

  if (req.method === 'GET' && req.url === '/api/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(agentState));
    return;
  }

  if (req.method === 'GET' && req.url === '/api/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(activityHistory));
    return;
  }

  // Audit API
  if (req.method === 'GET' && req.url === '/api/audit') {
    try {
      // Prefer in-memory audit from audit:complete events
      if (lastAudit) {
        // Normalize in-memory audit to always include { score, findings, project, date }
        const normalized = {
          score: lastAudit.score ?? null,
          findings: Array.isArray(lastAudit.findings) ? lastAudit.findings : [],
          project: lastAudit.project || null,
          date: lastAudit.date || lastAudit.receivedAt || null,
          // Pass through any extra fields from the event
          ...(lastAudit.version != null && { version: lastAudit.version }),
          ...(lastAudit.strengths && { strengths: lastAudit.strengths }),
          ...(lastAudit.stack && { stack: lastAudit.stack }),
          ...(lastAudit.meta && { meta: lastAudit.meta }),
        };
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(normalized));
        return;
      }
      const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
      const auditJsonPath = path.join(projectDir, '.erne', 'audit.json');
      if (fs.existsSync(auditJsonPath)) {
        const data = fs.readFileSync(auditJsonPath, 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(data);
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end('{"score":null,"message":"Run erne audit first"}');
      }
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET' && req.url === '/api/worker') {
    const state = lastWorkerState || {
      status: 'stopped',
      provider: 'none',
      history: [],
      log: [],
      ticketsToday: 0,
    };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ...state, tasks: Array.from(workerTasks.values()) }));
    return;
  }

  // GET /api/docs/status — check which erne-docs files exist
  if (req.method === 'GET' && req.url === '/api/docs/status') {
    const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
    const docsDir = path.join(projectDir, 'erne-docs');
    const docTypes = [
      'audit-report',
      'stack-detection',
      'dependency-report',
      'dead-code',
      'todos',
      'type-coverage',
      'test-coverage',
      'security-report',
      'performance-report',
      'architecture',
      'api-surface',
      'changelog',
    ];
    const results = {};
    for (const doc of docTypes) {
      const filePath = path.join(docsDir, `${doc}.md`);
      const jsonPath = path.join(docsDir, `${doc}.json`);
      let exists = false;
      let timestamp = null;
      try {
        const stat = fs.statSync(filePath);
        exists = true;
        timestamp = stat.mtime.toISOString();
      } catch {
        try {
          const stat = fs.statSync(jsonPath);
          exists = true;
          timestamp = stat.mtime.toISOString();
        } catch {
          /* not found */
        }
      }
      results[doc] = { exists, timestamp };
    }
    // Also check audit-data.json
    let auditDataExists = false;
    try {
      auditDataExists = fs.existsSync(path.join(docsDir, 'audit-data.json'));
    } catch {}
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ docs: results, auditDataExists }));
    return;
  }

  // PUT /api/settings/profile — persist hook profile selection
  if (req.method === 'PUT' && req.url === '/api/settings/profile') {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        const { profile } = JSON.parse(body);
        if (!['minimal', 'standard', 'strict'].includes(profile)) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid profile' }));
          return;
        }
        const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
        const settingsPath = path.join(projectDir, '.claude', 'settings.local.json');
        let settings = {};
        try {
          settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'));
        } catch {
          /* new file */
        }
        settings.erneProfile = profile;
        fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, profile }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && req.url === '/api/audit/run') {
    try {
      const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
      const erneRoot = path.resolve(__dirname, '..');

      // Step 1: Run quick audit for score + findings
      const { runAudit } = require(path.join(erneRoot, 'lib', 'audit'));
      const result = runAudit(projectDir);

      // Step 2: Run deep scan to produce audit-data.json (drives doc generation)
      const docsDir = path.join(projectDir, 'erne-docs');
      fs.mkdirSync(docsDir, { recursive: true });
      try {
        const { runScan } = require(path.join(erneRoot, 'lib', 'audit-scanner'));
        const auditData = runScan(projectDir, { skipDepHealth: false, maxFiles: 500 });
        fs.writeFileSync(path.join(docsDir, 'audit-data.json'), JSON.stringify(auditData, null, 2));
      } catch { /* scanner may fail on some projects */ }

      // Step 3: Generate all 12 markdown docs from audit-data.json
      try {
        const dataPath = path.join(docsDir, 'audit-data.json');
        const data = fs.existsSync(dataPath) ? JSON.parse(fs.readFileSync(dataPath, 'utf-8')) : {};
        const now = new Date().toISOString();
        const write = (name, lines) => fs.writeFileSync(path.join(docsDir, name), lines.join('\n'));

        // audit-report (always generate)
        const ar = [`# Audit Report\nGenerated: ${now}\n`];
        ar.push(`Score: ${result.jsonReport?.score ?? data.meta?.score ?? 'N/A'}`);
        ar.push(`Components: ${data.components?.length ?? 0}`);
        ar.push(`Hooks: ${data.hooks?.length ?? 0}`);
        if (result.jsonReport?.strengths?.length) {
          ar.push(`\n## Strengths (${result.jsonReport.strengths.length})\n`);
          for (const s of result.jsonReport.strengths) ar.push(`- ${s.title}`);
        }
        if (result.jsonReport?.findings?.length) {
          ar.push(`\n## Findings (${result.jsonReport.findings.length})\n`);
          for (const f of result.jsonReport.findings) ar.push(`- [${f.severity}] ${f.title}: ${f.detail || ''}`);
        }
        write('audit-report.md', ar);

        // stack-detection (always generate)
        const sd = [`# Stack Detection\nGenerated: ${now}\n`];
        const stack = data.config || result.jsonReport?.stack || {};
        for (const [k, v] of Object.entries(stack))
          sd.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        if (result.jsonReport?.meta) {
          sd.push('');
          for (const [k, v] of Object.entries(result.jsonReport.meta))
            sd.push(`- **${k}**: ${v}`);
        }
        write('stack-detection.md', sd);

        // dependency-report (always generate)
        const dr = [`# Dependency Report\nGenerated: ${now}\n`];
        const deps = data.dependencies || {};
        dr.push(`Total: ${deps.production?.length ?? 0} production, ${deps.dev?.length ?? 0} dev\n`);
        if (deps.production?.length) {
          dr.push('## Production Dependencies\n');
          for (const d of deps.production.slice(0, 50)) dr.push(`- ${d.name || d}: ${d.version || ''}`);
        }
        if (deps.outdated?.length) {
          dr.push(`\n## Outdated (${deps.outdated.length})\n`);
          for (const o of deps.outdated.slice(0, 30)) dr.push(`- ${o.name}: ${o.current} → ${o.latest}`);
        }
        write('dependency-report.md', dr);

        // dead-code (always generate)
        const dc = [`# Dead Code Report\nGenerated: ${now}\n`];
        if (data.deadCode?.length) {
          dc.push(`Found: ${data.deadCode.length} unused exports\n`);
          for (const d of data.deadCode.slice(0, 50)) dc.push(`- \`${d.name}\` in ${d.file} (${d.type})`);
        } else {
          dc.push('No dead code detected.');
        }
        write('dead-code.md', dc);

        // todos (always generate)
        const td = [`# TODOs & Tech Debt\nGenerated: ${now}\n`];
        if (data.techDebt?.length) {
          for (const t of data.techDebt.slice(0, 50))
            td.push(`- **${t.type || 'TODO'}** ${t.file}:${t.line || '?'} — ${t.text || ''}`);
        } else {
          td.push('No TODOs or tech debt markers found.');
        }
        write('todos.md', td);

        // type-coverage (always generate)
        const tc = [`# Type Coverage\nGenerated: ${now}\n`];
        if (data.typeSafety && Object.keys(data.typeSafety).length) {
          for (const [k, v] of Object.entries(data.typeSafety))
            tc.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        } else {
          tc.push('No TypeScript coverage data available.');
        }
        write('type-coverage.md', tc);

        // test-coverage (always generate)
        const testc = [`# Test Coverage\nGenerated: ${now}\n`];
        if (data.testCoverage) {
          for (const [k, v] of Object.entries(data.testCoverage))
            testc.push(`- **${k}**: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        } else {
          testc.push('No test coverage data. Configure a testing framework to enable coverage reports.');
        }
        write('test-coverage.md', testc);

        // security-report (always generate)
        const sr = [`# Security Report\nGenerated: ${now}\n`];
        const secFindings = (result.jsonReport?.findings || []).filter(f => f.category === 'Security');
        if (secFindings.length) {
          for (const f of secFindings) sr.push(`- [${f.severity}] ${f.title}: ${f.detail || ''}`);
        } else {
          sr.push('No security issues detected.');
        }
        write('security-report.md', sr);

        // performance-report (always generate)
        const pr = [`# Performance Report\nGenerated: ${now}\n`];
        const perfFindings = (result.jsonReport?.findings || []).filter(f => f.category === 'Performance');
        if (perfFindings.length) {
          for (const f of perfFindings) pr.push(`- [${f.severity}] ${f.title}: ${f.detail || ''}`);
        } else {
          pr.push('No performance issues detected.');
        }
        write('performance-report.md', pr);

        // architecture (always generate)
        const arch = [`# Architecture\nGenerated: ${now}\n`];
        if (data.structure?.dirs) {
          arch.push(`## Directories (${data.structure.dirs.length})\n`);
          for (const d of data.structure.dirs.slice(0, 30)) arch.push(`- ${d}`);
        }
        if (data.routes?.length) {
          arch.push(`\n## Routes (${data.routes.length})\n`);
          for (const r of data.routes.slice(0, 30)) arch.push(`- ${r.path || r.file || r}`);
        }
        if (data.screens?.length) {
          arch.push(`\n## Screens (${data.screens.length})\n`);
          for (const s of data.screens.slice(0, 30)) arch.push(`- ${s.name || s.file || s}`);
        }
        if (!data.structure && !data.routes && !data.screens) {
          arch.push('Run a deeper audit scan for architecture analysis.');
        }
        write('architecture.md', arch);

        // api-surface (always generate)
        const api = [`# API Surface\nGenerated: ${now}\n`];
        if (data.apiLayer?.length) {
          for (const a of data.apiLayer.slice(0, 50))
            api.push(`- \`${a.method || 'GET'} ${a.path || a.url || a.name}\` in ${a.file || 'unknown'}`);
        } else {
          api.push('No API endpoints detected.');
        }
        write('api-surface.md', api);

        // changelog (always generate)
        const cl = [`# Changelog\nGenerated: ${now}\n`];
        if (data.gitHistory?.length) {
          for (const c of data.gitHistory.slice(0, 50))
            cl.push(`- ${(c.hash || '').slice(0, 7)} ${c.message || ''} (${c.date || ''})`);
        } else {
          cl.push('No git history data available.');
        }
        write('changelog.md', cl);

      } catch { /* doc generation is best-effort */ }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.jsonReport));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'POST' && req.url === '/api/events') {
    const clientIp = req.socket.remoteAddress || 'unknown';
    if (isRateLimited(clientIp)) {
      res.writeHead(429, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Too many requests' }));
      return;
    }
    try {
      const body = await parseBody(req);
      const result = handleEvent(body);
      if (result.error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } else {
        broadcastState();
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      }
    } catch (e) {
      if (e instanceof RangeError && e.message === 'Payload too large') {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Payload too large' }));
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Invalid JSON' }));
      }
    }
    return;
  }

  // Photo upload — handle before parseBody (multipart, 5MB limit)
  if (req.method === 'POST' && urlPath === '/api/tasks/upload') {
    handleUpload(req, res);
    return;
  }

  // New dashboard API routes — tasks, agents, issues fix, MCP
  if (
    urlPath.startsWith('/api/tasks') ||
    urlPath.startsWith('/api/agents') ||
    urlPath.startsWith('/api/issues/') ||
    urlPath.startsWith('/api/mcp')
  ) {
    // GET requests don't need body parsing
    if (req.method === 'GET') {
      if (handleFixCapabilities(req, res, urlPath)) return;
      if (handleTasks(req, res, urlPath, '', workerTasks)) return;
      if (handleAgents(req, res, urlPath, '', AGENT_DEFINITIONS, agentState, activityHistory))
        return;
      if (handleMcp(req, res, urlPath, '')) return;
    } else {
      // POST/PUT/DELETE — parse body first
      try {
        const body = await parseBody(req);
        const bodyStr = JSON.stringify(body);
        if (handleTasks(req, res, urlPath, bodyStr, workerTasks)) return;
        if (
          handleAgents(req, res, urlPath, bodyStr, AGENT_DEFINITIONS, agentState, activityHistory)
        )
          return;
        if (handleFixCapabilities(req, res, urlPath)) return;
        if (handleIssueFix(req, res, urlPath, bodyStr, broadcast)) return;
        if (handleMcp(req, res, urlPath, bodyStr)) return;
      } catch (e) {
        if (e instanceof RangeError) {
          res.writeHead(413, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Payload too large' }));
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid request' }));
        }
        return;
      }
    }
    // If no handler matched, fall through to 404 or static
  }

  // Tab API routes — collect body for POST requests
  if (
    urlPath.startsWith('/api/myapp/') ||
    urlPath.startsWith('/api/ecosystem/') ||
    urlPath.startsWith('/api/upgrades/') ||
    urlPath.startsWith('/api/insights/')
  ) {
    var tabBody = '';
    var tabBytes = 0;
    req.on('data', function (chunk) {
      tabBytes += chunk.length;
      if (tabBytes > MAX_PAYLOAD_BYTES) {
        req.destroy();
        return;
      }
      tabBody += chunk;
    });
    req.on('end', function () {
      if (urlPath.startsWith('/api/myapp/') && myappHandler)
        return myappHandler(req, res, urlPath, tabBody);
      if (urlPath.startsWith('/api/ecosystem/') && ecosystemHandler)
        return ecosystemHandler(req, res, urlPath, tabBody);
      if (urlPath.startsWith('/api/upgrades/') && upgradesHandler)
        return upgradesHandler(req, res, urlPath, tabBody);
      if (urlPath.startsWith('/api/insights/') && insightsHandler)
        return insightsHandler(req, res, urlPath, tabBody);
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end('{"error":"handler not available"}');
    });
    return;
  }

  serveStatic(req, res);
});

wss = new WebSocketServer({ server, maxPayload: 65536 });

function broadcast(msg) {
  if (!wss) return;
  // Update agentState when agent_update messages are broadcast
  if (msg.type === 'agent_update' && msg.agent && agentState[msg.agent]) {
    agentState[msg.agent].status = msg.status || 'idle';
    agentState[msg.agent].task = msg.task || null;
    agentState[msg.agent].lastEvent = new Date().toISOString();
  }
  var payload = JSON.stringify(msg);
  wss.clients.forEach(function (client) {
    if (client.readyState === 1) client.send(payload);
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.send(
    JSON.stringify({
      type: 'init',
      agents: agentState,
      history: activityHistory,
    }),
  );

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (err) {
      console.warn('Invalid WebSocket message:', err.message);
      return;
    }

    // Validate event shape before processing
    if (!data || typeof data !== 'object' || typeof data.type !== 'string') return;
    const VALID_TYPES = [
      'agent:start',
      'agent:complete',
      'planning:start',
      'planning:end',
      'audit:complete',
      'worker:start',
      'worker:poll',
      'worker:task-start',
      'worker:task-complete',
      'worker:idle',
      'visual-debug:screenshot',
      'visual-debug:fix',
      'visual-debug:compare',
    ];
    if (!VALID_TYPES.includes(data.type)) return;

    const result = handleEvent(data);
    if (!result.error) {
      broadcastState();
    }
  });
});

// Heartbeat: ping every 30s, terminate dead connections
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30000);

// Project dir — used by context init and tab handlers
const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

// Always init context with dashboard (flag/env still supported for backwards compat)
initContext(projectDir);

// Broadcast context stats every 5 seconds
setInterval(() => {
  if (!contextEnabled || !sessionTracker) return;
  const stats = sessionTracker.getStats();
  const msg = JSON.stringify({ type: 'context_stats', data: stats });
  wss?.clients?.forEach((c) => {
    if (c.readyState === 1) c.send(msg);
  });
}, 5000);

// Resolve port dynamically: CLI flag (via env) > ERNE_DASHBOARD_PORT > registry > find free
async function resolvePort() {
  // If ERNE_DASHBOARD_PORT is set (from --port flag or env), use it directly
  if (process.env.ERNE_DASHBOARD_PORT) {
    return parseInt(process.env.ERNE_DASHBOARD_PORT, 10);
  }

  // Check registry for this project
  const registered = getRegisteredPort(projectDir);
  if (registered) return registered;

  // Find a free port
  try {
    return await findFreePort();
  } catch {
    return parseInt(process.env.ERNE_DASHBOARD_PORT, 10) || 3333; // ultimate fallback
  }
}

resolvePort().then((resolvedPort) => {
  PORT = resolvedPort;

  // Cleanup on exit
  const cleanupRegistry = () => {
    unregisterPort(projectDir);
  };
  process.on('exit', cleanupRegistry);
  process.on('SIGINT', () => {
    cleanupRegistry();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    cleanupRegistry();
    process.exit(0);
  });

  // Retry with next free port on EADDRINUSE
  let retries = 0;
  const MAX_RETRIES = 10;

  function startServer(port) {
    PORT = port;
    server.listen(PORT, () => {
    console.log(`ERNE Dashboard running on http://localhost:${PORT}`);

    // Wire tab handlers
    if (ecosystemHandler) {
      ecosystemHandler.broadcast = broadcast;
    }
    if (upgradesHandler) {
      upgradesHandler.broadcast = broadcast;
      upgradesHandler.getAgentStatus = function (name) {
        return agentState[name] ? agentState[name].status : 'idle';
      };
      upgradesHandler.postEvent = handleEvent;
    }

    // Auto-refresh ecosystem data every 12 hours
    if (ecosystemHandler && ecosystemHandler.autoRefresh) {
      setInterval(
        function () {
          ecosystemHandler.autoRefresh(projectDir, broadcast);
        },
        12 * 3600 * 1000,
      );
    }
    // Insights snapshot check every hour
    if (insightsHandler && insightsHandler.autoSnapshot) {
      setInterval(function () {
        insightsHandler.autoSnapshot(projectDir);
      }, 3600 * 1000);
    }

    // Initial data fetch (non-blocking, 5s delay for server to stabilize)
    setTimeout(function () {
      if (ecosystemHandler && ecosystemHandler.autoRefresh)
        ecosystemHandler.autoRefresh(projectDir, broadcast);
      if (insightsHandler && insightsHandler.autoSnapshot) insightsHandler.autoSnapshot(projectDir);
    }, 5000);

    // Register port after successful listen
    registerPort(projectDir, PORT, process.pid);
  });
  }

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE' && retries < MAX_RETRIES) {
      retries++;
      // Find next free port
      findFreePort().then((nextPort) => {
        startServer(nextPort);
      }).catch(() => {
        console.error(`Error: No free ports available in range ${PORT_RANGE_START}-${PORT_RANGE_END}.`);
        process.exit(1);
      });
    } else if (err.code === 'EADDRINUSE') {
      console.error(`Error: All ports in range ${PORT_RANGE_START}-${PORT_RANGE_END} are in use.`);
      process.exit(1);
    } else {
      console.error(`Server error: ${err.message}`);
      process.exit(1);
    }
  });

  startServer(PORT);
});
