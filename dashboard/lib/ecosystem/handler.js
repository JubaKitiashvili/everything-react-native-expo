'use strict';
const fetcher = require('./fetcher');
const analyzer = require('./analyzer');
var detectProject;
try { detectProject = require('../../lib/detect').detectProject; } catch (e) { detectProject = null; }

var cachedStack = null;

function getStack(projectDir) {
  if (cachedStack) return cachedStack;
  try {
    var pkgPath = require('path').join(projectDir, 'package.json');
    var pkg = JSON.parse(require('fs').readFileSync(pkgPath, 'utf8'));
    cachedStack = { dependencies: Object.assign({}, pkg.dependencies || {}, pkg.devDependencies || {}) };
  } catch (e) {
    cachedStack = { dependencies: {} };
  }
  return cachedStack;
}

function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function handler(req, res, urlPath, body) {
  var projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

  if (req.method === 'GET' && urlPath === '/api/ecosystem/feed') {
    var cache = fetcher.readCache(projectDir);
    if (!cache) return sendJSON(res, 200, { items: [], lastFetched: null, empty: true });
    var stack = getStack(projectDir);
    var scored = analyzer.analyzeRelevance(cache.items || [], stack);
    return sendJSON(res, 200, { items: scored, lastFetched: cache.lastFetched, ghToken: cache.ghToken, rateLimited: cache.rateLimited });
  }

  if (req.method === 'POST' && urlPath === '/api/ecosystem/refresh') {
    var lazyBroadcast = function (msg) { if (handler.broadcast) handler.broadcast(msg); };
    fetcher.refresh(projectDir, lazyBroadcast).then(function (cache) {
      var stack = getStack(projectDir);
      var scored = analyzer.analyzeRelevance(cache.items || [], stack);
      sendJSON(res, 200, { items: scored, lastFetched: cache.lastFetched });
    }).catch(function (err) {
      sendJSON(res, 500, { error: err.message });
    });
    return;
  }

  sendJSON(res, 404, { error: 'Not found' });
}

handler.broadcast = null;
handler.autoRefresh = function (projectDir, broadcastFn) {
  handler.broadcast = broadcastFn;
  fetcher.refresh(projectDir, broadcastFn).catch(function () {});
};

module.exports = handler;
