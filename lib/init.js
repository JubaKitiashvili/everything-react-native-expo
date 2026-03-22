// lib/init.js — Interactive project initializer (orchestrator)
// Implements the 4-step install flow from spec Section 6
//
// Non-interactive usage (for CI / Claude Code):
//   npx erne-universal init --profile standard --mcp agent-device,github --yes
//   npx erne-universal init --profile minimal --no-mcp --yes
//   npx erne-universal init --yes  (accepts all defaults)

'use strict';

const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

const { detectProject } = require('./detect');
const { generateConfig, determineRuleLayers } = require('./generate');
const { handleClaudeMd } = require('./claude-md');

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
  const lbl = (map, key) => map[key] || key;

  // Build state display: combine client + server state
  let stateDisplay = lbl(labels.state, s.state);
  const serverLabel = lbl(labels.serverState, s.serverState);
  if (serverLabel) stateDisplay += ` + ${serverLabel}`;

  const claudeMdStatus = detection.existingClaudeMd
    ? 'Exists (will append, backup to CLAUDE.md.pre-erne)'
    : 'Will generate';

  const rows = [
    ['Framework',   `${frameworkLabels[detection.framework] || detection.framework}`],
    ['State',       stateDisplay],
    ['Navigation',  lbl(labels.navigation, s.navigation)],
    ['Styling',     lbl(labels.styling, s.styling)],
    ['Lists',       lbl(labels.lists, s.lists)],
    ['Images',      lbl(labels.images, s.images)],
    ['Forms',       lbl(labels.forms, s.forms)],
    ['Storage',     lbl(labels.storage, s.storage)],
    ['Testing',     lbl(labels.testing, s.testing)],
    ['Build',       lbl(labels.build, s.build)],
    ['TypeScript',  detection.hasTypescript ? 'Yes' : 'No'],
    ['New Arch',    detection.hasNewArch ? 'Yes' : 'No'],
    ['Monorepo',    detection.hasMonorepo ? 'Yes' : 'No'],
    ['Components',  detection.componentStyle === 'functional' ? 'Functional' : detection.componentStyle === 'class' ? 'Class' : 'Mixed'],
    ['CLAUDE.md',   claudeMdStatus],
  ];

  console.log();
  for (const [label, value] of rows) {
    console.log(`    ${label.padEnd(13)}${value}`);
  }
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
    console.log('\n  erne — Setting up AI agent harness for React Native & Expo\n');

    // ─── Step 1: Detect project type ───
    console.log('  Scanning project...');
    const detection = detectProject(cwd);
    printDetectionReport(detection);

    if (!detection.isRNProject) {
      if (nonInteractive) {
        console.log('\n  ⚠ No React Native project detected — continuing (non-interactive mode).');
      } else {
        console.log('\n  ⚠ No React Native project detected in current directory.');
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
      console.log(`\n  Step 2: Hook profile: ${profile} (from --profile flag)`);
    } else if (nonInteractive) {
      profile = 'standard';
      console.log('\n  Step 2: Hook profile: standard (default)');
    } else {
      console.log('\n  Step 2: Select hook profile:\n');
      console.log('    (a) minimal  — fast iteration, minimal checks');
      console.log('    (b) standard — balanced quality + speed [recommended]');
      console.log('    (c) strict   — production-grade enforcement');
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
      console.log('\n  Step 3: MCP servers: none (--no-mcp)');
      for (const key of allMcpKeys) mcpSelections[key] = false;
    } else if (opts.mcp !== null) {
      console.log(`\n  Step 3: MCP servers: ${opts.mcp.join(', ') || 'none'} (from --mcp flag)`);
      for (const key of allMcpKeys) mcpSelections[key] = opts.mcp.includes(key);
    } else if (opts.yes) {
      console.log(`\n  Step 3: MCP servers: ${defaultMcpKeys.join(', ')} (defaults)`);
      for (const key of allMcpKeys) mcpSelections[key] = defaultMcpKeys.includes(key);
    } else {
      console.log('\n  Step 3: MCP server integrations:\n');

      // Recommended servers
      console.log('  Recommended:');
      const agentDevice = await rl.question('    [Y/n] agent-device — Control iOS Simulator & Android Emulator: ');
      mcpSelections['agent-device'] = agentDevice.toLowerCase() !== 'n';

      const github = await rl.question('    [Y/n] GitHub — PR management, issue tracking: ');
      mcpSelections['github'] = github.toLowerCase() !== 'n';

      // Optional servers
      console.log('\n  Optional (press Enter to skip):');
      const optionalServers = [
        { key: 'supabase', label: 'Supabase — Database & auth' },
        { key: 'firebase', label: 'Firebase — Analytics & push' },
        { key: 'figma', label: 'Figma — Design token sync' },
        { key: 'sentry', label: 'Sentry — Error tracking' },
      ];

      for (const server of optionalServers) {
        const answer = await rl.question(`    [y/N] ${server.label}: `);
        mcpSelections[server.key] = answer.toLowerCase() === 'y';
      }
    }

    // ─── Step 4: Generate config ───
    console.log('\n  Step 4: Generating configuration...\n');

    const erneRoot = path.resolve(__dirname, '..');
    const claudeDir = path.join(cwd, '.claude');

    // Convert mcpSelections object to array of enabled keys
    const enabledMcp = Object.entries(mcpSelections)
      .filter(([, enabled]) => enabled)
      .map(([key]) => key);

    const { ruleLayers, mcpCount } = generateConfig(erneRoot, claudeDir, detection, profile, enabledMcp);

    // Print what was generated
    console.log(`    ✓ .claude/ (agents, commands, rules, skills, contexts, hooks)`);
    console.log(`    ✓ .claude/rules/ (layers: ${ruleLayers.join(', ')})`);
    console.log(`    ✓ .claude/hooks.json (${profile} profile)`);
    console.log(`    ✓ .claude/mcp/ (${mcpCount} servers)`);
    console.log('    ✓ .claude/settings.json');

    // Handle CLAUDE.md
    const claudeMdResult = handleClaudeMd(cwd, detection, profile, ruleLayers);

    const claudeMdMessages = {
      appended: 'CLAUDE.md (appended — original backed up to CLAUDE.md.pre-erne)',
      regenerated: 'CLAUDE.md (regenerated for detected stack)',
      generated: 'CLAUDE.md (generated for detected stack)',
    };
    console.log(`    ✓ ${claudeMdMessages[claudeMdResult]}`);

    // ─── Step 5: Project Audit ───
    console.log('\n  Step 5: Running project audit...\n');
    try {
      const { runAudit } = require('./audit');
      const { score, findings, strengths } = runAudit(cwd);
      const critical = findings.filter(f => f.severity === 'critical');
      const warnings = findings.filter(f => f.severity === 'warning');
      const scoreColor = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';
      const reset = '\x1b[0m';
      console.log(`    Score: ${scoreColor}${score}/100${reset}  (${strengths.length} strengths, ${critical.length} critical, ${warnings.length} warnings)`);
      if (critical.length > 0) {
        for (const f of critical) {
          console.log(`    \x1b[31m✗\x1b[0m ${f.title} — Fix: ${f.fix}`);
        }
      }
      console.log('    ✓ .erne/audit.md (full report)');
    } catch (err) {
      console.log(`    ⚠ Audit skipped: ${err.message}`);
    }

    // ─── Step 6: Launch Dashboard ───
    const skipDashboard = process.env.NODE_TEST || process.env.ERNE_SKIP_DASHBOARD;
    if (!skipDashboard) console.log('  Step 6: Launching dashboard...\n');
    try {
      if (skipDashboard) throw new Error('skipped in test');
      const { fork } = require('child_process');
      const fs = require('fs');
      const dashboardDir = path.resolve(__dirname, '..', 'dashboard');
      const serverPath = path.resolve(dashboardDir, 'server.js');

      // Install dashboard deps if needed
      if (!fs.existsSync(path.join(dashboardDir, 'node_modules', 'better-sqlite3'))) {
        console.log('    Installing dashboard dependencies...');
        require('child_process').execSync('npm install --production', { cwd: dashboardDir, stdio: 'ignore' });
      }

      // Fork dashboard server in background
      const child = fork(serverPath, ['--no-open'], {
        cwd,
        detached: true,
        stdio: 'ignore',
        env: { ...process.env, ERNE_PROJECT_DIR: cwd },
      });
      child.unref();

      // Wait briefly for server to start, then open browser
      setTimeout(() => {
        try {
          const { resolveDashboardPort } = require('../scripts/hooks/lib/port-registry');
          const port = resolveDashboardPort(cwd) || 3333;
          const open = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
          require('child_process').exec(`${open} http://localhost:${port}`);
          console.log(`    ✓ Dashboard running at http://localhost:${port}`);
        } catch {
          console.log('    ✓ Dashboard started in background');
        }
      }, 2000);
    } catch (err) {
      console.log(`    ⚠ Dashboard skipped: ${err.message}`);
    }

    console.log('\n  Done! Run /plan to start your first feature.\n');
  } finally {
    if (rl) rl.close();
  }
};
