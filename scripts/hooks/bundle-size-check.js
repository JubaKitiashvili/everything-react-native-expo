'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

const HEAVY_PACKAGES = {
  'moment': { size: '290KB', alternative: 'dayjs or date-fns' },
  'lodash': { size: '530KB', alternative: 'lodash-es or individual lodash/ imports' },
  'firebase': { size: '800KB+', alternative: '@react-native-firebase/* (modular)' },
  'aws-sdk': { size: '2.5MB', alternative: '@aws-sdk/client-* (v3 modular)' },
  '@aws-sdk/client-s3': { size: '1MB+', alternative: 'presigned URLs or lighter SDK wrapper' },
  'native-base': { size: '500KB+', alternative: 'tamagui or gluestack-ui' },
  'react-native-paper': { size: '400KB', alternative: 'lightweight custom components' },
  'react-native-elements': { size: '350KB', alternative: 'lightweight custom components' },
  'antd-mobile': { size: '500KB+', alternative: 'tree-shakeable alternative' },
};

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) return pass();
if (path.basename(filePath) !== 'package.json') return pass();

let pkg;
try {
  pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'));
} catch {
  return pass();
}

const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
const warnings = [];

for (const [name, info] of Object.entries(HEAVY_PACKAGES)) {
  if (allDeps[name]) {
    warnings.push(`\`${name}\` (~${info.size}) — consider ${info.alternative}`);
  }
}

const budgetPath = path.join(projectDir, '.erne-budget.json');
if (fs.existsSync(budgetPath)) {
  try {
    const budget = JSON.parse(fs.readFileSync(budgetPath, 'utf8'));
    if (budget.maxDependencies) {
      const depCount = Object.keys(pkg.dependencies || {}).length;
      if (depCount > budget.maxDependencies) {
        warnings.push(`dependencies count (${depCount}) exceeds budget (${budget.maxDependencies})`);
      }
    }
  } catch {}
}

if (warnings.length > 0) {
  return warn(
    `ERNE: Bundle size / performance budget — ${warnings.length} concern(s):\n${warnings.map((w) => `  - ${w}`).join('\n')}`
  );
} else {
  return pass();
}
