#!/usr/bin/env node
/**
 * expo-modules-autolinking smoke check.
 *
 * A consumer who runs `npx expo install @erne/monitor` followed by
 * `npx expo prebuild` should get the native module wired up with zero
 * manual edits. This script simulates what expo-modules-autolinking
 * looks at, catching regressions before a real consumer hits them.
 *
 * Validates:
 *   1. `expo-module.config.json` declares both platforms + a module
 *      class per platform.
 *   2. iOS `ErneMonitor.podspec` exists, references the matching
 *      Swift module name, declares ExpoModulesCore dependency, and
 *      bundles PrivacyInfo.xcprivacy.
 *   3. Android `build.gradle.kts` exists with the correct namespace,
 *      applies the ExpoModulesCorePlugin, and declares a compileSdk
 *      ≥ our minimum target.
 *   4. Android module class (`ErneMonitorModule.kt`) exists at the
 *      package path declared in expo-module.config.json.
 *   5. iOS module class (`ErneMonitorModule.swift`) exists with
 *      matching class name.
 *
 * Usage:
 *   node scripts/verify-autolink.js
 *
 * Exit codes:
 *   0  — every check passed
 *   1  — one or more checks failed
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PACKAGE_ROOT = path.resolve(__dirname, '..');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function checkExpoModuleConfig() {
  const problems = [];
  const configPath = path.join(PACKAGE_ROOT, 'expo-module.config.json');
  if (!fs.existsSync(configPath)) {
    problems.push('expo-module.config.json missing');
    return { problems, config: null };
  }
  const config = readJson(configPath);
  if (!Array.isArray(config.platforms) || config.platforms.length === 0) {
    problems.push('expo-module.config.json has no platforms');
  }
  if (!config.platforms?.includes('ios')) {
    problems.push('expo-module.config.json missing ios platform');
  }
  if (!config.platforms?.includes('android')) {
    problems.push('expo-module.config.json missing android platform');
  }
  if (!Array.isArray(config.ios?.modules) || config.ios.modules.length === 0) {
    problems.push('expo-module.config.json missing ios.modules entry');
  }
  if (!Array.isArray(config.android?.modules) || config.android.modules.length === 0) {
    problems.push('expo-module.config.json missing android.modules entry');
  }
  return { problems, config };
}

function checkIOS(iosModuleName) {
  const problems = [];
  const podspec = path.join(PACKAGE_ROOT, 'ios', 'ErneMonitor.podspec');
  if (!fs.existsSync(podspec)) {
    problems.push('ios/ErneMonitor.podspec missing');
  } else {
    const src = fs.readFileSync(podspec, 'utf8');
    if (!/s\.name\s*=\s*'ErneMonitor'/.test(src)) {
      problems.push('Podspec name is not ErneMonitor');
    }
    if (!/s\.dependency\s+'ExpoModulesCore'/.test(src)) {
      problems.push('Podspec missing ExpoModulesCore dependency');
    }
    if (!/PrivacyInfo\.xcprivacy/.test(src)) {
      problems.push('Podspec does not ship PrivacyInfo.xcprivacy');
    }
  }
  if (iosModuleName) {
    const moduleFile = path.join(PACKAGE_ROOT, 'ios', `${iosModuleName}.swift`);
    if (!fs.existsSync(moduleFile)) {
      problems.push(`iOS module ${iosModuleName}.swift missing`);
    } else {
      const src = fs.readFileSync(moduleFile, 'utf8');
      if (!new RegExp(`class\\s+${iosModuleName}\\s*:\\s*Module`).test(src)) {
        problems.push(
          `iOS module ${iosModuleName}.swift does not declare 'class ${iosModuleName}: Module'`,
        );
      }
    }
  }
  return problems;
}

function checkAndroid(androidModulePath) {
  const problems = [];
  const gradle = path.join(PACKAGE_ROOT, 'android', 'build.gradle.kts');
  if (!fs.existsSync(gradle)) {
    problems.push('android/build.gradle.kts missing');
  } else {
    const src = fs.readFileSync(gradle, 'utf8');
    if (!/namespace\s*=\s*"expo\.modules\.ernemonitor"/.test(src)) {
      problems.push('build.gradle.kts namespace is not expo.modules.ernemonitor');
    }
    if (!/ExpoModulesCorePlugin\.gradle/.test(src)) {
      problems.push('build.gradle.kts does not apply ExpoModulesCorePlugin.gradle');
    }
    if (!/compileSdk\s*=\s*3[5-9]/.test(src)) {
      problems.push('build.gradle.kts compileSdk missing or below 35');
    }
  }

  const manifest = path.join(PACKAGE_ROOT, 'android', 'src', 'main', 'AndroidManifest.xml');
  if (!fs.existsSync(manifest)) {
    problems.push('AndroidManifest.xml missing');
  }

  if (androidModulePath) {
    // e.g. 'expo.modules.ernemonitor.ErneMonitorModule'
    const parts = androidModulePath.split('.');
    const className = parts[parts.length - 1];
    const packagePath = parts.slice(0, -1).join('/');
    const kt = path.join(
      PACKAGE_ROOT,
      'android',
      'src',
      'main',
      'java',
      packagePath,
      `${className}.kt`,
    );
    if (!fs.existsSync(kt)) {
      problems.push(`Android module ${className}.kt missing at ${packagePath}/`);
    } else {
      const src = fs.readFileSync(kt, 'utf8');
      if (!new RegExp(`class\\s+${className}\\s*:\\s*Module`).test(src)) {
        problems.push(
          `Android module ${className}.kt does not declare 'class ${className} : Module'`,
        );
      }
    }
  }
  return problems;
}

function run() {
  const { problems: configProblems, config } = checkExpoModuleConfig();
  const iosProblems = checkIOS(config?.ios?.modules?.[0]);
  const androidProblems = checkAndroid(config?.android?.modules?.[0]);
  const all = [
    ...configProblems.map((m) => ({ area: 'config', message: m })),
    ...iosProblems.map((m) => ({ area: 'ios', message: m })),
    ...androidProblems.map((m) => ({ area: 'android', message: m })),
  ];
  return { problems: all, config };
}

function main() {
  const { problems } = run();
  if (problems.length === 0) {
    console.log('[@erne/monitor] Autolink configuration OK.');
    process.exit(0);
  }
  for (const p of problems) {
    console.error(`  ${p.area.padEnd(8)} — ${p.message}`);
  }
  console.error(`\n[@erne/monitor] ${problems.length} autolink problem(s).`);
  process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = { run, checkExpoModuleConfig, checkIOS, checkAndroid };
