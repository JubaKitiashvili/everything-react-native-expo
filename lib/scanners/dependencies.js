// lib/scanners/dependencies.js — Dependency scanner for ERNE audit
'use strict';

const fs = require('fs');
const path = require('path');

const CATEGORY_MAP = {
  framework: new Set([
    'expo', 'react-native', 'react', 'react-dom',
  ]),
  navigation: new Set([
    'expo-router', '@react-navigation/native', '@react-navigation/stack',
    '@react-navigation/bottom-tabs', '@react-navigation/drawer',
    '@react-navigation/native-stack', '@react-navigation/material-top-tabs',
  ]),
  state: new Set([
    'zustand', '@reduxjs/toolkit', 'redux', 'react-redux', 'mobx', 'mobx-react',
    'mobx-react-lite', '@tanstack/react-query', 'jotai', 'recoil', 'valtio',
    'effector', 'xstate', '@xstate/react',
  ]),
  styling: new Set([
    'nativewind', 'tamagui', 'styled-components', 'react-native-paper',
    '@shopify/restyle', 'react-native-elements', 'react-native-ui-lib',
    'gluestack-ui', '@gluestack-ui/themed',
  ]),
  testing: new Set([
    'jest', '@testing-library/react-native', 'detox', 'maestro',
    '@testing-library/jest-native', 'react-test-renderer',
  ]),
  nativeModules: new Set([
    'react-native-reanimated', 'react-native-gesture-handler',
    'react-native-screens', 'react-native-safe-area-context',
    'react-native-svg', 'react-native-maps', 'react-native-camera',
    'react-native-vision-camera', 'react-native-webview',
    'react-native-video', 'react-native-fs', 'react-native-device-info',
    'react-native-fast-image', 'react-native-image-picker',
    'react-native-permissions', 'react-native-mmkv',
    'react-native-skia', '@shopify/react-native-skia',
    'expo-camera', 'expo-location', 'expo-notifications',
    'expo-file-system', 'expo-image-picker', 'expo-sensors',
    'expo-av', 'expo-haptics', 'expo-local-authentication',
    'expo-secure-store', 'expo-image',
  ]),
};

/**
 * Categorize a single package name.
 * @param {string} name
 * @returns {string} category key
 */
function categorize(name) {
  for (const [cat, pkgs] of Object.entries(CATEGORY_MAP)) {
    if (pkgs.has(name)) return cat;
    // Check prefix patterns like @react-navigation/*
    if (cat === 'navigation' && name.startsWith('@react-navigation/')) return cat;
  }
  return 'utilities';
}

/**
 * Scan project dependencies from package.json.
 * @param {string} cwd - Project root
 * @returns {{ all: object, categorized: object, devDeps: string[], totalCount: number } | null}
 */
function scanDependencies(cwd) {
  const pkgPath = path.join(path.resolve(cwd), 'package.json');
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  } catch {
    return null;
  }

  const deps = pkg.dependencies || {};
  const devDeps = pkg.devDependencies || {};
  const all = { ...deps, ...devDeps };

  const categorized = {
    framework: {},
    navigation: {},
    state: {},
    styling: {},
    testing: {},
    nativeModules: {},
    utilities: {},
  };

  for (const [name, version] of Object.entries(all)) {
    const cat = categorize(name);
    categorized[cat][name] = version;
  }

  return {
    all,
    categorized,
    devDeps: Object.keys(devDeps),
    totalCount: Object.keys(all).length,
  };
}

module.exports = scanDependencies;
