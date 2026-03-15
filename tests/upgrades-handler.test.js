'use strict';
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert');

// We need to mock child_process.execFile before requiring the handler.
// Use node:test mock to stub the modules the handler depends on.
const scanner = require('../dashboard/lib/upgrades/scanner');
const planner = require('../dashboard/lib/upgrades/planner');

const handler = require('../dashboard/lib/upgrades/handler');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method, urlPath) {
  return { method: method };
}

function makeRes() {
  var res = {
    statusCode: null,
    headers: {},
    body: null,
    writeHead: function (code, hdrs) {
      res.statusCode = code;
      Object.assign(res.headers, hdrs || {});
    },
    end: function (data) {
      res.body = data;
    },
  };
  return res;
}

function parseBody(res) {
  return JSON.parse(res.body);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('upgrades handler', function () {
  var originalReadCache;
  var originalScanDependencies;
  var originalWriteCache;
  var originalReadPlan;
  var originalBroadcast;
  var originalGetAgentStatus;
  var originalPostEvent;
  var originalProjectDir;

  beforeEach(function () {
    // Save originals
    originalReadCache = scanner.readCache;
    originalScanDependencies = scanner.scanDependencies;
    originalWriteCache = scanner.writeCache;
    originalReadPlan = planner.readPlan;
    originalBroadcast = handler.broadcast;
    originalGetAgentStatus = handler.getAgentStatus;
    originalPostEvent = handler.postEvent;
    originalProjectDir = process.env.ERNE_PROJECT_DIR;

    // Set a known project dir
    process.env.ERNE_PROJECT_DIR = '/tmp/test-project';

    // Default stubs
    scanner.writeCache = function () {};
    handler.broadcast = null;
    handler.getAgentStatus = null;
    handler.postEvent = null;
  });

  afterEach(function () {
    // Restore originals
    scanner.readCache = originalReadCache;
    scanner.scanDependencies = originalScanDependencies;
    scanner.writeCache = originalWriteCache;
    planner.readPlan = originalReadPlan;
    handler.broadcast = originalBroadcast;
    handler.getAgentStatus = originalGetAgentStatus;
    handler.postEvent = originalPostEvent;
    if (originalProjectDir === undefined) {
      delete process.env.ERNE_PROJECT_DIR;
    } else {
      process.env.ERNE_PROJECT_DIR = originalProjectDir;
    }
  });

  // -------------------------------------------------------------------------
  // 1. GET /api/upgrades/scan — cache hit (fresh)
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/scan with fresh cache returns cached data', function () {
    var cached = {
      lastScanned: new Date().toISOString(),
      packages: [{ name: 'react-native', current: '0.73.0', latest: '0.74.0' }],
    };
    scanner.readCache = function () { return cached; };
    scanner.scanDependencies = function () { return Promise.resolve([]); };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/scan', null);

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.strictEqual(data.packages.length, 1);
    assert.strictEqual(data.packages[0].name, 'react-native');
    assert.strictEqual(data.stale, false);
  });

  // -------------------------------------------------------------------------
  // 2. GET /api/upgrades/scan — cache hit (stale)
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/scan with stale cache returns cached data with stale flag', function () {
    var cached = {
      lastScanned: new Date(Date.now() - 7200000).toISOString(), // 2 hours ago
      packages: [{ name: 'expo', current: '50.0.0', latest: '51.0.0' }],
    };
    scanner.readCache = function () { return cached; };
    scanner.scanDependencies = function () { return Promise.resolve([]); };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/scan', null);

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.strictEqual(data.stale, true);
    assert.strictEqual(data.packages[0].name, 'expo');
  });

  // -------------------------------------------------------------------------
  // 3. GET /api/upgrades/scan — no cache, no pending scan
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/scan without cache and no pending scan returns empty', async function () {
    scanner.readCache = function () { return null; };

    var scanResolved = false;
    scanner.scanDependencies = function () {
      return new Promise(function (resolve) {
        // Resolve asynchronously so the handler takes the pendingScan path
        setTimeout(function () {
          scanResolved = true;
          resolve([]);
        }, 10);
      });
    };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/scan', null);

    // The handler should wait for pendingScan — response comes async
    // Wait for it to resolve
    await new Promise(function (resolve) { setTimeout(resolve, 50); });

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.ok(Array.isArray(data.packages));
  });

  // -------------------------------------------------------------------------
  // 4. POST /api/upgrades/refresh — success
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/refresh returns scanned packages', async function () {
    var scannedPackages = [
      { name: 'react-native', current: '0.73.0', latest: '0.74.0' },
      { name: 'expo', current: '50.0.0', latest: '51.0.0' },
    ];
    scanner.scanDependencies = function () { return Promise.resolve(scannedPackages); };

    var writtenData = null;
    scanner.writeCache = function (dir, data) { writtenData = data; };

    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/refresh', null);

    // Wait for the promise to resolve
    await new Promise(function (resolve) { setTimeout(resolve, 10); });

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.strictEqual(data.packages.length, 2);
    assert.ok(data.lastScanned);
    assert.ok(writtenData, 'writeCache should have been called');
    assert.strictEqual(writtenData.packages.length, 2);
  });

  // -------------------------------------------------------------------------
  // 5. POST /api/upgrades/refresh — scanner error
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/refresh returns 500 on scanner error', async function () {
    scanner.scanDependencies = function () { return Promise.reject(new Error('npm registry down')); };

    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/refresh', null);

    await new Promise(function (resolve) { setTimeout(resolve, 10); });

    assert.strictEqual(res.statusCode, 500);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'npm registry down');
  });

  // -------------------------------------------------------------------------
  // 6. POST /api/upgrades/update — missing package
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/update returns 400 when package is missing', function () {
    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/update', JSON.stringify({ version: '1.0.0' }));

    assert.strictEqual(res.statusCode, 400);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'Missing package or version');
  });

  // -------------------------------------------------------------------------
  // 7. POST /api/upgrades/update — missing version
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/update returns 400 when version is missing', function () {
    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/update', JSON.stringify({ package: 'react-native' }));

    assert.strictEqual(res.statusCode, 400);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'Missing package or version');
  });

  // -------------------------------------------------------------------------
  // 8. POST /api/upgrades/update — invalid JSON body
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/update returns 400 on invalid JSON body', function () {
    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/update', '{not valid json');

    assert.strictEqual(res.statusCode, 400);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'Invalid JSON');
  });

  // -------------------------------------------------------------------------
  // 9. POST /api/upgrades/update — invalid package name
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/update returns 400 for invalid package name', function () {
    var cases = [
      '$(evil)',
      '; rm -rf /',
      '../../../etc/passwd',
      ' leading-space',
    ];
    cases.forEach(function (name) {
      var req = makeReq('POST');
      var res = makeRes();
      handler(req, res, '/api/upgrades/update', JSON.stringify({ package: name, version: '1.0.0' }));
      assert.strictEqual(res.statusCode, 400, 'Should reject package name: ' + JSON.stringify(name));
      var data = parseBody(res);
      assert.strictEqual(data.error, 'Invalid package name');
    });
    // Empty string triggers 'Missing package or version' instead
    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/update', JSON.stringify({ package: '', version: '1.0.0' }));
    assert.strictEqual(res.statusCode, 400);
    assert.strictEqual(parseBody(res).error, 'Missing package or version');
  });

  // -------------------------------------------------------------------------
  // 10. POST /api/upgrades/update — valid package name passes validation
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/update accepts valid package names', function () {
    // The handler calls execFile for valid packages, which will fail in test
    // but we only care that it does NOT return 400
    var validNames = [
      'react-native',
      '@expo/vector-icons',
      'lodash',
      'some-pkg123',
    ];
    validNames.forEach(function (name) {
      var req = makeReq('POST');
      var res = makeRes();
      handler(req, res, '/api/upgrades/update', JSON.stringify({ package: name, version: '2.0.0' }));
      // Should not be 400 — either null (waiting for execFile callback) or 200
      assert.notStrictEqual(res.statusCode, 400, 'Should accept package name: ' + name);
    });
  });

  // -------------------------------------------------------------------------
  // 11. POST /api/upgrades/update — body as object (not string)
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/update accepts body as pre-parsed object', function () {
    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/update', { package: 'react-native', version: '0.74.0' });
    // Should not be 400
    assert.notStrictEqual(res.statusCode, 400);
  });

  // -------------------------------------------------------------------------
  // 12. POST /api/upgrades/plan — starts agent
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/plan starts upgrade-assistant agent', function () {
    var postedEvent = null;
    handler.postEvent = function (evt) { postedEvent = evt; };
    handler.getAgentStatus = function () { return 'idle'; };

    var req = makeReq('POST');
    var res = makeRes();
    var body = { package: 'react-native', from: '0.73.0', to: '0.74.0' };
    handler(req, res, '/api/upgrades/plan', JSON.stringify(body));

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.strictEqual(data.status, 'started');
    assert.ok(postedEvent, 'postEvent should have been called');
    assert.strictEqual(postedEvent.type, 'agent:start');
    assert.strictEqual(postedEvent.agent, 'upgrade-assistant');
    assert.ok(postedEvent.task.includes('react-native'));
  });

  // -------------------------------------------------------------------------
  // 13. POST /api/upgrades/plan — agent busy returns queued
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/plan returns queued when agent is busy', function () {
    handler.getAgentStatus = function () { return 'working'; };

    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/plan', JSON.stringify({ package: 'expo', from: '50', to: '51' }));

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.strictEqual(data.status, 'queued');
    assert.ok(data.message.includes('busy'));
  });

  // -------------------------------------------------------------------------
  // 14. POST /api/upgrades/plan — invalid JSON
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/plan returns 400 on invalid JSON', function () {
    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/plan', 'not json');

    assert.strictEqual(res.statusCode, 400);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'Invalid JSON');
  });

  // -------------------------------------------------------------------------
  // 15. POST /api/upgrades/plan — no getAgentStatus hook
  // -------------------------------------------------------------------------
  it('POST /api/upgrades/plan starts even without getAgentStatus hook', function () {
    handler.getAgentStatus = null;
    var postedEvent = null;
    handler.postEvent = function (evt) { postedEvent = evt; };

    var req = makeReq('POST');
    var res = makeRes();
    handler(req, res, '/api/upgrades/plan', JSON.stringify({ package: 'expo', from: '50', to: '51' }));

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.strictEqual(data.status, 'started');
  });

  // -------------------------------------------------------------------------
  // 16. GET /api/upgrades/plan/:package — plan exists
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/plan/:package returns plan when found', function () {
    var fakePlan = { steps: ['Stop the app', 'Run expo install', 'Rebuild'], risk: 'low' };
    planner.readPlan = function (dir, pkg) {
      assert.strictEqual(pkg, 'react-native');
      return fakePlan;
    };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/plan/react-native', null);

    assert.strictEqual(res.statusCode, 200);
    var data = parseBody(res);
    assert.deepStrictEqual(data.steps, fakePlan.steps);
    assert.strictEqual(data.risk, 'low');
  });

  // -------------------------------------------------------------------------
  // 17. GET /api/upgrades/plan/:package — no plan found
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/plan/:package returns 404 when no plan exists', function () {
    planner.readPlan = function () { return null; };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/plan/nonexistent-pkg', null);

    assert.strictEqual(res.statusCode, 404);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'No plan found');
  });

  // -------------------------------------------------------------------------
  // 18. GET /api/upgrades/plan/:package — URL-encoded package name
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/plan/:package decodes URL-encoded package names', function () {
    var receivedPkg = null;
    planner.readPlan = function (dir, pkg) {
      receivedPkg = pkg;
      return { steps: [] };
    };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/plan/%40expo%2Fvector-icons', null);

    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(receivedPkg, '@expo/vector-icons');
  });

  // -------------------------------------------------------------------------
  // 19. Unknown route returns 404
  // -------------------------------------------------------------------------
  it('unknown route returns 404', function () {
    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/nonexistent', null);

    assert.strictEqual(res.statusCode, 404);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'Not found');
  });

  // -------------------------------------------------------------------------
  // 20. Unknown method on known route returns 404
  // -------------------------------------------------------------------------
  it('wrong HTTP method on known route returns 404', function () {
    var req = makeReq('DELETE');
    var res = makeRes();
    handler(req, res, '/api/upgrades/scan', null);

    assert.strictEqual(res.statusCode, 404);
    var data = parseBody(res);
    assert.strictEqual(data.error, 'Not found');
  });

  // -------------------------------------------------------------------------
  // 21. GET /api/upgrades/scan — broadcast is called on background scan
  // -------------------------------------------------------------------------
  it('GET /api/upgrades/scan calls broadcast on background scan completion', async function () {
    scanner.readCache = function () { return null; };
    var broadcastMsg = null;
    handler.broadcast = function (msg) { broadcastMsg = msg; };

    scanner.scanDependencies = function () {
      return Promise.resolve([{ name: 'pkg-a' }, { name: 'pkg-b' }]);
    };

    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/scan', null);

    await new Promise(function (resolve) { setTimeout(resolve, 20); });

    assert.ok(broadcastMsg, 'broadcast should have been called');
    assert.strictEqual(broadcastMsg.type, 'upgrade_available');
    assert.strictEqual(broadcastMsg.count, 2);
  });

  // -------------------------------------------------------------------------
  // 22. Response headers include Content-Type: application/json
  // -------------------------------------------------------------------------
  it('responses include Content-Type application/json header', function () {
    var req = makeReq('GET');
    var res = makeRes();
    handler(req, res, '/api/upgrades/nonexistent', null);

    assert.strictEqual(res.headers['Content-Type'], 'application/json');
  });
});
