'use strict';
const fs = require('fs');
const path = require('path');

const projectDir = process.env.ERNE_PROJECT_DIR || process.cwd();

function fileExists(relPath) {
  return fs.existsSync(path.join(projectDir, relPath));
}

function dirExists(relPath) {
  try {
    return fs.statSync(path.join(projectDir, relPath)).isDirectory();
  } catch {
    return false;
  }
}

function findFilesWithExt(dir, ext) {
  const fullDir = path.join(projectDir, dir);
  try {
    const entries = fs.readdirSync(fullDir, {
      withFileTypes: true,
      recursive: true,
    });
    return entries.some(
      e => e.isFile() && e.name.endsWith(ext)
    );
  } catch {
    return false;
  }
}

function readPackageJson() {
  const pkgPath = path.join(projectDir, 'package.json');
  try {
    return JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasExpoDependency(pkg) {
  if (!pkg) return false;
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  return 'expo' in deps;
}

// Detect layers
const layers = ['common'];
const pkg = readPackageJson();
const hasIosDir = dirExists('ios');
const hasAndroidDir = dirExists('android');

if (hasExpoDependency(pkg)) {
  layers.push('expo');
} else if (hasIosDir && hasAndroidDir) {
  layers.push('bare-rn');
}

if (hasIosDir && findFilesWithExt('ios', '.swift')) {
  layers.push('native-ios');
}

if (hasAndroidDir && findFilesWithExt('android', '.kt')) {
  layers.push('native-android');
}

const hasSignals = layers.length > 1;

console.log(`ERNE: Project layers: ${layers.join(', ')}`);

if (!hasSignals) {
  process.exit(2); // warn
} else {
  process.exit(0);
}
