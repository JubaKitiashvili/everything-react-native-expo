// scripts/hooks/lib/port-registry.js — Port registry for multi-project dashboard
'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const ERNE_DIR = path.join(os.homedir(), '.erne');
const REGISTRY_PATH = path.join(ERNE_DIR, 'ports.json');
const PORT_RANGE_START = parseInt(process.env.ERNE_DASHBOARD_PORT, 10) || 3333;
const PORT_RANGE_END = 3399;

/**
 * Ensure ~/.erne/ directory exists.
 */
function ensureErneDir() {
  try {
    fs.mkdirSync(ERNE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

/**
 * Read the port registry, cleaning stale entries (dead PIDs).
 * @returns {Object} registry mapping project paths to { port, pid, started }
 */
function readRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_PATH, 'utf8');
    const registry = JSON.parse(raw);
    let changed = false;

    for (const [projectPath, entry] of Object.entries(registry)) {
      if (!isProcessAlive(entry.pid)) {
        delete registry[projectPath];
        changed = true;
      }
    }

    if (changed) {
      writeRegistry(registry);
    }

    return registry;
  } catch {
    return {};
  }
}

/**
 * Write the registry to disk.
 * @param {Object} registry
 */
function writeRegistry(registry) {
  try {
    ensureErneDir();
    fs.writeFileSync(REGISTRY_PATH, JSON.stringify(registry, null, 2));
  } catch {
    // Best-effort — silent fail
  }
}

/**
 * Check if a process is still alive.
 * @param {number} pid
 * @returns {boolean}
 */
function isProcessAlive(pid) {
  if (!pid || typeof pid !== 'number') return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the registered port for a project path, if the entry is still alive.
 * @param {string} [projectPath] - Defaults to ERNE_PROJECT_DIR or cwd
 * @returns {number|null}
 */
function getRegisteredPort(projectPath) {
  try {
    const key = projectPath || process.env.ERNE_PROJECT_DIR || process.cwd();
    const registry = readRegistry();
    const entry = registry[key];
    if (entry && entry.port) {
      return entry.port;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Register a port for a project.
 * @param {string} projectPath
 * @param {number} port
 * @param {number} pid
 */
function registerPort(projectPath, port, pid) {
  try {
    const registry = readRegistry();
    registry[projectPath] = {
      port,
      pid,
      started: new Date().toISOString(),
    };
    writeRegistry(registry);
  } catch {
    // Best-effort
  }
}

/**
 * Remove a project's entry from the registry.
 * @param {string} projectPath
 */
function unregisterPort(projectPath) {
  try {
    const registry = readRegistry();
    if (registry[projectPath]) {
      delete registry[projectPath];
      writeRegistry(registry);
    }
  } catch {
    // Best-effort
  }
}

/**
 * Test if a port is available by attempting to bind it.
 * @param {number} port
 * @returns {Promise<boolean>}
 */
function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close(() => resolve(true));
    });
    server.listen(port, '127.0.0.1');
  });
}

/**
 * Find a free port in the ERNE range (3333-3399), skipping ports
 * already claimed in the registry.
 * @returns {Promise<number>} The first available port
 * @throws {Error} If no ports are available
 */
async function findFreePort() {
  const registry = readRegistry();
  const usedPorts = new Set(Object.values(registry).map((e) => e.port));

  for (let port = PORT_RANGE_START; port <= PORT_RANGE_END; port++) {
    if (usedPorts.has(port)) continue;
    const free = await isPortFree(port);
    if (free) return port;
  }

  throw new Error(`No free ports in range ${PORT_RANGE_START}-${PORT_RANGE_END}`);
}

/**
 * Resolve the dashboard port for the current project.
 * Priority: env var > registry > fallback 3333
 * This is used by hooks and event publishers.
 * @param {string} [projectPath]
 * @returns {number}
 */
function resolveDashboardPort(projectPath) {
  // 1. Env var (highest priority for hooks)
  if (process.env.ERNE_DASHBOARD_PORT) {
    return parseInt(process.env.ERNE_DASHBOARD_PORT, 10);
  }

  // 2. Registry lookup
  const registered = getRegisteredPort(projectPath);
  if (registered) return registered;

  // 3. Fallback
  return PORT_RANGE_START;
}

module.exports = {
  readRegistry,
  writeRegistry,
  getRegisteredPort,
  registerPort,
  unregisterPort,
  isPortFree,
  findFreePort,
  resolveDashboardPort,
  REGISTRY_PATH,
  PORT_RANGE_START,
  PORT_RANGE_END,
};
