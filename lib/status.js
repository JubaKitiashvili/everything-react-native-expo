// lib/status.js — Show current ERNE configuration
'use strict';

const fs = require('fs');
const path = require('path');
const { detectProject } = require('./detect');

const labels = {
  state: { zustand: 'zustand', 'redux-toolkit': 'redux-toolkit', 'redux-saga': 'redux-saga', mobx: 'mobx', none: 'none' },
  serverState: { 'tanstack-query': 'tanstack-query', swr: 'swr', none: '' },
  navigation: { 'expo-router': 'expo-router', 'react-navigation': 'react-navigation', none: 'none' },
  styling: { stylesheet: 'stylesheet', nativewind: 'nativewind', tamagui: 'tamagui', unistyles: 'unistyles' },
};

const KNOWN_VARIANTS = [
  'architect',
  'ui-designer',
  'senior-developer',
  'feature-builder',
  'code-reviewer',
  'tdd-guide',
  'expo-config-resolver',
  'native-bridge-builder',
  'upgrade-assistant',
  'performance-profiler',
  'pipeline-orchestrator',
  'visual-debugger',
  'continuous-learning',
];

/**
 * Show ERNE status: detected stack, profile, active variants.
 */
async function status() {
  const cwd = process.cwd();
  const erneRoot = path.resolve(__dirname, '..');

  // Get ERNE version
  let version = 'unknown';
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(erneRoot, 'package.json'), 'utf8'));
    version = pkg.version;
  } catch { /* ignore */ }

  console.log(`\n  ERNE Status — v${version}\n`);

  // Stack detection
  const detection = detectProject(cwd);
  const s = detection.stack;
  const lbl = (map, key) => map[key] || key;

  let stateDisplay = lbl(labels.state, s.state);
  const serverLabel = lbl(labels.serverState, s.serverState);
  if (serverLabel) stateDisplay += ` + ${serverLabel}`;

  console.log('  Stack Detection:');
  console.log(`    Framework:    ${detection.framework}`);
  console.log(`    Navigation:   ${lbl(labels.navigation, s.navigation)}`);
  console.log(`    State:        ${stateDisplay}`);
  console.log(`    Styling:      ${lbl(labels.styling, s.styling)}`);
  console.log(`    TypeScript:   ${detection.hasTypescript ? 'yes' : 'no'}`);
  console.log(`    New Arch:     ${detection.hasNewArch ? 'yes' : 'no'}`);

  // Hook profile
  console.log();
  const profileInfo = getProfileInfo(cwd, erneRoot);
  console.log(`  Hook Profile: ${profileInfo}`);

  // Active variants
  console.log();
  const variants = getActiveVariants(cwd);
  if (variants.length > 0) {
    console.log('  Active Variants:');
    for (const v of variants) {
      const suffix = v.variant ? ` → ${v.variant}` : '';
      console.log(`    ${v.name.padEnd(14)}${suffix}`);
    }
  } else {
    console.log('  Active Variants: none');
  }
  console.log();
}

function getProfileInfo(cwd, erneRoot) {
  let profile = process.env.ERNE_PROFILE || null;

  // Check CLAUDE.md for profile comment
  if (!profile) {
    const claudeMdPath = path.join(cwd, 'CLAUDE.md');
    if (fs.existsSync(claudeMdPath)) {
      try {
        const content = fs.readFileSync(claudeMdPath, 'utf8');
        const match = content.match(/<!--\s*erne-profile:\s*(\w+)\s*-->/);
        if (match) profile = match[1];
      } catch { /* ignore */ }
    }
  }

  if (!profile) return 'not set';

  // Count hooks for profile
  const hooksPath = path.join(erneRoot, 'hooks', 'hooks.json');
  if (!fs.existsSync(hooksPath)) return profile;

  try {
    const data = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    const hooks = data.hooks || [];
    const total = hooks.length;
    const active = hooks.filter(h => h.profiles && h.profiles.includes(profile)).length;
    return `${profile} (${active}/${total} hooks active)`;
  } catch {
    return profile;
  }
}

function getActiveVariants(cwd) {
  const claudeDir = path.join(cwd, '.claude');
  if (!fs.existsSync(claudeDir)) return [];

  const variants = [];

  // Check agents directory for variant files
  const agentsDir = path.join(claudeDir, 'agents');
  const rulesDir = path.join(claudeDir, 'rules');

  for (const name of KNOWN_VARIANTS) {
    const found = findVariantInfo(name, agentsDir, rulesDir);
    if (found) {
      variants.push(found);
    }
  }

  // Also scan for any agent .md files not in known list
  if (fs.existsSync(agentsDir)) {
    try {
      const files = fs.readdirSync(agentsDir);
      for (const file of files) {
        if (!file.endsWith('.md')) continue;
        const baseName = file.replace(/\.md$/, '');
        if (KNOWN_VARIANTS.includes(baseName)) continue;
        variants.push({ name: baseName, variant: detectVariantFromFile(path.join(agentsDir, file)) });
      }
    } catch { /* ignore */ }
  }

  return variants;
}

function findVariantInfo(name, agentsDir, rulesDir) {
  // Check agent file
  const agentFile = path.join(agentsDir, `${name}.md`);
  if (fs.existsSync(agentFile)) {
    return { name, variant: detectVariantFromFile(agentFile) };
  }

  // Check rule file
  const ruleFile = path.join(rulesDir, `${name}.md`);
  if (fs.existsSync(ruleFile)) {
    return { name, variant: detectVariantFromFile(ruleFile) };
  }

  return null;
}

function detectVariantFromFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    // Look for variant marker comment: <!-- variant: xyz -->
    const match = content.match(/<!--\s*variant:\s*(.+?)\s*-->/);
    if (match) return match[1].trim();

    // Infer from content keywords
    if (content.includes('nativewind') || content.includes('NativeWind')) return 'nativewind';
    if (content.includes('zustand') || content.includes('Zustand')) return 'zustand';
    if (content.includes('expo-router') || content.includes('Expo Router')) return 'expo-router';
    if (content.includes('redux-toolkit') || content.includes('Redux Toolkit')) return 'redux-toolkit';
    if (content.includes('tamagui') || content.includes('Tamagui')) return 'tamagui';
    if (content.includes('modern-expo') || content.includes('expo-managed')) return 'modern-expo';
  } catch { /* ignore */ }
  return null;
}

module.exports = status;
