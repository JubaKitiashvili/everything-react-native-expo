'use strict';
const fs = require('fs');
const path = require('path');

// Known MCP server catalog with pre-filled configs
const MCP_CATALOG = [
  {
    id: 'context7',
    name: 'Context7',
    description: 'Up-to-date documentation and code examples for any library',
    transport: 'stdio',
    config: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
  },
  {
    id: 'playwright',
    name: 'Playwright',
    description: 'Browser automation for testing and scraping',
    transport: 'stdio',
    config: { command: 'npx', args: ['-y', '@anthropic/mcp-playwright'] },
  },
  {
    id: 'filesystem',
    name: 'Filesystem',
    description: 'Read/write files with MCP protocol',
    transport: 'stdio',
    config: { command: 'npx', args: ['-y', '@anthropic/mcp-filesystem', '.'] },
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'GitHub API integration — repos, PRs, issues',
    transport: 'stdio',
    config: { command: 'npx', args: ['-y', '@anthropic/mcp-github'] },
  },
  {
    id: 'memory',
    name: 'Memory',
    description: 'Persistent memory for conversations',
    transport: 'stdio',
    config: { command: 'npx', args: ['-y', '@anthropic/mcp-memory'] },
  },
];

function sanitizeMcpConfig(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const { command, args, url, env } = raw;
  if (!command && !url) return null;
  const safe = {};
  if (command) safe.command = String(command);
  if (args && Array.isArray(args)) safe.args = args.map(String);
  if (url) safe.url = String(url);
  if (env && typeof env === 'object' && !Array.isArray(env)) {
    safe.env = {};
    for (const [k, v] of Object.entries(env)) {
      safe.env[String(k)] = String(v);
    }
  }
  return safe;
}

function getMcpJsonPath(projectDir) {
  return path.join(projectDir, '.mcp.json');
}

function getSettingsJsonPaths(projectDir) {
  return [
    path.join(projectDir, '.claude', 'settings.json'),
    path.join(projectDir, '.claude', 'settings.local.json'),
  ];
}

function readMcpJson(projectDir) {
  const mcpPath = getMcpJsonPath(projectDir);
  try {
    if (fs.existsSync(mcpPath)) {
      return JSON.parse(fs.readFileSync(mcpPath, 'utf8'));
    }
  } catch {}
  return { mcpServers: {} };
}

function writeMcpJson(projectDir, data) {
  const mcpPath = getMcpJsonPath(projectDir);
  const tmp = mcpPath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, mcpPath);
}

function readSettingsServers(projectDir) {
  const servers = {};
  for (const settingsPath of getSettingsJsonPaths(projectDir)) {
    try {
      if (fs.existsSync(settingsPath)) {
        const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
        if (data.mcpServers) {
          Object.assign(servers, data.mcpServers);
        }
      }
    } catch {}
  }
  return servers;
}

function handleMcp(req, res, urlPath, body) {
  const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

  // GET /api/mcp — list all MCP servers (project + user)
  if (req.method === 'GET' && urlPath === '/api/mcp') {
    const projectServers = readMcpJson(projectDir).mcpServers || {};
    const userServers = readSettingsServers(projectDir);

    const servers = [];
    for (const [name, config] of Object.entries(projectServers)) {
      servers.push({
        name,
        transport: config.command ? 'stdio' : config.url ? 'sse' : 'unknown',
        source: 'project',
        status: 'unknown',
        config,
      });
    }
    for (const [name, config] of Object.entries(userServers)) {
      if (!projectServers[name]) {
        servers.push({
          name,
          transport: config.command ? 'stdio' : config.url ? 'sse' : 'unknown',
          source: 'user',
          status: 'unknown',
          config,
        });
      }
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ servers }));
    return true;
  }

  // GET /api/mcp/catalog — recommended MCP servers
  if (req.method === 'GET' && urlPath === '/api/mcp/catalog') {
    const installed = readMcpJson(projectDir).mcpServers || {};
    const catalog = MCP_CATALOG.map((item) => ({
      ...item,
      installed: !!installed[item.id],
    }));
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ catalog }));
    return true;
  }

  // POST /api/mcp — add MCP server to .mcp.json
  if (req.method === 'POST' && urlPath === '/api/mcp') {
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const { name, config } = parsed;
      if (!name || !config) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'name and config required' }));
        return true;
      }
      const safeConfig = sanitizeMcpConfig(config);
      if (!safeConfig) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'config must include command or url' }));
        return true;
      }
      const data = readMcpJson(projectDir);
      data.mcpServers[name] = safeConfig;
      writeMcpJson(projectDir, data);
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  // PUT /api/mcp/:id — update MCP server in .mcp.json
  if (req.method === 'PUT' && urlPath.startsWith('/api/mcp/') && urlPath !== '/api/mcp/catalog') {
    const name = decodeURIComponent(urlPath.split('/').pop());
    try {
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      const data = readMcpJson(projectDir);
      if (!data.mcpServers[name]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server not found' }));
        return true;
      }
      const safeConfig = sanitizeMcpConfig(parsed.config || parsed);
      if (!safeConfig) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'config must include command or url' }));
        return true;
      }
      data.mcpServers[name] = safeConfig;
      writeMcpJson(projectDir, data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  // DELETE /api/mcp/:id — remove MCP server from .mcp.json
  if (
    req.method === 'DELETE' &&
    urlPath.startsWith('/api/mcp/') &&
    urlPath !== '/api/mcp/catalog'
  ) {
    const name = decodeURIComponent(urlPath.split('/').pop());
    try {
      const data = readMcpJson(projectDir);
      if (!data.mcpServers[name]) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Server not found' }));
        return true;
      }
      delete data.mcpServers[name];
      writeMcpJson(projectDir, data);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, name }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return true;
  }

  return false;
}

module.exports = { handleMcp };
