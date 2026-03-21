const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const { execFile } = require('node:child_process');
const crypto = require('node:crypto');
const { openProjectDb, openSessionDb, closeDb } = require('./lib/context/db');
const { truncate } = require('./lib/context/truncation');
const { KnowledgeBase } = require('./lib/context/knowledge-base');
const { SessionTracker } = require('./lib/context/session-tracker');
const { buildSnapshot, saveSnapshot, loadLatestSnapshot, restorePrompt } = require('./lib/context/session-continuity');
const { BudgetManager } = require('./lib/context/budget-manager');
const { AgentPreloader } = require('./lib/context/preloader');
const { AGENT_DEFINITIONS: SHARED_AGENT_DEFS } = require('./lib/agents-config');

// Tab feature modules (loaded lazily to avoid errors if dirs don't exist yet)
let ecosystemHandler, upgradesHandler, insightsHandler, myappHandler;
try { ecosystemHandler = require('./lib/ecosystem/handler'); } catch (e) { ecosystemHandler = null; }
try { upgradesHandler = require('./lib/upgrades/handler'); } catch (e) { upgradesHandler = null; }
try { insightsHandler = require('./lib/insights/handler'); } catch (e) { insightsHandler = null; }
try { myappHandler = require('./lib/myapp/handler'); } catch (e) { myappHandler = null; }

const PORT = parseInt(process.env.ERNE_DASHBOARD_PORT, 10) || 3333;
const PUBLIC_DIR = path.join(__dirname, 'public');
const AGENT_TIMEOUT_MS = 5 * 60 * 1000;
const TIMEOUT_CHECK_INTERVAL_MS = 30 * 1000;
const DONE_TO_IDLE_DELAY_MS = 3000;
const MAX_HISTORY_PER_AGENT = 50;
const ERNE_DIR = path.join(os.homedir(), '.erne');
const HISTORY_FILE = path.join(ERNE_DIR, 'activity-history.json');

// Ensure ~/.erne/ directory exists
try { fs.mkdirSync(ERNE_DIR, { recursive: true }); } catch { /* ignore */ }

const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.png': 'image/png',
  '.json': 'application/json',
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

    console.log(`[ERNE] Context optimization enabled (session: ${sessionId.slice(0, 8)})`);
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
      addHistoryEntry(name, { type: 'planning', task: task || 'Team planning session', timestamp: now });
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

  // Worker events — update worker state and broadcast
  if (type && type.startsWith('worker:')) {
    const now = new Date().toISOString();
    if (type === 'worker:start') {
      lastWorkerState = { status: 'polling', provider: event.provider, repo: event.repo, interval: event.interval, startedAt: now, lastEvent: now, currentTicket: null };
    } else if (type === 'worker:task-start') {
      if (lastWorkerState) {
        lastWorkerState.status = 'working';
        lastWorkerState.currentTicket = { identifier: event.identifier, title: event.title, startedAt: now };
        lastWorkerState.lastEvent = now;
      }
    } else if (type === 'worker:task-complete') {
      if (lastWorkerState) {
        lastWorkerState.status = 'polling';
        lastWorkerState.currentTicket = null;
        lastWorkerState.lastEvent = now;
        lastWorkerState.lastCompleted = { identifier: event.identifier, title: event.title, result: event.result, completedAt: now };
      }
    } else if (type === 'worker:idle') {
      if (lastWorkerState) {
        lastWorkerState.status = 'polling';
        lastWorkerState.lastEvent = now;
      }
    } else if (lastWorkerState) {
      lastWorkerState.lastEvent = now;
    }
    return { ok: true };
  }

  if (!agent || !agentState[agent]) {
    return { error: `Unknown agent: ${agent}` };
  }

  const now = new Date().toISOString();
  const state = agentState[agent];
  state.lastEvent = now;

  if (type === 'agent:start') {
    // Record agent transition for preloader predictions
    if (preloader && lastActiveAgent && lastActiveAgent !== agent) {
      try { preloader.recordTransition(lastActiveAgent, agent); } catch {}
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
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
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
        res.end(JSON.stringify({ error: 'Execute endpoint disabled. Set ERNE_ALLOW_EXECUTE=true to enable.' }));
        return;
      }
      const { command, original_tool, timeout = 30000 } = JSON.parse(body);
      const cwd = process.env.ERNE_PROJECT_DIR || process.cwd();
      execFile('sh', ['-c', command], { cwd, timeout, maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
        const raw = stdout || '';
        const aggressive = budgetManager && budgetManager.shouldThrottle(original_tool || 'Bash');
        const tr = truncate(raw, original_tool || 'Bash', { aggressive });
        if (sessionTracker) {
          sessionTracker.track('file_read', { tool: original_tool || 'Bash', tier: tr.tier }, {
            context_bytes: tr.truncatedBytes,
            original_bytes: tr.originalBytes
          });
        }
        if (budgetManager) budgetManager.trackUsage(original_tool || 'Bash', tr.truncatedBytes);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          output: tr.output, stderr: (stderr || '').slice(0, 500),
          exit_code: err ? err.code || 1 : 0,
          original_bytes: tr.originalBytes,
          truncated_bytes: tr.truncatedBytes,
          tier: tr.tier,
          savings_pct: tr.savingsPct
        }));
      });
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
      const sessionIdFile = path.join(process.env.ERNE_PROJECT_DIR || process.cwd(), '.erne', 'current-session-id');
      const sessionId = fs.existsSync(sessionIdFile) ? fs.readFileSync(sessionIdFile, 'utf8').trim() : 'unknown';
      const snap = buildSnapshot(sessionDb, sessionId);
      saveSnapshot(projectDb, snap);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(snap));
      return;
    }

    // GET /api/context/knowledge — browse knowledge base
    if (urlPath === '/api/context/knowledge' && req.method === 'GET') {
      const all = projectDb.prepare('SELECT id, category, title, relevance_score, access_count, created_at FROM knowledge ORDER BY relevance_score DESC LIMIT 50').all();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(all));
      return;
    }

    // GET /api/context/predict?agent=<name> — predict next agent
    if (urlPath.startsWith('/api/context/predict') && req.method === 'GET') {
      const agentParam = new URL(urlPath, 'http://localhost').searchParams.get('agent') || lastActiveAgent;
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
        const p1Events = sessionDb.prepare('SELECT * FROM events WHERE priority <= 2 AND event_type IN (\'error_fix\', \'decision\') ORDER BY timestamp').all();
        for (const evt of p1Events) {
          try {
            const data = JSON.parse(evt.data);
            knowledgeBase.add({
              category: evt.event_type === 'decision' ? 'decision' : 'error',
              title: data.choice || data.error_summary || evt.event_type,
              content: JSON.stringify(data),
              source: 'session-graduate',
              tags: 'auto-graduated'
            });
          } catch { /* skip malformed */ }
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
  const PRIORITY_EVENTS = ['task_start', 'task_complete', 'file_create', 'error', 'error_fix',
    'file_modify', 'decision', 'git_commit', 'test_run'];
  if (!PRIORITY_EVENTS.includes(eventType)) return;

  const icons = { task_start: '🏗️', task_complete: '✅', file_create: '📝', error: '❌',
    error_fix: '✅', file_modify: '📝', decision: '💡', git_commit: '📦', test_run: '🧪' };

  const msg = JSON.stringify({
    type: 'session_event',
    data: { time: new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit' }),
      icon: icons[eventType] || '📌',
      text: `${eventType}: ${data.task || data.path || data.command || data.agent || ''}`
    }
  });
  wss?.clients?.forEach(c => { if (c.readyState === 1) c.send(msg); });
}

const server = http.createServer(async (req, res) => {
  // Route context API requests
  const urlPath = req.url.split('?')[0];
  if (urlPath.startsWith('/api/context/')) {
    let body = '';
    let bodyBytes = 0;
    let destroyed = false;
    req.on('data', chunk => {
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
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(lastAudit));
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
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(lastWorkerState || { status: 'offline' }));
    return;
  }

  if (req.method === 'POST' && req.url === '/api/audit/run') {
    try {
      const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
      const erneRoot = path.resolve(__dirname, '..');
      const { runAudit } = require(path.join(erneRoot, 'lib', 'audit'));
      const result = runAudit(projectDir);
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

  // Tab API routes — collect body for POST requests
  if (urlPath.startsWith('/api/myapp/') || urlPath.startsWith('/api/ecosystem/') || urlPath.startsWith('/api/upgrades/') || urlPath.startsWith('/api/insights/')) {
    var tabBody = '';
    var tabBytes = 0;
    req.on('data', function (chunk) {
      tabBytes += chunk.length;
      if (tabBytes > MAX_PAYLOAD_BYTES) { req.destroy(); return; }
      tabBody += chunk;
    });
    req.on('end', function () {
      if (urlPath.startsWith('/api/myapp/') && myappHandler) return myappHandler(req, res, urlPath, tabBody);
      if (urlPath.startsWith('/api/ecosystem/') && ecosystemHandler) return ecosystemHandler(req, res, urlPath, tabBody);
      if (urlPath.startsWith('/api/upgrades/') && upgradesHandler) return upgradesHandler(req, res, urlPath, tabBody);
      if (urlPath.startsWith('/api/insights/') && insightsHandler) return insightsHandler(req, res, urlPath, tabBody);
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
  var payload = JSON.stringify(msg);
  wss.clients.forEach(function (client) {
    if (client.readyState === 1) client.send(payload);
  });
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  ws.send(JSON.stringify({
    type: 'init',
    agents: agentState,
    history: activityHistory,
  }));

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
    const VALID_TYPES = ['agent:start', 'agent:complete', 'planning:start', 'planning:end', 'audit:complete',
      'worker:start', 'worker:poll', 'worker:task-start', 'worker:task-complete', 'worker:idle',
      'visual-debug:screenshot', 'visual-debug:fix', 'visual-debug:compare'];
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
    if (!ws.isAlive) { ws.terminate(); continue; }
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
  wss?.clients?.forEach(c => { if (c.readyState === 1) c.send(msg); });
}, 5000);

server.listen(PORT, () => {
  console.log(`ERNE Dashboard running on http://localhost:${PORT}`);

  // Wire tab handlers
  if (ecosystemHandler) { ecosystemHandler.broadcast = broadcast; }
  if (upgradesHandler) {
    upgradesHandler.broadcast = broadcast;
    upgradesHandler.getAgentStatus = function (name) {
      return agentState[name] ? agentState[name].status : 'idle';
    };
    upgradesHandler.postEvent = handleEvent;
  }

  // Auto-refresh ecosystem data every 12 hours
  if (ecosystemHandler && ecosystemHandler.autoRefresh) {
    setInterval(function () { ecosystemHandler.autoRefresh(projectDir, broadcast); }, 12 * 3600 * 1000);
  }
  // Insights snapshot check every hour
  if (insightsHandler && insightsHandler.autoSnapshot) {
    setInterval(function () { insightsHandler.autoSnapshot(projectDir); }, 3600 * 1000);
  }

  // Initial data fetch (non-blocking, 5s delay for server to stabilize)
  setTimeout(function () {
    if (ecosystemHandler && ecosystemHandler.autoRefresh) ecosystemHandler.autoRefresh(projectDir, broadcast);
    if (insightsHandler && insightsHandler.autoSnapshot) insightsHandler.autoSnapshot(projectDir);
  }, 5000);
});
