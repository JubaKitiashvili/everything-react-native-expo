'use strict';
const fs = require('fs');
const path = require('path');
const { readStdin, getEditedFilePath, pass, warn } = require('./lib/hook-utils');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) return pass();

const NATIVE_EXTS = ['.swift', '.m', '.mm', '.h', '.kt', '.java', '.gradle'];
const ext = path.extname(filePath).toLowerCase();
if (!NATIVE_EXTS.includes(ext)) return pass();

const isIosFile = ['.swift', '.m', '.mm', '.h'].includes(ext) ||
  filePath.includes('/ios/') || filePath.includes('\\ios\\');
const isAndroidFile = ['.kt', '.java', '.gradle'].includes(ext) ||
  filePath.includes('/android/') || filePath.includes('\\android\\');

if (!isIosFile && !isAndroidFile) return pass();

const iosDir = path.join(projectDir, 'ios');
const androidDir = path.join(projectDir, 'android');
const hasIosDir = fs.existsSync(iosDir);
const hasAndroidDir = fs.existsSync(androidDir);

const warnings = [];

if (isIosFile && !hasAndroidDir) {
  warnings.push('Editing iOS native code but no android/ directory found — ensure cross-platform parity');
}

if (isAndroidFile && !hasIosDir) {
  warnings.push('Editing Android native code but no ios/ directory found — ensure cross-platform parity');
}

if (warnings.length > 0) {
  return warn(`ERNE: Native compatibility — ${warnings.length} concern(s):\n${warnings.map((w) => `  - ${w}`).join('\n')}`);
} else {
  return pass();
}
