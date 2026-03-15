'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const collector = require('../dashboard/lib/insights/collector');
const trends = require('../dashboard/lib/insights/trends');
const handler = require('../dashboard/lib/insights/handler');

// ─── helpers ───

function mockReq(method, url) {
  return { method: method, url: url };
}

function mockRes() {
  var res = {
    statusCode: null,
    headers: null,
    body: null,
    writeHead: function (code, headers) {
      res.statusCode = code;
      res.headers = headers;
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

// ─── stubs ───

var stubs = {};

function stubCollector(method, fn) {
  stubs[method] = collector[method];
  collector[method] = fn;
}

function stubTrends(method, fn) {
  stubs['trends.' + method] = trends[method];
  trends[method] = fn;
}

// ─── tests ───

describe('insights handler', () => {
  var origEnv;

  beforeEach(() => {
    origEnv = process.env.ERNE_PROJECT_DIR;
    stubs = {};
  });

  afterEach(() => {
    // restore stubs
    if (stubs.readSnapshots) collector.readSnapshots = stubs.readSnapshots;
    if (stubs.takeSnapshot) collector.takeSnapshot = stubs.takeSnapshot;
    if (stubs.writeSnapshots) collector.writeSnapshots = stubs.writeSnapshots;
    if (stubs.snapshotIfNeeded) collector.snapshotIfNeeded = stubs.snapshotIfNeeded;
    if (stubs['trends.computeAgentUtilization']) trends.computeAgentUtilization = stubs['trends.computeAgentUtilization'];
    // restore env
    if (origEnv === undefined) {
      delete process.env.ERNE_PROJECT_DIR;
    } else {
      process.env.ERNE_PROJECT_DIR = origEnv;
    }
  });

  // ─── GET /api/insights/snapshots ───

  describe('GET /api/insights/snapshots', () => {
    it('returns snapshots from collector', () => {
      var fakeSnapshots = [
        { date: '2026-03-01', auditScore: 70 },
        { date: '2026-03-15', auditScore: 86 },
      ];
      stubCollector('readSnapshots', function () { return fakeSnapshots; });

      var req = mockReq('GET', '/api/insights/snapshots');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshots', null);

      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(res.headers, { 'Content-Type': 'application/json' });
      var data = parseBody(res);
      assert.deepStrictEqual(data.snapshots, fakeSnapshots);
    });

    it('passes projectDir from ERNE_PROJECT_DIR env', () => {
      var calledWith = null;
      stubCollector('readSnapshots', function (dir) {
        calledWith = dir;
        return [];
      });
      process.env.ERNE_PROJECT_DIR = '/tmp/test-project';

      var req = mockReq('GET', '/api/insights/snapshots');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshots', null);

      assert.equal(calledWith, '/tmp/test-project');
    });

    it('falls back to cwd when ERNE_PROJECT_DIR is not set', () => {
      var calledWith = null;
      stubCollector('readSnapshots', function (dir) {
        calledWith = dir;
        return [];
      });
      delete process.env.ERNE_PROJECT_DIR;

      var req = mockReq('GET', '/api/insights/snapshots');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshots', null);

      assert.equal(calledWith, process.cwd());
    });

    it('returns empty array when no snapshots exist', () => {
      stubCollector('readSnapshots', function () { return []; });

      var req = mockReq('GET', '/api/insights/snapshots');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshots', null);

      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(parseBody(res).snapshots, []);
    });
  });

  // ─── POST /api/insights/snapshot ───

  describe('POST /api/insights/snapshot', () => {
    it('takes a snapshot and returns it', () => {
      var newSnapshot = { date: '2026-03-15', auditScore: 90 };
      stubCollector('takeSnapshot', function () { return newSnapshot; });
      stubCollector('readSnapshots', function () { return []; });
      stubCollector('writeSnapshots', function () {});

      var req = mockReq('POST', '/api/insights/snapshot');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshot', null);

      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(parseBody(res), newSnapshot);
    });

    it('replaces existing snapshot for today', () => {
      var today = new Date().toISOString().split('T')[0];
      var oldSnapshot = { date: today, auditScore: 70 };
      var newSnapshot = { date: today, auditScore: 90 };
      var writtenData = null;

      stubCollector('takeSnapshot', function () { return newSnapshot; });
      stubCollector('readSnapshots', function () { return [oldSnapshot]; });
      stubCollector('writeSnapshots', function (_dir, data) { writtenData = data; });

      var req = mockReq('POST', '/api/insights/snapshot');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshot', null);

      // The old snapshot for today should be filtered out, replaced by the new one
      assert.equal(writtenData.length, 1);
      assert.deepStrictEqual(writtenData[0], newSnapshot);
    });

    it('preserves snapshots from other dates', () => {
      var today = new Date().toISOString().split('T')[0];
      var oldSnapshot = { date: '2026-03-01', auditScore: 70 };
      var newSnapshot = { date: today, auditScore: 90 };
      var writtenData = null;

      stubCollector('takeSnapshot', function () { return newSnapshot; });
      stubCollector('readSnapshots', function () { return [oldSnapshot]; });
      stubCollector('writeSnapshots', function (_dir, data) { writtenData = data; });

      var req = mockReq('POST', '/api/insights/snapshot');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshot', null);

      assert.equal(writtenData.length, 2);
      assert.deepStrictEqual(writtenData[0], oldSnapshot);
      assert.deepStrictEqual(writtenData[1], newSnapshot);
    });

    it('passes projectDir to collector methods', () => {
      var takeCalled = null;
      var readCalled = null;
      var writeCalled = null;

      stubCollector('takeSnapshot', function (dir) { takeCalled = dir; return { date: '2026-03-15' }; });
      stubCollector('readSnapshots', function (dir) { readCalled = dir; return []; });
      stubCollector('writeSnapshots', function (dir) { writeCalled = dir; });
      process.env.ERNE_PROJECT_DIR = '/tmp/snap-project';

      var req = mockReq('POST', '/api/insights/snapshot');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshot', null);

      assert.equal(takeCalled, '/tmp/snap-project');
      assert.equal(readCalled, '/tmp/snap-project');
      assert.equal(writeCalled, '/tmp/snap-project');
    });
  });

  // ─── GET /api/insights/agents ───

  describe('GET /api/insights/agents', () => {
    it('returns utilization data from history file', () => {
      var fakeUtilization = [
        { name: 'architect', pct: 66.7 },
        { name: 'code-reviewer', pct: 33.3 },
      ];
      // Stub fs.readFileSync via trends — we need to stub computeAgentUtilization
      // and also ensure the fs.readFileSync path succeeds.
      // The handler reads the file itself, so we need to stub fs.
      var fs = require('fs');
      var origReadFileSync = fs.readFileSync;
      var fakeHistory = { architect: [{ type: 'complete', durationMs: 60000 }] };
      fs.readFileSync = function (filePath, enc) {
        if (filePath.includes('activity-history.json')) {
          return JSON.stringify(fakeHistory);
        }
        return origReadFileSync.call(fs, filePath, enc);
      };
      stubTrends('computeAgentUtilization', function (history) {
        assert.deepStrictEqual(history, fakeHistory);
        return fakeUtilization;
      });

      var req = mockReq('GET', '/api/insights/agents');
      var res = mockRes();
      handler(req, res, '/api/insights/agents', null);

      fs.readFileSync = origReadFileSync;

      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(parseBody(res).agents, fakeUtilization);
    });

    it('returns empty agents array when history file does not exist', () => {
      // The handler catches the error and returns empty array
      var fs = require('fs');
      var origReadFileSync = fs.readFileSync;
      fs.readFileSync = function (filePath, enc) {
        if (filePath.includes('activity-history.json')) {
          var err = new Error('ENOENT: no such file');
          err.code = 'ENOENT';
          throw err;
        }
        return origReadFileSync.call(fs, filePath, enc);
      };

      var req = mockReq('GET', '/api/insights/agents');
      var res = mockRes();
      handler(req, res, '/api/insights/agents', null);

      fs.readFileSync = origReadFileSync;

      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(parseBody(res).agents, []);
    });

    it('returns empty agents array when history file has invalid JSON', () => {
      var fs = require('fs');
      var origReadFileSync = fs.readFileSync;
      fs.readFileSync = function (filePath, enc) {
        if (filePath.includes('activity-history.json')) {
          return 'not valid json{{{';
        }
        return origReadFileSync.call(fs, filePath, enc);
      };

      var req = mockReq('GET', '/api/insights/agents');
      var res = mockRes();
      handler(req, res, '/api/insights/agents', null);

      fs.readFileSync = origReadFileSync;

      assert.equal(res.statusCode, 200);
      assert.deepStrictEqual(parseBody(res).agents, []);
    });
  });

  // ─── Unknown routes ───

  describe('unknown routes', () => {
    it('returns 404 for unmatched GET route', () => {
      var req = mockReq('GET', '/api/insights/unknown');
      var res = mockRes();
      handler(req, res, '/api/insights/unknown', null);

      assert.equal(res.statusCode, 404);
      assert.deepStrictEqual(parseBody(res), { error: 'Not found' });
    });

    it('returns 404 for wrong method on snapshots route', () => {
      var req = mockReq('DELETE', '/api/insights/snapshots');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshots', null);

      assert.equal(res.statusCode, 404);
      assert.deepStrictEqual(parseBody(res), { error: 'Not found' });
    });

    it('returns 404 for GET on snapshot (singular) route', () => {
      var req = mockReq('GET', '/api/insights/snapshot');
      var res = mockRes();
      handler(req, res, '/api/insights/snapshot', null);

      assert.equal(res.statusCode, 404);
    });

    it('returns 404 for POST on agents route', () => {
      var req = mockReq('POST', '/api/insights/agents');
      var res = mockRes();
      handler(req, res, '/api/insights/agents', null);

      assert.equal(res.statusCode, 404);
    });
  });

  // ─── autoSnapshot ───

  describe('autoSnapshot', () => {
    it('calls collector.snapshotIfNeeded with projectDir', () => {
      var calledWith = null;
      stubCollector('snapshotIfNeeded', function (dir) { calledWith = dir; });

      handler.autoSnapshot('/tmp/auto-snap');

      assert.equal(calledWith, '/tmp/auto-snap');
    });
  });
});
