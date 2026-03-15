'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const fetcher = require('../dashboard/lib/ecosystem/fetcher');
const analyzer = require('../dashboard/lib/ecosystem/analyzer');
const handler = require('../dashboard/lib/ecosystem/handler');

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mockReq(method) {
  return { method };
}

function mockRes() {
  var res = {
    _status: null,
    _headers: null,
    _body: null,
    writeHead: function (status, headers) {
      res._status = status;
      res._headers = headers;
    },
    end: function (body) {
      res._body = body;
    },
  };
  return res;
}

function parsedBody(res) {
  return JSON.parse(res._body);
}

// ─── Stub management ─────────────────────────────────────────────────────────

var origReadCache, origRefresh, origAnalyzeRelevance;

beforeEach(function () {
  origReadCache = fetcher.readCache;
  origRefresh = fetcher.refresh;
  origAnalyzeRelevance = analyzer.analyzeRelevance;
  handler.broadcast = null;
});

afterEach(function () {
  fetcher.readCache = origReadCache;
  fetcher.refresh = origRefresh;
  analyzer.analyzeRelevance = origAnalyzeRelevance;
  handler.broadcast = null;
});

// ─── GET /api/ecosystem/feed ─────────────────────────────────────────────────

describe('ecosystem handler — GET /api/ecosystem/feed', function () {
  it('returns empty response when no cache exists', function () {
    fetcher.readCache = function () { return null; };

    var req = mockReq('GET');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/feed', null);

    assert.equal(res._status, 200);
    var body = parsedBody(res);
    assert.deepStrictEqual(body.items, []);
    assert.equal(body.lastFetched, null);
    assert.equal(body.empty, true);
  });

  it('returns scored items when cache exists', function () {
    var fakeItems = [
      { package: 'expo', tag: 'NEW', relevance: 0 },
      { package: 'zustand', tag: 'SEC', relevance: 0 },
    ];
    fetcher.readCache = function () {
      return { items: fakeItems, lastFetched: '2026-03-15T00:00:00Z', ghToken: true, rateLimited: false };
    };
    analyzer.analyzeRelevance = function (items, stack) {
      return items.map(function (item, i) {
        return Object.assign({}, item, { relevance: 100 - i * 10 });
      });
    };

    var req = mockReq('GET');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/feed', null);

    assert.equal(res._status, 200);
    var body = parsedBody(res);
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].relevance, 100);
    assert.equal(body.items[1].relevance, 90);
    assert.equal(body.lastFetched, '2026-03-15T00:00:00Z');
    assert.equal(body.ghToken, true);
    assert.equal(body.rateLimited, false);
  });

  it('handles cache with no items array gracefully', function () {
    fetcher.readCache = function () {
      return { lastFetched: '2026-03-15T00:00:00Z' };
    };
    analyzer.analyzeRelevance = function (items) { return items; };

    var req = mockReq('GET');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/feed', null);

    assert.equal(res._status, 200);
    var body = parsedBody(res);
    assert.deepStrictEqual(body.items, []);
  });
});

// ─── POST /api/ecosystem/refresh ────────────────────────────────────────────

describe('ecosystem handler — POST /api/ecosystem/refresh', function () {
  it('returns scored items on successful refresh', async function () {
    var refreshedItems = [{ package: 'react-native', tag: 'NEW', relevance: 0 }];
    fetcher.refresh = function () {
      return Promise.resolve({ items: refreshedItems, lastFetched: '2026-03-15T12:00:00Z' });
    };
    analyzer.analyzeRelevance = function (items) {
      return items.map(function (item) {
        return Object.assign({}, item, { relevance: 75 });
      });
    };

    var req = mockReq('POST');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/refresh', null);

    // refresh is async — wait for the promise to resolve
    await new Promise(function (resolve) { setTimeout(resolve, 10); });

    assert.equal(res._status, 200);
    var body = parsedBody(res);
    assert.equal(body.items.length, 1);
    assert.equal(body.items[0].relevance, 75);
    assert.equal(body.lastFetched, '2026-03-15T12:00:00Z');
  });

  it('returns 500 when refresh fails', async function () {
    fetcher.refresh = function () {
      return Promise.reject(new Error('GitHub rate limit exceeded'));
    };

    var req = mockReq('POST');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/refresh', null);

    await new Promise(function (resolve) { setTimeout(resolve, 10); });

    assert.equal(res._status, 500);
    var body = parsedBody(res);
    assert.equal(body.error, 'GitHub rate limit exceeded');
  });

  it('calls broadcast function when set', async function () {
    var broadcastMessages = [];
    handler.broadcast = function (msg) { broadcastMessages.push(msg); };

    fetcher.refresh = function (projectDir, broadcastFn) {
      broadcastFn({ type: 'ecosystem:refreshing' });
      return Promise.resolve({ items: [], lastFetched: '2026-03-15T12:00:00Z' });
    };
    analyzer.analyzeRelevance = function (items) { return items; };

    var req = mockReq('POST');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/refresh', null);

    await new Promise(function (resolve) { setTimeout(resolve, 10); });

    assert.equal(broadcastMessages.length, 1);
    assert.equal(broadcastMessages[0].type, 'ecosystem:refreshing');
  });
});

// ─── Unknown routes ─────────────────────────────────────────────────────────

describe('ecosystem handler — unknown routes', function () {
  it('returns 404 for unrecognized path', function () {
    var req = mockReq('GET');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/unknown', null);

    assert.equal(res._status, 404);
    var body = parsedBody(res);
    assert.equal(body.error, 'Not found');
  });

  it('returns 404 for wrong method on feed endpoint', function () {
    var req = mockReq('DELETE');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/feed', null);

    assert.equal(res._status, 404);
    var body = parsedBody(res);
    assert.equal(body.error, 'Not found');
  });

  it('returns 404 for GET on refresh endpoint', function () {
    var req = mockReq('GET');
    var res = mockRes();
    handler(req, res, '/api/ecosystem/refresh', null);

    assert.equal(res._status, 404);
  });
});

// ─── autoRefresh ─────────────────────────────────────────────────────────────

describe('ecosystem handler — autoRefresh', function () {
  it('sets the broadcast function on handler', function () {
    fetcher.refresh = function () { return Promise.resolve({}); };

    var broadcastFn = function () {};
    handler.autoRefresh('/tmp/test-project', broadcastFn);

    assert.equal(handler.broadcast, broadcastFn);
  });

  it('calls fetcher.refresh with projectDir and broadcastFn', function () {
    var calledWith = {};
    fetcher.refresh = function (dir, fn) {
      calledWith.dir = dir;
      calledWith.fn = fn;
      return Promise.resolve({});
    };

    var broadcastFn = function () {};
    handler.autoRefresh('/tmp/test-project', broadcastFn);

    assert.equal(calledWith.dir, '/tmp/test-project');
    assert.equal(calledWith.fn, broadcastFn);
  });

  it('swallows refresh errors silently', async function () {
    fetcher.refresh = function () {
      return Promise.reject(new Error('network error'));
    };

    // Should not throw
    handler.autoRefresh('/tmp/test-project', function () {});

    await new Promise(function (resolve) { setTimeout(resolve, 10); });
    // If we got here without unhandled rejection, the test passes
    assert.ok(true);
  });
});

// ─── Module exports ─────────────────────────────────────────────────────────

describe('ecosystem handler — module', function () {
  it('exports a function', function () {
    assert.equal(typeof handler, 'function');
  });

  it('has a broadcast property', function () {
    assert.ok('broadcast' in handler);
  });

  it('has an autoRefresh method', function () {
    assert.equal(typeof handler.autoRefresh, 'function');
  });
});
