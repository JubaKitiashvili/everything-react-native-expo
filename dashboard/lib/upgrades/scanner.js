'use strict';
const https = require('https');
const fs = require('fs');
const path = require('path');

var CORE_DEPS = ['react', 'react-native', 'expo', 'react-dom'];

function parseSemver(v) {
  if (!v) return null;
  var clean = v.replace(/^[\^~>=<]+/, '');
  var parts = clean.split('.');
  if (parts.length < 3) return null;
  var major = parseInt(parts[0], 10);
  var minor = parseInt(parts[1], 10);
  var patch = parseInt(parts[2].split('-')[0], 10);
  if (isNaN(major) || isNaN(minor) || isNaN(patch)) return null;
  return { major: major, minor: minor, patch: patch };
}

function classifyBump(current, latest) {
  var c = parseSemver(current);
  var l = parseSemver(latest);
  if (!c || !l) return 'unknown';
  if (l.major > c.major) return 'major';
  if (l.major < c.major) return 'none';
  if (l.minor > c.minor) return 'minor';
  if (l.minor < c.minor) return 'none';
  if (l.patch > c.patch) return 'patch';
  return 'none';
}

function calculateRisk(opts) {
  var score = 0;
  var factors = [];

  if (opts.bump === 'patch') { score += 1; factors.push('patch bump'); }
  else if (opts.bump === 'minor') { score += 2; factors.push('minor bump'); }
  else if (opts.bump === 'major') { score += 4; factors.push('major bump'); }

  if (opts.isCore) { score += 1; factors.push('core dependency'); }
  if (opts.hasBreaking) { score += 1; factors.push('breaking changes'); }
  if (opts.lowAdoption) { score += 1; factors.push('low adoption'); }

  return { risk: Math.min(score, 5), riskFactors: factors };
}

function fetchNpmInfo(pkgName) {
  return new Promise(function (resolve, reject) {
    var url = 'https://registry.npmjs.org/' + encodeURIComponent(pkgName) + '/latest';
    var req = https.get(url, { headers: { 'User-Agent': 'ERNE-Dashboard/0.7' }, timeout: 8000 }, function (res) {
      var body = '';
      res.on('data', function (d) { body += d; });
      res.on('end', function () {
        if (res.statusCode !== 200) {
          reject(new Error('npm registry returned ' + res.statusCode + ' for ' + pkgName));
          return;
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('timeout: ' + pkgName)); });
    req.on('error', reject);
  });
}

async function scanDependencies(projectDir) {
  var pkgPath = path.join(projectDir, 'package.json');
  var pkg;
  try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8')); } catch (e) { return []; }

  var deps = Object.assign({}, pkg.dependencies || {});
  var packages = [];

  for (var name in deps) {
    if (!deps.hasOwnProperty(name)) continue;
    var currentVersion = deps[name];
    var current = parseSemver(currentVersion);
    if (!current) continue;

    try {
      var info = await fetchNpmInfo(name);
      if (!info || !info.version) continue;
      var latest = info.version;
      var bump = classifyBump(currentVersion, latest);
      if (bump === 'none' || bump === 'unknown') continue;

      var isCore = CORE_DEPS.indexOf(name) !== -1;
      var riskResult = calculateRisk({ name: name, bump: bump, isCore: isCore, hasBreaking: false });

      packages.push({
        name: name,
        current: currentVersion.replace(/^[\^~>=<]+/, ''),
        latest: latest,
        bump: bump,
        risk: riskResult.risk,
        riskFactors: riskResult.riskFactors,
        changelogUrl: 'https://www.npmjs.com/package/' + name + '?activeTab=versions',
        publishedAt: info.time && info.time[latest] ? info.time[latest] : null,
      });
    } catch (e) {
      // Skip failed packages
    }
  }

  packages.sort(function (a, b) { return b.risk - a.risk; });
  return packages;
}

function getCachePath(projectDir) {
  return path.join(projectDir, '.erne', 'upgrades.json');
}

function readCache(projectDir) {
  try { return JSON.parse(fs.readFileSync(getCachePath(projectDir), 'utf8')); } catch (e) { return null; }
}

function writeCache(projectDir, data) {
  var dir = path.join(projectDir, '.erne');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getCachePath(projectDir), JSON.stringify(data, null, 2));
}

module.exports = {
  parseSemver: parseSemver,
  classifyBump: classifyBump,
  calculateRisk: calculateRisk,
  scanDependencies: scanDependencies,
  readCache: readCache,
  writeCache: writeCache,
  CORE_DEPS: CORE_DEPS,
};
