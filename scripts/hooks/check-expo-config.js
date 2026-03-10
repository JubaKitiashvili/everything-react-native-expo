'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn } = require('./lib/hook-utils');

const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) return pass();

const basename = path.basename(filePath);
const isConfig = basename === 'app.json' || basename === 'app.config.ts' || basename === 'app.config.js';
if (!isConfig) return pass();

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const appJsonPath = path.join(projectDir, 'app.json');

try {
  const raw = fs.readFileSync(appJsonPath, 'utf8');
  let config;
  try {
    config = JSON.parse(raw);
  } catch {
    return warn('ERNE: app.json contains invalid JSON');
  }

  const expo = config.expo || config;
  const missing = [];
  if (!expo.name) missing.push('name');
  if (!expo.slug) missing.push('slug');
  if (!expo.version) missing.push('version');

  if (missing.length > 0) {
    return warn(`ERNE: app.json missing required fields: ${missing.join(', ')}`);
  } else {
    return pass('ERNE: Expo config valid');
  }
} catch {
  return pass();
}
