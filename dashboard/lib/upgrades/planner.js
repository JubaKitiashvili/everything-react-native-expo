// dashboard/lib/upgrades/planner.js
'use strict';
const fs = require('fs');
const path = require('path');

function getPlanPath(projectDir, pkgName) {
  return path.join(projectDir, '.erne', 'upgrade-plans', pkgName + '.json');
}

function readPlan(projectDir, pkgName) {
  try { return JSON.parse(fs.readFileSync(getPlanPath(projectDir, pkgName), 'utf8')); } catch (e) { return null; }
}

function savePlan(projectDir, pkgName, plan) {
  var dir = path.join(projectDir, '.erne', 'upgrade-plans');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(getPlanPath(projectDir, pkgName), JSON.stringify(plan, null, 2));
}

module.exports = { readPlan: readPlan, savePlan: savePlan, getPlanPath: getPlanPath };
