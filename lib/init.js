// lib/init.js — Interactive project initializer (orchestrator)
// Implements the 4-step install flow from spec Section 6
//
// Non-interactive usage (for CI / Claude Code):
//   npx erne-universal init --profile standard --mcp agent-device,github --yes
//   npx erne-universal init --profile minimal --no-mcp --yes
//   npx erne-universal init --yes  (accepts all defaults)

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const { detectProject } = require('./detect');
const { generateConfig, determineRuleLayers } = require('./generate');
const { handleClaudeMd } = require('./claude-md');

// ─── ANSI helpers ────────────────────────────────────────────────────────────

const c = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
};

const ok = `${c.green}\u2713${c.reset}`;
const fail = `${c.red}\u2717${c.reset}`;
const warn = `${c.yellow}\u26A0${c.reset}`;
const info = `${c.cyan}\u2139${c.reset}`;

// ─── Label maps for detection report ─────────────────────────────────────────

const labels = {
  state: { zustand: 'Zustand', 'redux-toolkit': 'Redux Toolkit', 'redux-saga': 'Redux + Saga', mobx: 'MobX', none: 'None' },
  serverState: { 'tanstack-query': 'TanStack Query', swr: 'SWR', none: '' },
  navigation: { 'expo-router': 'Expo Router', 'react-navigation': 'React Navigation', none: 'None' },
  styling: { stylesheet: 'StyleSheet.create', nativewind: 'NativeWind', tamagui: 'Tamagui', unistyles: 'Unistyles' },
  lists: { flashlist: 'FlashList', flatlist: 'FlatList' },
  images: { 'expo-image': 'expo-image', 'fast-image': 'react-native-fast-image', 'rn-image': 'React Native Image' },
  forms: { 'react-hook-form': 'React Hook Form', formik: 'Formik', 'redux-form': 'Redux Form', none: 'None' },
  storage: { 'expo-secure-store': 'expo-secure-store', 'rn-keychain': 'react-native-keychain', 'async-storage': 'AsyncStorage' },
  testing: { 'jest-rntl': 'Jest + RNTL', 'jest-detox': 'Jest + Detox', none: 'Not configured' },
  build: { eas: 'EAS Build', fastlane: 'Fastlane', manual: 'Manual' },
};

const frameworkLabels = {
  'expo-managed': 'Expo (managed)',
  'expo-bare': 'Expo (bare)',
  'bare-rn': 'React Native (bare)',
  'unknown': 'Unknown',
};

// ─── parseArgs ───────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(3); // skip node, cli.js, init
  const opts = { profile: null, mcp: null, yes: false, noMcp: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--profile':
      case '-p':
        opts.profile = args[++i];
        break;
      case '--mcp':
      case '-m':
        opts.mcp = args[++i] ? args[i].split(',').map(s => s.trim()).filter(Boolean) : [];
        break;
      case '--no-mcp':
        opts.noMcp = true;
        break;
      case '--yes':
      case '-y':
        opts.yes = true;
        break;
    }
  }

  // Validate --profile value
  const validProfileValues = ['minimal', 'standard', 'strict'];
  if (opts.profile && !validProfileValues.includes(opts.profile)) {
    console.error(`Invalid profile: "${opts.profile}". Valid profiles: ${validProfileValues.join(', ')}`);
    process.exit(1);
  }

  // Validate --mcp values
  const validMcpKeys = ['agent-device', 'github', 'supabase', 'firebase', 'figma', 'sentry'];
  if (opts.mcp !== null && Array.isArray(opts.mcp)) {
    const invalid = opts.mcp.filter(k => !validMcpKeys.includes(k));
    if (invalid.length > 0) {
      console.error(`Invalid MCP server(s): ${invalid.join(', ')}. Valid options: ${validMcpKeys.join(', ')}`);
      process.exit(1);
    }
  }

  return opts;
}

// ─── Detection report ────────────────────────────────────────────────────────

function printDetectionReport(detection) {
  const s = detection.stack;
  const lbl = (map, key) => (key in map ? map[key] : key);

  // Build state display: combine client + server state
  let stateDisplay = lbl(labels.state, s.state);
  const serverLabel = lbl(labels.serverState, s.serverState);
  if (serverLabel) stateDisplay += ` + ${serverLabel}`;

  const rows = [
    ['Framework',   frameworkLabels[detection.framework] || detection.framework],
    ['State',       stateDisplay],
    ['Navigation',  lbl(labels.navigation, s.navigation)],
    ['Styling',     lbl(labels.styling, s.styling)],
    ['Lists',       lbl(labels.lists, s.lists)],
    ['Images',      lbl(labels.images, s.images)],
    ['Testing',     lbl(labels.testing, s.testing)],
    ['TypeScript',  detection.hasTypescript ? 'Yes' : 'No'],
    ['New Arch',    detection.hasNewArch ? 'Yes' : 'No'],
  ];

  console.log();
  for (const [label, value] of rows) {
    console.log(`    ${c.dim}${label.padEnd(14)}${c.reset}${c.cyan}${value}${c.reset}`);
  }
}

// ─── Count generated files ───────────────────────────────────────────────────

function countFiles(claudeDir) {
  let agentCount = 0;
  let skillCount = 0;

  try {
    const agentsDir = path.join(claudeDir, 'agents');
    if (fs.existsSync(agentsDir)) {
      agentCount = fs.readdirSync(agentsDir).filter(f => f.endsWith('.md')).length;
    }
  } catch { /* skip */ }

  try {
    const skillsDir = path.join(claudeDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      skillCount = fs.readdirSync(skillsDir).filter(f => {
        try { return fs.statSync(path.join(skillsDir, f)).isDirectory(); } catch { return false; }
      }).length;
    }
  } catch { /* skip */ }

  return { agentCount, skillCount };
}

// ─── Main init flow ──────────────────────────────────────────────────────────

module.exports = async function init() {
  const opts = parseArgs();
  const nonInteractive = opts.yes || opts.profile || opts.mcp !== null || opts.noMcp;

  let rl;
  if (!nonInteractive) {
    rl = readline.createInterface({ input: stdin, output: stdout });
  }

  const cwd = process.cwd();

  try {
    console.log(`\n  ${c.bold}erne${c.reset} ${c.dim}\u2014 Setting up AI agent harness for React Native & Expo${c.reset}\n`);

    // ─── Step 1: Detect project type ───
    console.log(`  ${c.bold}Step 1:${c.reset} Deep-scanning project...`);
    const detection = detectProject(cwd);
    printDetectionReport(detection);

    if (!detection.isRNProject) {
      if (nonInteractive) {
        console.log(`\n  ${warn} No React Native project detected \u2014 continuing (non-interactive mode).`);
      } else {
        console.log(`\n  ${warn} No React Native project detected in current directory.`);
        const proceed = await rl.question('  Continue anyway? (y/N) ');
        if (proceed.toLowerCase() !== 'y') {
          console.log('  Aborted.');
          return;
        }
      }
    }

    // ─── Step 2: Choose hook profile ───
    let profile;
    const validProfiles = ['minimal', 'standard', 'strict'];

    if (opts.profile && validProfiles.includes(opts.profile)) {
      profile = opts.profile;
      console.log(`\n  ${c.bold}Step 2:${c.reset} Hook profile \u2192 ${c.cyan}${profile}${c.reset}`);
    } else if (nonInteractive) {
      profile = 'standard';
      console.log(`\n  ${c.bold}Step 2:${c.reset} Hook profile \u2192 ${c.cyan}standard${c.reset}`);
    } else {
      console.log(`\n  ${c.bold}Step 2:${c.reset} Select hook profile:\n`);
      console.log('    (a) minimal  \u2014 fast iteration, minimal checks');
      console.log('    (b) standard \u2014 balanced quality + speed [recommended]');
      console.log('    (c) strict   \u2014 production-grade enforcement');
      console.log();

      let profileChoice = await rl.question('  Profile (a/b/c) [b]: ');
      profileChoice = profileChoice.toLowerCase() || 'b';
      const profileMap = { a: 'minimal', b: 'standard', c: 'strict' };
      profile = profileMap[profileChoice] || 'standard';
    }

    // ─── Step 3: Select MCP integrations ───
    const mcpSelections = {};
    const allMcpKeys = ['agent-device', 'github', 'supabase', 'firebase', 'figma', 'sentry'];
    const defaultMcpKeys = ['agent-device', 'github'];

    if (opts.noMcp) {
      console.log(`\n  ${c.bold}Step 3:${c.reset} MCP servers \u2192 ${c.dim}none${c.reset}`);
      for (const key of allMcpKeys) mcpSelections[key] = false;
    } else if (opts.mcp !== null) {
      const mcpDisplay = opts.mcp.length > 0 ? opts.mcp.join(', ') : 'none';
      console.log(`\n  ${c.bold}Step 3:${c.reset} MCP servers \u2192 ${c.cyan}${mcpDisplay}${c.reset}`);
      for (const key of allMcpKeys) mcpSelections[key] = opts.mcp.includes(key);
    } else if (opts.yes) {
      console.log(`\n  ${c.bold}Step 3:${c.reset} MCP servers \u2192 ${c.cyan}${defaultMcpKeys.join(', ')}${c.reset}`);
      for (const key of allMcpKeys) mcpSelections[key] = defaultMcpKeys.includes(key);
    } else {
      console.log(`\n  ${c.bold}Step 3:${c.reset} MCP server integrations:\n`);

      // Recommended servers
      console.log('  Recommended:');
      const agentDevice = await rl.question('    [Y/n] agent-device \u2014 Control iOS Simulator & Android Emulator: ');
      mcpSelections['agent-device'] = agentDevice.toLowerCase() !== 'n';

      const github = await rl.question('    [Y/n] GitHub \u2014 PR management, issue tracking: ');
      mcpSelections['github'] = github.toLowerCase() !== 'n';

      // Optional servers
      console.log('\n  Optional (press Enter to skip):');
      const optionalServers = [
        { key: 'supabase', label: 'Supabase \u2014 Database & auth' },
        { key: 'firebase', label: 'Firebase \u2014 Analytics & push' },
        { key: 'figma', label: 'Figma \u2014 Design token sync' },
        { key: 'sentry', label: 'Sentry \u2014 Error tracking' },
      ];

      for (const server of optionalServers) {
        const answer = await rl.question(`    [y/N] ${server.label}: `);
        mcpSelections[server.key] = answer.toLowerCase() === 'y';
      }
    }

    // ─── Step 4: Generate config ───
    console.log();

    const erneRoot = path.resolve(__dirname, '..');
    const claudeDir = path.join(cwd, '.claude');

    // Convert mcpSelections object to array of enabled keys
    const enabledMcp = Object.entries(mcpSelections)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const { ruleLayers, mcpCount } = generateConfig(erneRoot, claudeDir, detection, profile, enabledMcp);

    // Handle CLAUDE.md
    const claudeMdResult = handleClaudeMd(cwd, detection, profile, ruleLayers);

    // Count what was generated
    const { agentCount, skillCount } = countFiles(claudeDir);

    // ─── Summary ───
    console.log(`  ${ok} ${c.bold}${agentCount}${c.reset} agents matched to your stack`);
    console.log(`  ${ok} ${c.bold}${skillCount}${c.reset} skills installed`);
    console.log(`  ${ok} .claude/ configured \u2014 agents, skills, rules, hooks`);
    if (mcpCount > 0) {
      console.log(`  ${ok} .mcp.json \u2014 ${c.bold}${mcpCount}${c.reset} MCP servers configured`);
    }

    const claudeMdMessages = {
      appended: 'CLAUDE.md updated (original backed up)',
      regenerated: 'CLAUDE.md regenerated for detected stack',
      generated: 'CLAUDE.md generated',
    };
    console.log(`  ${ok} ${claudeMdMessages[claudeMdResult]}`);

    // ─── Step 5: Project Audit ───
    console.log();
    try {
      const { runAudit } = require('./audit');
      const { score, findings, strengths } = runAudit(cwd);
      const critical = findings.filter(f => f.severity === 'critical');
      const warnings = findings.filter(f => f.severity === 'warning');
      const scoreColor = score >= 80 ? c.green : score >= 60 ? c.yellow : c.red;
      console.log(`  Audit score: ${scoreColor}${c.bold}${score}/100${c.reset} (${strengths.length} strengths, ${critical.length} critical, ${warnings.length} warnings)`);
      if (critical.length > 0) {
        for (const f of critical) {
          console.log(`  ${fail} ${f.title} \u2014 Fix: ${f.fix}`);
        }
      }
    } catch (err) {
      console.log(`  ${warn} Audit skipped: ${err.message}`);
    }

    // ─── Footer ───
    console.log();
    console.log(`  ${info} Dashboard: run ${c.cyan}npx erne-universal dashboard${c.reset} to launch`);
    console.log();
    console.log(`  ${c.green}Done!${c.reset} Use /erne- commands (e.g. /erne-plan, /erne-perf, /erne-doctor)`);
    console.log(`  Restart Claude Code session to activate MCP servers and hooks.`);
    console.log();
  } finally {
    if (rl) rl.close();
  }
};
