'use strict';

// ─── Category → Package Mapping ───────────────────────────────────────────────

const CATEGORIES = {
  'state-management': [
    'zustand', 'jotai', '@reduxjs/toolkit', 'redux', 'mobx', 'mobx-state-tree',
    'recoil', 'valtio', 'xstate', 'legend-state',
  ],
  'navigation': [
    '@react-navigation/native', '@react-navigation/stack', '@react-navigation/bottom-tabs',
    '@react-navigation/drawer', 'expo-router', 'react-native-navigation',
  ],
  'animation': [
    'react-native-reanimated', 'react-native-animatable', 'moti',
    'react-native-lottie', 'lottie-react-native',
  ],
  'gestures': [
    'react-native-gesture-handler', 'react-native-pan-responder',
  ],
  'ui-kit': [
    '@gluestack-ui/themed', 'nativewind', 'tamagui', 'react-native-paper',
    'react-native-elements', '@rneui/themed', '@shopify/restyle',
  ],
  'lists': [
    '@shopify/flash-list', 'recyclerlistview',
  ],
  'images': [
    'react-native-fast-image', 'expo-image',
  ],
  'forms': [
    'react-hook-form', 'formik', 'yup', 'zod',
  ],
  'networking': [
    'axios', '@tanstack/react-query', 'swr', 'react-query',
    'apollo-client', '@apollo/client',
  ],
  'storage': [
    '@supabase/supabase-js', 'firebase', '@react-native-firebase/app',
    'realm', 'watermelondb', '@nozbe/watermelondb',
    'expo-secure-store', 'react-native-keychain', 'react-native-mmkv',
    'async-storage', '@react-native-async-storage/async-storage',
  ],
  'screens': [
    'react-native-screens',
  ],
  'camera': [
    'react-native-vision-camera', 'expo-camera',
  ],
  'icons': [
    'react-native-vector-icons', '@expo/vector-icons',
  ],
  'sheets': [
    '@gorhom/bottom-sheet', 'react-native-bottom-sheet',
  ],
  'core': [
    'expo', 'react-native',
  ],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Return the category name for a given package, or null if uncategorized.
 * @param {string} pkg
 * @returns {string|null}
 */
function getCategoryForPackage(pkg) {
  for (const [category, packages] of Object.entries(CATEGORIES)) {
    if (packages.includes(pkg)) return category;
  }
  return null;
}

/**
 * Return a Set of category names that appear in the user's dependency list.
 * @param {object} deps  e.g. { zustand: "5.0.0", axios: "1.0.0" }
 * @returns {Set<string>}
 */
function getUserCategories(deps) {
  const categories = new Set();
  for (const pkg of Object.keys(deps || {})) {
    const cat = getCategoryForPackage(pkg);
    if (cat) categories.add(cat);
  }
  return categories;
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

const SCORE_BASE          =  5;
const SCORE_DIRECT_DEP    = 50;
const SCORE_SAME_CATEGORY = 20;
const SCORE_SECURITY      = 30;

/**
 * Score and sort feed items by relevance to the user's stack.
 *
 * Scoring:
 *   +5   base (every item)
 *   +50  direct dependency match
 *   +20  same category as a used dependency
 *   +30  security tag (SEC)
 *
 * Sort: relevance DESC, then timestamp DESC (newest first on ties).
 *
 * @param {object[]} items  feed items (each has package, tag, timestamp)
 * @param {object}   stack  { dependencies: { [name]: version } }
 * @returns {object[]}      new array — items are cloned, originals untouched
 */
function analyzeRelevance(items, stack) {
  if (!items || items.length === 0) return [];

  const deps = (stack && stack.dependencies) || {};
  const userCategories = getUserCategories(deps);

  const scored = items.map((item) => {
    let score = SCORE_BASE;

    // Direct dependency
    if (Object.prototype.hasOwnProperty.call(deps, item.package)) {
      score += SCORE_DIRECT_DEP;
    }
    // Same category
    else {
      const cat = getCategoryForPackage(item.package);
      if (cat && userCategories.has(cat)) {
        score += SCORE_SAME_CATEGORY;
      }
    }

    // Security bonus
    if (item.tag === 'SEC') {
      score += SCORE_SECURITY;
    }

    return { ...item, relevance: score };
  });

  // Sort: relevance DESC, timestamp DESC
  scored.sort((a, b) => {
    if (b.relevance !== a.relevance) return b.relevance - a.relevance;
    const ta = a.timestamp ? new Date(a.timestamp).getTime() : 0;
    const tb = b.timestamp ? new Date(b.timestamp).getTime() : 0;
    return tb - ta;
  });

  return scored;
}

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  CATEGORIES,
  getCategoryForPackage,
  getUserCategories,
  analyzeRelevance,
};
