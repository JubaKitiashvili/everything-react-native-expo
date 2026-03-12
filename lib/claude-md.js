// lib/claude-md.js — CLAUDE.md generation/merging for ERNE CLI
'use strict';

const fs = require('fs');
const path = require('path');

const ERNE_MARKER = '<!-- ERNE-GENERATED -->';

const FRAMEWORK_LABELS = {
  'expo-managed': 'React Native with Expo (managed)',
  'expo-bare': 'React Native with Expo (bare)',
  'bare-rn': 'React Native (bare)',
  'unknown': 'React Native',
};

const NAVIGATION_LABELS = {
  'expo-router': 'Expo Router (file-based)',
  'react-navigation': 'React Navigation',
  'none': 'None',
};

const STYLING_LABELS = {
  'stylesheet': 'StyleSheet.create',
  'nativewind': 'NativeWind (Tailwind)',
  'tamagui': 'Tamagui',
  'unistyles': 'Unistyles',
};

const LISTS_LABELS = {
  'flashlist': 'FlashList (@shopify/flash-list)',
  'flatlist': 'FlatList (built-in)',
};

const IMAGES_LABELS = {
  'expo-image': 'expo-image',
  'fast-image': 'FastImage',
  'rn-image': 'Image (built-in)',
};

const TESTING_LABELS = {
  'jest-rntl': 'Jest + React Native Testing Library',
  'jest-detox': 'Jest + Detox',
  'none': 'None configured',
};

const BUILD_LABELS = {
  'eas': 'EAS Build',
  'fastlane': 'Fastlane',
  'manual': 'Manual',
};

const STATE_LABELS = {
  'zustand': 'Zustand',
  'redux-toolkit': 'Redux Toolkit',
  'redux-saga': 'Redux Saga',
  'mobx': 'MobX',
  'none': 'None',
};

const SERVER_STATE_LABELS = {
  'tanstack-query': 'TanStack Query',
  'swr': 'SWR',
  'none': 'None',
};

const STORAGE_LABELS = {
  'expo-secure-store': 'expo-secure-store',
  'rn-keychain': 'react-native-keychain',
  'async-storage': 'AsyncStorage',
};

const AVAILABLE_COMMANDS = '/plan, /code-review, /tdd, /build-fix, /perf, /upgrade, /debug, /deploy,\n/component, /navigate, /animate, /quality-gate, /code, /feature, /learn, /retrospective, /setup-device';

/**
 * Read project name from package.json or fallback to directory basename.
 * @param {string} cwd
 * @returns {string}
 */
function getProjectName(cwd) {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
    if (pkg.name) return pkg.name;
  } catch { /* ignore */ }
  return path.basename(cwd);
}

/**
 * Format state label for display.
 * @param {string} state
 * @param {string} serverState
 * @returns {string}
 */
function formatStateLabel(state, serverState) {
  const stateLabel = formatLabel(state, STATE_LABELS);
  const serverLabel = formatLabel(serverState, SERVER_STATE_LABELS);

  if (state === 'none' && serverState === 'none') return 'None';
  if (state === 'none') return `${serverLabel} (server)`;
  if (serverState === 'none') return `${stateLabel} (client)`;
  return `${stateLabel} (client) + ${serverLabel} (server)`;
}

/**
 * Look up a human-readable label from a map.
 * @param {string} value
 * @param {Object<string,string>} map
 * @returns {string}
 */
function formatLabel(value, map) {
  return map[value] || value;
}

/**
 * Build an array of key rule strings based on the detected stack.
 * @param {object} detection
 * @returns {string[]}
 */
function generateKeyRules(detection) {
  const rules = [];

  // Component style rule
  if (detection.componentStyle === 'functional') {
    rules.push('Functional components only with `const` + arrow functions');
  } else if (detection.componentStyle === 'class') {
    rules.push('Class components with `extends Component`');
  } else {
    rules.push('Migrating to functional components — prefer `const` + arrow functions for new code');
  }

  rules.push('Named exports only (no default exports)');

  // State rule
  const { state, serverState } = detection.stack;
  if (state === 'zustand') {
    rules.push('Use Zustand stores for client state — keep stores small and focused');
  } else if (state === 'redux-toolkit') {
    rules.push('Use Redux Toolkit slices for client state — avoid legacy Redux patterns');
  } else if (state === 'mobx') {
    rules.push('Use MobX observables for client state — prefer `observer()` wrapper');
  }

  if (serverState === 'tanstack-query') {
    rules.push('Use TanStack Query for all server state — no manual fetch/cache');
  } else if (serverState === 'swr') {
    rules.push('Use SWR for all server state fetching');
  }

  // Navigation rule
  if (detection.stack.navigation === 'expo-router') {
    rules.push('Use Expo Router file-based routing — no manual navigation config');
  } else if (detection.stack.navigation === 'react-navigation') {
    rules.push('Use React Navigation for routing — keep navigator config co-located');
  }

  // Lists rule
  if (detection.stack.lists === 'flashlist') {
    rules.push('Use FlashList over FlatList for large lists (100+ items)');
  }

  // Storage rule
  if (detection.stack.storage === 'expo-secure-store') {
    rules.push('Use expo-secure-store for tokens — never use AsyncStorage for secrets');
  } else if (detection.stack.storage === 'rn-keychain') {
    rules.push('Use react-native-keychain for tokens — never use AsyncStorage for secrets');
  } else {
    rules.push('Use secure storage for tokens — avoid AsyncStorage for sensitive data');
  }

  rules.push('Conventional Commits: feat:, fix:, refactor:, test:, docs:, chore:');

  return rules;
}

/**
 * Generate a full CLAUDE.md (Scenario A / C).
 * @param {string} cwd
 * @param {object} detection
 * @param {string[]} ruleLayers
 * @returns {string}
 */
function generateFullClaudeMd(cwd, detection, ruleLayers, profile) {
  const projectName = getProjectName(cwd);
  const lang = detection.hasTypescript ? 'TypeScript' : 'JavaScript';
  const stack = detection.stack;

  const lines = [
    ERNE_MARKER,
  ];
  if (profile) {
    lines.push(`<!-- erne-profile: ${profile} -->`);
  }
  lines.push(
    `# ${projectName} — ERNE Configuration`,
    '',
    '## Project Stack',
    `- **Framework**: ${formatLabel(detection.framework, FRAMEWORK_LABELS)}`,
    `- **Language**: ${lang}`,
    `- **Navigation**: ${formatLabel(stack.navigation, NAVIGATION_LABELS)}`,
    `- **State**: ${formatStateLabel(stack.state, stack.serverState)}`,
    `- **Styling**: ${formatLabel(stack.styling, STYLING_LABELS)}`,
    `- **Lists**: ${formatLabel(stack.lists, LISTS_LABELS)}`,
    `- **Images**: ${formatLabel(stack.images, IMAGES_LABELS)}`,
    `- **Testing**: ${formatLabel(stack.testing, TESTING_LABELS)}`,
    `- **Build**: ${formatLabel(stack.build, BUILD_LABELS)}`,
    '',
    '## Key Rules',
  );

  for (const rule of generateKeyRules(detection)) {
    lines.push(`- ${rule}`);
  }

  lines.push(
    '',
    '## Available Commands',
    AVAILABLE_COMMANDS,
    '',
    '## Rules',
  );

  for (const layer of ruleLayers) {
    lines.push(`@import .claude/rules/${layer}/`);
  }

  lines.push(
    '',
    '## Skills',
    '@import .claude/skills/',
    '',
  );

  return lines.join('\n');
}

/**
 * Generate the append section for Scenario B.
 * @param {string[]} ruleLayers
 * @returns {string}
 */
function generateAppendSection(ruleLayers, profile) {
  const lines = [
    '',
    '---',
    '',
  ];
  if (profile) {
    lines.push(`<!-- erne-profile: ${profile} -->`);
  }
  lines.push(
    '# ERNE Configuration (auto-generated)',
    '',
    '## Rules',
  );

  for (const layer of ruleLayers) {
    lines.push(`@import .claude/rules/${layer}/`);
  }

  lines.push(
    '',
    '## Skills',
    '@import .claude/skills/',
    '',
    '## Available Commands',
    AVAILABLE_COMMANDS,
    '',
  );

  return lines.join('\n');
}

/**
 * Handle CLAUDE.md generation/merging with 3 scenarios.
 *
 * Scenario A: No existing CLAUDE.md → generate fresh with ERNE marker
 * Scenario B: Existing non-ERNE CLAUDE.md → backup + append
 * Scenario C: Existing ERNE-generated CLAUDE.md → regenerate (no backup)
 *
 * @param {string} cwd - Project root directory
 * @param {object} detection - Detection result from detectProject
 * @param {string} profile - Hook profile name
 * @param {string[]} ruleLayers - Array of rule layer names
 * @returns {'generated'|'appended'|'regenerated'}
 */
function handleClaudeMd(cwd, detection, profile, ruleLayers) {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  const backupPath = path.join(cwd, 'CLAUDE.md.pre-erne');

  // Check if CLAUDE.md exists
  let existingContent = null;
  try {
    existingContent = fs.readFileSync(claudeMdPath, 'utf8');
  } catch { /* does not exist */ }

  if (existingContent === null) {
    // Scenario A: No existing CLAUDE.md
    const content = generateFullClaudeMd(cwd, detection, ruleLayers, profile);
    fs.writeFileSync(claudeMdPath, content);
    return 'generated';
  }

  // Check if it's ERNE-generated
  if (existingContent.startsWith(ERNE_MARKER)) {
    // Scenario C: Re-install — regenerate fully, no backup
    const content = generateFullClaudeMd(cwd, detection, ruleLayers, profile);
    fs.writeFileSync(claudeMdPath, content);
    return 'regenerated';
  }

  // Check if ERNE section was already appended (double-run protection)
  if (existingContent.includes('# ERNE Configuration') || existingContent.includes('@import .claude/rules/')) {
    // Treat as regenerate: strip old ERNE section and re-append
    const erneSeparator = existingContent.indexOf('\n---\n\n# ERNE Configuration');
    if (erneSeparator !== -1) {
      const originalContent = existingContent.substring(0, erneSeparator);
      const appendSection = generateAppendSection(ruleLayers, profile);
      fs.writeFileSync(claudeMdPath, originalContent + appendSection);
      return 'regenerated';
    }
    // If we can't find the separator cleanly, regenerate fully
    const content = generateFullClaudeMd(cwd, detection, ruleLayers, profile);
    fs.writeFileSync(claudeMdPath, content);
    return 'regenerated';
  }

  // Scenario B: Existing non-ERNE CLAUDE.md — backup + append
  // Always back up current content before overwriting
  fs.writeFileSync(backupPath, existingContent);

  const appendSection = generateAppendSection(ruleLayers, profile);
  fs.writeFileSync(claudeMdPath, existingContent + appendSection);
  return 'appended';
}

module.exports = {
  handleClaudeMd,
  // Exported for testing
  getProjectName,
  formatStateLabel,
  formatLabel,
  generateKeyRules,
  ERNE_MARKER,
};
