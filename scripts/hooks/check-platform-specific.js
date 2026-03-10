'use strict';
const fs = require('fs');
const { readStdin, getEditedFilePath, pass, warn, hasExtension } = require('./lib/hook-utils');

const CODE_EXTENSIONS = ['.js', '.jsx', '.ts', '.tsx'];
const input = readStdin();
const filePath = getEditedFilePath(input);

if (!filePath) return pass();
if (!hasExtension(filePath, CODE_EXTENSIONS)) return pass();

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const hasPlatformOS = /Platform\.OS\b/.test(content);
  if (!hasPlatformOS) return pass();

  const selectMatches = content.match(/Platform\.select\s*\(\s*\{([^}]+)\}/g);
  if (selectMatches) {
    for (const match of selectMatches) {
      const hasIos = /ios\s*:/.test(match);
      const hasAndroid = /android\s*:/.test(match);
      if (!hasIos || !hasAndroid) {
        warn('ERNE: Platform.select missing a platform case. Ensure both ios and android are handled.');
      }
    }
  }

  const hasIosRef = /['"]ios['"]/.test(content);
  const hasAndroidRef = /['"]android['"]/.test(content);

  if (hasPlatformOS && hasIosRef && !hasAndroidRef) {
    return warn('ERNE: Platform.OS checks for iOS but not Android');
  } else if (hasPlatformOS && hasAndroidRef && !hasIosRef) {
    return warn('ERNE: Platform.OS checks for Android but not iOS');
  }

  return pass();
} catch {
  return pass();
}
