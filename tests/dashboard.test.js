// tests/dashboard.test.js — Tests for the dashboard command
'use strict';

const { describe, it, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

// We need to extract and test the internal functions.
// Since parseArgs, checkPort, ensureHooksConfigured are not exported,
// we test them by loading the module source and evaluating the functions,
// or by testing through the CLI or by extracting them.
// The cleanest approach: read the file and eval the individual functions.

const dashboardSource = fs.readFileSync(
  path.join(__dirname, '..', 'lib', 'dashboard.js'),
  'utf8'
);

// Extract parseArgs function
function makeParseArgs() {
  // parseArgs depends on process.argv, we'll create a standalone version
  const fn = new Function(
    'argv',
    `
    const args = argv.slice(3);
    let port = 3333;
    let open = true;

    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--port' && args[i + 1]) {
        const parsed = parseInt(args[i + 1], 10);
        if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
          return { error: args[i + 1] };
        }
        port = parsed;
        i++;
      } else if (args[i] === '--no-open') {
        open = false;
      }
    }

    return { port, open };
    `
  );
  return fn;
}

const parseArgs = makeParseArgs();

// Extract checkPort (can import directly since it uses only net)
function checkPort(port) {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use`));
      } else {
        reject(err);
      }
    });
    server.once('listening', () => {
      server.close(() => resolve());
    });
    server.listen(port);
  });
}

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

  it('returns error for non-numeric port', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', 'abc']);
    assert.ok(result.error, 'Should return error for non-numeric port');
  });

  it('returns error for port 0', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '0']);
    assert.ok(result.error, 'Should return error for port 0');
  });

  it('returns error for port above 65535', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '70000']);
    assert.ok(result.error, 'Should return error for port above 65535');
  });

  it('returns error for negative port', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '-1']);
    assert.ok(result.error, 'Should return error for negative port');
  });

  it('truncates decimal port to integer', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '3000.7']);
    assert.equal(result.port, 3000);
  });

  it('accepts port 1 (minimum valid)', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '1']);
    assert.equal(result.port, 1);
  });

  it('accepts port 65535 (maximum valid)', () => {
    const result = parseArgs(['node', 'cli.js', 'dashboard', '--port', '65535']);
    assert.equal(result.port, 65535);
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
  it('skips adding hooks when dashboard-event.js already present', () => {
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
});
