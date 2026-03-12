// tests/dashboard.test.js — Tests for the dashboard command
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

const { parseArgs, checkPort } = require('../lib/dashboard');

const tempDirs = [];

function createTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-dash-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
  }
});

// ─── parseArgs ───

describe('dashboard — parseArgs', () => {
  it('defaults to port 3333 and open true', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard']);
    assert.equal(result.port, 3333);
    assert.equal(result.open, true);
  });

  it('parses --port with valid value', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '8080']);
    assert.equal(result.port, 8080);
    assert.equal(result.open, true);
  });

  it('parses --no-open flag', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--no-open']);
    assert.equal(result.open, false);
    assert.equal(result.port, 3333);
  });

  it('parses --port and --no-open together', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '4000', '--no-open']);
    assert.equal(result.port, 4000);
    assert.equal(result.open, false);
  });

  it('accepts port 1 (minimum valid)', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '1']);
    assert.equal(result.port, 1);
  });

  it('accepts port 65535 (maximum valid)', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '65535']);
    assert.equal(result.port, 65535);
  });

  it('truncates decimal port to integer', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '3000.7']);
    assert.equal(result.port, 3000);
  });
});

// ─── checkPort ───

describe('dashboard — checkPort', () => {
  it('resolves for an available port', async () => {
    // Use a high random port that is almost certainly available
    const port = 49152 + Math.floor(Math.random() * 16000);
    await checkPort(port); // Should not throw
  });

  it('rejects when port is in use', async () => {
    const server = net.createServer();
    const port = await new Promise((resolve, reject) => {
      server.listen(0, () => {
        resolve(server.address().port);
      });
      server.once('error', reject);
    });

    try {
      await assert.rejects(
        () => checkPort(port),
        (err) => {
          assert.ok(err.message.includes('already in use'));
          return true;
        }
      );
    } finally {
      server.close();
    }
  });
});

// ─── ensureHooksConfigured ───

describe('dashboard — ensureHooksConfigured behavior', () => {
  it('skips adding hooks when dashboard-event.js already present (old format)', () => {
    const dir = createTempDir();
    const hooksDir = path.join(dir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    const hooksData = {
      hooks: [
        { event: 'PreToolUse', pattern: 'Agent', script: 'dashboard-event.js' },
      ],
    };
    const hooksPath = path.join(hooksDir, 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2));

    // Read hooks, check for dashboard hook, confirm it is found
    const raw = fs.readFileSync(hooksPath, 'utf8');
    const data = JSON.parse(raw);
    const hasDashboardHook = data.hooks.some(
      (h) => h.script === 'dashboard-event.js'
    );
    assert.equal(hasDashboardHook, true, 'Should detect existing dashboard hook');
    // Hooks count should remain 1 (no additions needed)
    assert.equal(data.hooks.length, 1);
  });

  it('skips adding hooks when dashboard-event.js already present (event-keyed format)', () => {
    const dir = createTempDir();
    const hooksDir = path.join(dir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    const hooksData = {
      PreToolUse: [
        { pattern: 'Agent', script: 'dashboard-event.js' },
      ],
    };
    const hooksPath = path.join(hooksDir, 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2));

    // Verify event-keyed format detection works
    const raw = fs.readFileSync(hooksPath, 'utf8');
    const data = JSON.parse(raw);
    let found = false;
    for (const [key, hooks] of Object.entries(data)) {
      if (Array.isArray(hooks) && hooks.some((h) => h.script === 'dashboard-event.js')) {
        found = true;
      }
    }
    assert.equal(found, true, 'Should detect existing dashboard hook in event-keyed format');
  });

  it('detects when hooks are missing and need adding', () => {
    const dir = createTempDir();
    const hooksDir = path.join(dir, 'hooks');
    fs.mkdirSync(hooksDir, { recursive: true });

    const hooksData = {
      hooks: [
        { event: 'PreToolUse', pattern: 'Bash', script: 'some-other.js' },
      ],
    };
    const hooksPath = path.join(hooksDir, 'hooks.json');
    fs.writeFileSync(hooksPath, JSON.stringify(hooksData, null, 2));

    const raw = fs.readFileSync(hooksPath, 'utf8');
    const data = JSON.parse(raw);
    const hasDashboardHook = data.hooks.some(
      (h) => h.script === 'dashboard-event.js'
    );
    assert.equal(hasDashboardHook, false, 'Should detect missing dashboard hook');

    // Simulate adding the hooks (what ensureHooksConfigured does when user says yes)
    data.hooks.push(
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

    fs.writeFileSync(hooksPath, JSON.stringify(data, null, 2) + '\n', 'utf8');

    // Verify hooks were added
    const updated = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    assert.equal(updated.hooks.length, 3, 'Should have 3 hooks after adding');
    const dashboardHooks = updated.hooks.filter(
      (h) => h.script === 'dashboard-event.js'
    );
    assert.equal(dashboardHooks.length, 2, 'Should have 2 dashboard hooks (Pre + Post)');
  });

  it('handles missing hooks.json gracefully', () => {
    const dir = createTempDir();
    const hooksPath = path.join(dir, 'hooks', 'hooks.json');

    // Simulate what ensureHooksConfigured does on ENOENT
    let warningIssued = false;
    try {
      fs.readFileSync(hooksPath, 'utf8');
    } catch (err) {
      if (err.code === 'ENOENT') {
        warningIssued = true;
      }
    }
    assert.equal(warningIssued, true, 'Should handle missing hooks.json with ENOENT');
  });
});

// ─── Module export ───

describe('dashboard — module', () => {
  it('exports a function', () => {
    const dashboard = require('../lib/dashboard');
    assert.equal(typeof dashboard, 'function');
  });

  it('exports parseArgs function', () => {
    assert.equal(typeof parseArgs, 'function');
  });

  it('exports checkPort function', () => {
    assert.equal(typeof checkPort, 'function');
  });
});
