'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const ERNE_DIR = path.join(os.homedir(), '.erne');
const AGENT_CONFIG_FILE = path.join(ERNE_DIR, 'agent-config.json');
const CUSTOM_AGENTS_FILE = path.join(ERNE_DIR, 'custom-agents.json');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readAgentConfig() {
  try {
    if (fs.existsSync(AGENT_CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(AGENT_CONFIG_FILE, 'utf8'));
    }
  } catch {}
  return { agents: {} };
}

function writeAgentConfig(data) {
  ensureDir(ERNE_DIR);
  const tmp = AGENT_CONFIG_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, AGENT_CONFIG_FILE);
}

function readCustomAgents() {
  try {
    if (fs.existsSync(CUSTOM_AGENTS_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOM_AGENTS_FILE, 'utf8'));
    }
  } catch {}
  return { agents: [] };
}

function writeCustomAgents(data) {
  ensureDir(ERNE_DIR);
  const tmp = CUSTOM_AGENTS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, CUSTOM_AGENTS_FILE);
}

function handleAgents(req, res, urlPath, body, staticDefs, agentState, activityHistory) {
  // GET /api/agents/config — merged static + custom config
  if (req.method === 'GET' && urlPath === '/api/agents/config') {
    const config = readAgentConfig();
    const custom = readCustomAgents();

    const merged = staticDefs.map((def) => ({
      name: def.name,
      room: def.room,
      displayName: config.agents[def.name]?.displayName || null,
      enabled: config.agents[def.name]?.enabled !== false,
      custom: false,
    }));

    for (const ca of custom.agents) {
      merged.push({
        name: ca.name,
        room: ca.room || 'development',
        displayName: ca.displayName || ca.name,
        enabled: config.agents[ca.name]?.enabled !== false,
        custom: true,
        emoji: ca.emoji,
        vibe: ca.vibe,
        description: ca.description,
      });
    }

    // Discover agents from .claude/agents/ that aren't in static or custom lists
    const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
    const agentsDir = path.join(projectDir, '.claude', 'agents');
    try {
      if (fs.existsSync(agentsDir)) {
        const knownNames = new Set(merged.map((a) => a.name));
        const files = fs.readdirSync(agentsDir).filter((f) => f.endsWith('.md'));
        for (const file of files) {
          const name = path.basename(file, '.md');
          if (!knownNames.has(name)) {
            merged.push({
              name,
              room: 'development',
              displayName: config.agents[name]?.displayName || null,
              enabled: config.agents[name]?.enabled !== false,
              custom: false,
            });
          }
        }
      }
    } catch {
      // Silent — discovery is best-effort
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ agents: merged }));
    return true;
  }

  // PUT /api/agents/:id/config — update agent config (name, enabled)
  if (req.method === 'PUT' && urlPath.startsWith('/api/agents/') && urlPath.endsWith('/config')) {
    const parts = urlPath.split('/');
    const agentId = parts[parts.length - 2];
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const config = readAgentConfig();
      if (!config.agents[agentId]) config.agents[agentId] = {};
      if (parsed.displayName !== undefined) config.agents[agentId].displayName = parsed.displayName;
      if (parsed.enabled !== undefined) config.agents[agentId].enabled = parsed.enabled;
      writeAgentConfig(config);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, agent: agentId, config: config.agents[agentId] }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  // POST /api/agents — create new agent
  if (req.method === 'POST' && urlPath === '/api/agents') {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const { name, emoji, vibe, description, systemPrompt } = parsed;

      if (!name || !description) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'name and description are required' }));
        return true;
      }

      // Sanitize name for filename
      const safeName = name
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');

      if (!safeName) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Name must contain at least one alphanumeric character' }));
        return true;
      }

      // Write .md file to .claude/agents/
      const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
      const agentsDir = path.join(projectDir, '.claude', 'agents');
      ensureDir(agentsDir);

      const mdContent = [
        '---',
        `name: ${safeName}`,
        `emoji: "${emoji || '🤖'}"`,
        `vibe: "${(vibe || 'Helpful and thorough').replace(/"/g, '\\"')}"`,
        `description: "${description.replace(/"/g, '\\"').replace(/\n/g, ' ')}"`,
        '---',
        '',
        systemPrompt || `You are ${name}, a specialized AI agent. ${description}`,
        '',
      ].join('\n');

      fs.writeFileSync(path.join(agentsDir, `${safeName}.md`), mdContent);

      // Add to custom-agents.json
      const custom = readCustomAgents();
      const newAgent = {
        id: `custom-${safeName}`,
        name: safeName,
        emoji: emoji || '🤖',
        vibe: vibe || 'Helpful and thorough',
        description,
        room: 'development',
        createdAt: new Date().toISOString(),
      };
      custom.agents.push(newAgent);
      writeCustomAgents(custom);

      // Register in agentState and activityHistory so events work
      if (agentState && !agentState[safeName]) {
        agentState[safeName] = {
          status: 'idle',
          task: null,
          room: 'development',
          startedAt: null,
          lastEvent: null,
        };
      }
      if (activityHistory && !activityHistory[safeName]) {
        activityHistory[safeName] = [];
      }

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(newAgent));
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}

// Load custom agents into agentState/activityHistory at startup
function registerCustomAgents(agentState, activityHistory) {
  const custom = readCustomAgents();
  for (const agent of custom.agents) {
    if (!agentState[agent.name]) {
      agentState[agent.name] = {
        status: 'idle',
        task: null,
        room: agent.room || 'development',
        startedAt: null,
        lastEvent: null,
      };
    }
    if (!activityHistory[agent.name]) {
      activityHistory[agent.name] = [];
    }
  }
}

module.exports = { handleAgents, registerCustomAgents };
