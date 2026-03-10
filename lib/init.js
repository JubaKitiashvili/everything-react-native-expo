// lib/init.js — Interactive project initializer
// Implements the 4-step install flow from spec Section 6

'use strict';

const fs = require('fs');
const path = require('path');
const readline = require('readline/promises');
const { stdin, stdout } = require('process');

module.exports = async function init() {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  const cwd = process.cwd();

  console.log('\n  erne — Setting up AI agent harness for React Native & Expo\n');

  // ─── Step 1: Detect project type ───
  console.log('  Step 1: Scanning project...');
  const detection = detectProject(cwd);
  printDetection(detection);

  if (!detection.isRNProject) {
    console.log('\n  ⚠ No React Native project detected in current directory.');
    const proceed = await rl.question('  Continue anyway? (y/N) ');
    if (proceed.toLowerCase() !== 'y') {
      console.log('  Aborted.');
      rl.close();
      return;
    }
  }

  // ─── Step 2: Choose hook profile ───
  console.log('\n  Step 2: Select hook profile:\n');
  console.log('    (a) minimal  — fast iteration, minimal checks');
  console.log('    (b) standard — balanced quality + speed [recommended]');
  console.log('    (c) strict   — production-grade enforcement');
  console.log();

  let profileChoice = await rl.question('  Profile (a/b/c) [b]: ');
  profileChoice = profileChoice.toLowerCase() || 'b';
  const profileMap = { a: 'minimal', b: 'standard', c: 'strict' };
  const profile = profileMap[profileChoice] || 'standard';

  // ─── Step 3: Select MCP integrations ───
  console.log('\n  Step 3: MCP server integrations:\n');

  const mcpSelections = {};

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

  rl.close();

  // ─── Step 4: Generate config ───
  console.log('\n  Step 4: Generating configuration...\n');

  const erneRoot = path.resolve(__dirname, '..');
  const claudeDir = path.join(cwd, '.claude');

  // Ensure .claude/ exists
  fs.mkdirSync(claudeDir, { recursive: true });

  // Copy agents
  copyDir(path.join(erneRoot, 'agents'), path.join(claudeDir, 'agents'));
  console.log('    ✓ .claude/agents/ (8 agents)');

  // Copy commands
  copyDir(path.join(erneRoot, 'commands'), path.join(claudeDir, 'commands'));
  console.log('    ✓ .claude/commands/ (16 commands)');

  // Copy applicable rules
  const ruleLayers = determineRuleLayers(detection);
  const rulesTarget = path.join(claudeDir, 'rules');
  fs.mkdirSync(rulesTarget, { recursive: true });
  for (const layer of ruleLayers) {
    copyDir(path.join(erneRoot, 'rules', layer), path.join(rulesTarget, layer));
  }
  console.log(`    ✓ .claude/rules/ (layers: ${ruleLayers.join(', ')})`);

  // Copy selected hook profile
  const hooksSource = path.join(erneRoot, 'hooks');
  const hooksTarget = path.join(claudeDir);
  const profileSource = path.join(hooksSource, 'profiles', `${profile}.json`);
  const masterHooks = JSON.parse(fs.readFileSync(path.join(hooksSource, 'hooks.json'), 'utf8'));
  const profileHooks = JSON.parse(fs.readFileSync(profileSource, 'utf8'));
  const mergedHooks = mergeHookProfile(masterHooks, profileHooks, profile);
  fs.writeFileSync(path.join(hooksTarget, 'hooks.json'), JSON.stringify(mergedHooks, null, 2));
  console.log(`    ✓ .claude/hooks.json (${profile} profile)`);

  // Copy hook scripts
  const scriptsTarget = path.join(claudeDir, 'scripts', 'hooks');
  copyDir(path.join(erneRoot, 'scripts', 'hooks'), scriptsTarget);
  console.log('    ✓ .claude/scripts/hooks/ (hook implementations)');

  // Copy contexts
  copyDir(path.join(erneRoot, 'contexts'), path.join(claudeDir, 'contexts'));
  console.log('    ✓ .claude/contexts/ (3 contexts)');

  // Copy selected MCP configs
  const mcpTarget = path.join(claudeDir, 'mcp-configs');
  fs.mkdirSync(mcpTarget, { recursive: true });
  let mcpCount = 0;
  for (const [key, enabled] of Object.entries(mcpSelections)) {
    if (enabled) {
      const src = path.join(erneRoot, 'mcp-configs', `${key}.json`);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(mcpTarget, `${key}.json`));
        mcpCount++;
      }
    }
  }
  console.log(`    ✓ .claude/mcp-configs/ (${mcpCount} servers)`);

  // Copy skills
  copyDir(path.join(erneRoot, 'skills'), path.join(claudeDir, 'skills'));
  console.log('    ✓ .claude/skills/ (8 skills)');

  // Generate CLAUDE.md
  const claudeMd = generateClaudeMd(detection, profile, ruleLayers);
  fs.writeFileSync(path.join(cwd, 'CLAUDE.md'), claudeMd);
  console.log('    ✓ CLAUDE.md (with correct rule imports)');

  // Generate settings.json
  const settings = {
    hookProfile: profile,
    erneVersion: require('../package.json').version,
    detectedProject: detection.type,
    installedAt: new Date().toISOString()
  };
  fs.writeFileSync(
    path.join(claudeDir, 'settings.json'),
    JSON.stringify(settings, null, 2)
  );
  console.log('    ✓ .claude/settings.json');

  console.log('\n  Done! Run /plan to start your first feature.\n');
};


// ─── Helper functions ───

function detectProject(cwd) {
  const result = {
    isRNProject: false,
    type: 'unknown',
    hasExpo: false,
    hasBareRN: false,
    hasIOS: false,
    hasAndroid: false,
  };

  // Check for app.json / app.config.js / app.config.ts (Expo)
  const expoConfigs = ['app.json', 'app.config.js', 'app.config.ts'];
  result.hasExpo = expoConfigs.some(f => fs.existsSync(path.join(cwd, f)));

  // Check for ios/ directory with Swift files
  const iosDir = path.join(cwd, 'ios');
  if (fs.existsSync(iosDir) && fs.statSync(iosDir).isDirectory()) {
    result.hasIOS = hasFilesWithExtension(iosDir, '.swift');
  }

  // Check for android/ directory with Kotlin files
  const androidDir = path.join(cwd, 'android');
  if (fs.existsSync(androidDir) && fs.statSync(androidDir).isDirectory()) {
    result.hasAndroid = hasFilesWithExtension(androidDir, '.kt');
  }

  // Check for bare RN indicators
  const packageJsonPath = path.join(cwd, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react-native']) {
        result.isRNProject = true;
        result.hasBareRN = !result.hasExpo;
      }
      if (deps['expo']) {
        result.isRNProject = true;
        result.hasExpo = true;
      }
    } catch { /* ignore parse errors */ }
  }

  // Determine type
  if (result.hasExpo) result.type = 'expo-managed';
  else if (result.hasBareRN) result.type = 'bare-rn';

  return result;
}

function hasFilesWithExtension(dir, ext) {
  try {
    const entries = fs.readdirSync(dir, { recursive: true });
    return entries.some(entry => entry.endsWith(ext));
  } catch {
    return false;
  }
}

function printDetection(detection) {
  const ok = (msg) => console.log(`    ✓ ${msg}`);
  const no = (msg) => console.log(`    ✗ ${msg}`);

  if (detection.hasExpo) ok('Expo config found → Expo managed workflow');
  else no('No Expo config detected');

  if (detection.hasBareRN) ok('Bare React Native project detected');

  if (detection.hasIOS) ok('ios/ contains Swift files → iOS native rules enabled');
  else no('No iOS native code found');

  if (detection.hasAndroid) ok('android/ contains Kotlin files → Android native rules enabled');
  else no('No Android native code found');
}

function determineRuleLayers(detection) {
  const layers = ['common'];
  if (detection.hasExpo) layers.push('expo');
  if (detection.hasBareRN) layers.push('bare-rn');
  if (detection.hasIOS) layers.push('native-ios');
  if (detection.hasAndroid) layers.push('native-android');
  return layers;
}

function mergeHookProfile(masterHooks, profileHooks, profileName) {
  // Filter master hooks to only include those enabled in the profile
  const enabledEvents = profileHooks.enabledEvents || [];
  const result = {};

  for (const [event, hooks] of Object.entries(masterHooks)) {
    if (event === '_meta') {
      result._meta = { ...masterHooks._meta, activeProfile: profileName };
      continue;
    }

    if (Array.isArray(hooks)) {
      result[event] = hooks.filter(hook => {
        // Include hook if the profile enables its event
        // or if the hook has no profile restriction
        const hookProfiles = hook.profiles || ['minimal', 'standard', 'strict'];
        return hookProfiles.includes(profileName);
      });
      // Remove empty arrays
      if (result[event].length === 0) delete result[event];
    }
  }

  return result;
}

function generateClaudeMd(detection, profile, ruleLayers) {
  const lines = [
    '# Project Configuration (ERNE)',
    '',
    `Hook profile: ${profile}`,
    `Project type: ${detection.type}`,
    '',
    '## Rules',
    '',
  ];

  for (const layer of ruleLayers) {
    lines.push(`@import .claude/rules/${layer}/`);
  }

  lines.push('', '## Skills', '', '@import .claude/skills/', '');

  return lines.join('\n');
}

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
}
