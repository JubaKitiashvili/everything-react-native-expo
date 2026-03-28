// lib/generate.js — Variant selection and config generation
'use strict';

const fs = require('fs');
const path = require('path');

// ─── Variant Map ───────────────────────────────────────────────────────────────
// Maps target file paths → variant file selection based on detection fields.

const VARIANT_MAP = {
  'rules/common/state-management.md': {
    fields: ['state', 'serverState'],
    variants: {
      'zustand+tanstack-query': 'state-management/zustand-tanstack.md',
      'zustand+none': 'state-management/zustand-only.md',
      'zustand+swr': 'state-management/zustand-tanstack.md',
      'redux-saga+none': 'state-management/redux-saga.md',
      'redux-saga+tanstack-query': 'state-management/redux-saga.md',
      'redux-toolkit+rtk-query': 'state-management/redux-toolkit.md',
      'redux-toolkit+tanstack-query': 'state-management/redux-toolkit.md',
      'redux-toolkit+none': 'state-management/redux-toolkit.md',
    },
    default: 'state-management/zustand-tanstack.md',
  },
  'rules/common/navigation.md': {
    fields: ['navigation'],
    variants: {
      'expo-router': 'navigation/expo-router.md',
      'react-navigation': 'navigation/react-navigation.md',
    },
    default: 'navigation/expo-router.md',
  },
  'rules/common/performance.md': {
    fields: ['lists', 'images'],
    variants: {
      'flashlist+expo-image': 'performance/modern.md',
      'flashlist+rn-image': 'performance/modern.md',
      'flashlist+fast-image': 'performance/modern.md',
      'flatlist+expo-image': 'performance/modern.md',
      'flatlist+rn-image': 'performance/legacy.md',
      'flatlist+fast-image': 'performance/legacy.md',
    },
    default: 'performance/modern.md',
  },
  'rules/common/coding-style.md': {
    fields: ['componentStyle'],
    variants: {
      functional: 'coding-style/functional.md',
      class: 'coding-style/mixed.md',
      mixed: 'coding-style/mixed.md',
    },
    default: 'coding-style/functional.md',
  },
  'rules/common/security.md': {
    fields: ['storage'],
    variants: {
      'expo-secure-store': 'security/expo-secure.md',
      'rn-keychain': 'security/rn-keychain.md',
      'async-storage': 'security/async-storage.md',
    },
    default: 'security/async-storage.md',
  },
  'rules/common/styling.md': {
    fields: ['styling'],
    variants: {
      stylesheet: 'styling/stylesheet.md',
      nativewind: 'styling/nativewind.md',
      tamagui: 'styling/stylesheet.md',
      unistyles: 'styling/stylesheet.md',
    },
    default: 'styling/stylesheet.md',
  },
  'agents/ui-designer.md': {
    fields: ['styling'],
    variants: {
      stylesheet: 'ui-designer/stylesheet.md',
      nativewind: 'ui-designer/nativewind.md',
      tamagui: 'ui-designer/stylesheet.md',
      unistyles: 'ui-designer/stylesheet.md',
    },
    default: 'ui-designer/stylesheet.md',
  },
  'agents/architect.md': {
    fields: ['state', 'hasMonorepo'],
    variants: {
      'zustand+false': 'architect/zustand.md',
      'zustand+true': 'architect/monorepo.md',
      'redux-toolkit+false': 'architect/redux.md',
      'redux-toolkit+true': 'architect/monorepo.md',
      'redux-saga+false': 'architect/redux.md',
      'redux-saga+true': 'architect/monorepo.md',
      'mobx+false': 'architect/zustand.md',
      'mobx+true': 'architect/monorepo.md',
    },
    default: 'architect/zustand.md',
  },
  'agents/senior-developer.md': {
    fields: ['framework', 'state'],
    variants: {
      'expo-managed+zustand': 'senior-developer/modern-expo.md',
      'expo-managed+redux-toolkit': 'senior-developer/legacy-bare.md',
      'expo-managed+redux-saga': 'senior-developer/legacy-bare.md',
      'expo-bare+zustand': 'senior-developer/modern-expo.md',
      'expo-bare+redux-toolkit': 'senior-developer/legacy-bare.md',
      'expo-bare+redux-saga': 'senior-developer/legacy-bare.md',
      'bare-rn+redux-saga': 'senior-developer/legacy-bare.md',
      'bare-rn+redux-toolkit': 'senior-developer/legacy-bare.md',
      'bare-rn+zustand': 'senior-developer/modern-expo.md',
    },
    default: 'senior-developer/modern-expo.md',
  },
  'agents/feature-builder.md': {
    fields: ['framework', 'state'],
    variants: {
      'expo-managed+zustand': 'feature-builder/modern-expo.md',
      'expo-managed+redux-toolkit': 'feature-builder/legacy-bare.md',
      'expo-managed+redux-saga': 'feature-builder/legacy-bare.md',
      'expo-bare+zustand': 'feature-builder/modern-expo.md',
      'expo-bare+redux-toolkit': 'feature-builder/legacy-bare.md',
      'expo-bare+redux-saga': 'feature-builder/legacy-bare.md',
      'bare-rn+redux-saga': 'feature-builder/legacy-bare.md',
      'bare-rn+redux-toolkit': 'feature-builder/legacy-bare.md',
      'bare-rn+zustand': 'feature-builder/modern-expo.md',
    },
    default: 'feature-builder/modern-expo.md',
  },
};

// ─── selectVariant ─────────────────────────────────────────────────────────────

function selectVariant(targetPath, detection) {
  const mapping = VARIANT_MAP[targetPath];
  if (!mapping) return null;

  const key = mapping.fields
    .map((field) => {
      if (field === 'componentStyle') return detection.componentStyle;
      if (field === 'hasMonorepo') return String(detection.hasMonorepo);
      if (field === 'framework') return detection.framework;
      return detection.stack?.[field];
    })
    .join('+');

  return mapping.variants[key] || mapping.default;
}

// ─── determineRuleLayers ───────────────────────────────────────────────────────

function determineRuleLayers(detection, cwd) {
  const layers = ['common'];
  if (detection.framework === 'expo-managed' || detection.framework === 'expo-bare')
    layers.push('expo');
  if (detection.framework === 'bare-rn' || detection.framework === 'expo-bare')
    layers.push('bare-rn');

  // Add native rule layers for bare projects with native directories
  if (cwd && (detection.framework === 'bare-rn' || detection.framework === 'expo-bare')) {
    if (fs.existsSync(path.join(cwd, 'ios'))) layers.push('native-ios');
    if (fs.existsSync(path.join(cwd, 'android'))) layers.push('native-android');
  }

  return layers;
}

// ─── Helper: convertToClaudeCodeHooks ───────────────────────────────────────────
// Converts ERNE's flat hook array into Claude Code's settings.local.json format.
// Claude Code reads hooks from the "hooks" key in settings files, NOT from hooks.json.

const HOOK_TIMEOUTS = {
  'session-start.js': 10,
  'post-edit-typecheck.js': 60,
  'pre-edit-test-gate.js': 60,
  'audit-refresh.js': 60,
  'post-edit-format.js': 30,
  'bundle-size-check.js': 30,
  'pre-commit-lint.js': 30,
  'security-scan.js': 30,
  'evaluate-session.js': 30,
};
const DEFAULT_HOOK_TIMEOUT = 15;

function convertToClaudeCodeHooks(erneHooks, profileName, targetDir) {
  // erneHooks is { hooks: [{ event, pattern?, script, command, profiles }] }
  const activeHooks = erneHooks.hooks.filter((h) => {
    const hookProfiles = h.profiles || ['minimal', 'standard', 'strict'];
    return hookProfiles.includes(profileName);
  });

  // Group by event, then by pattern within each event
  const byEvent = {};
  for (const hook of activeHooks) {
    if (!byEvent[hook.event]) byEvent[hook.event] = [];
    byEvent[hook.event].push(hook);
  }

  const result = {};
  for (const [event, hooks] of Object.entries(byEvent)) {
    // Group hooks by pattern (matcher)
    const byPattern = {};
    for (const hook of hooks) {
      const pattern = hook.pattern || '';
      if (!byPattern[pattern]) byPattern[pattern] = [];
      byPattern[pattern].push(hook);
    }

    result[event] = [];
    for (const [pattern, patternHooks] of Object.entries(byPattern)) {
      const entry = {};
      if (pattern) entry.matcher = pattern;
      entry.hooks = patternHooks.map((h) => ({
        type: 'command',
        command: `node "${path.join(targetDir, 'hooks/scripts/run-with-flags.js')}" ${h.script}`,
        timeout: HOOK_TIMEOUTS[h.script] || DEFAULT_HOOK_TIMEOUT,
      }));
      result[event].push(entry);
    }
  }

  return result;
}

// ─── Helper: mergeHookProfile ──────────────────────────────────────────────────

function mergeHookProfile(masterHooks, profileHooks, profileName) {
  // masterHooks can be either:
  //   - flat array format: { hooks: [...] }
  //   - event-keyed format: { PreToolUse: [...], PostToolUse: [...], _meta: {...} }
  if (Array.isArray(masterHooks.hooks)) {
    // Flat array format — filter by profile, then group by event
    const filtered = masterHooks.hooks.filter((hook) => {
      const hookProfiles = hook.profiles || ['minimal', 'standard', 'strict'];
      return hookProfiles.includes(profileName);
    });
    const result = { _meta: { activeProfile: profileName } };
    for (const hook of filtered) {
      const event = hook.event;
      if (!result[event]) result[event] = [];
      result[event].push(hook);
    }
    return result;
  }

  // Event-keyed format (legacy path)
  const result = {};
  for (const [event, hooks] of Object.entries(masterHooks)) {
    if (event === '_meta') {
      result._meta = { ...masterHooks._meta, activeProfile: profileName };
      continue;
    }

    if (Array.isArray(hooks)) {
      result[event] = hooks.filter((hook) => {
        const hookProfiles = hook.profiles || ['minimal', 'standard', 'strict'];
        return hookProfiles.includes(profileName);
      });
      if (result[event].length === 0) delete result[event];
    }
  }

  return result;
}

// ─── Helper: copyDir ───────────────────────────────────────────────────────────

function copyDir(src, dest) {
  try {
    fs.mkdirSync(dest, { recursive: true });
  } catch (err) {
    console.error(`  ✗ Failed to create directory ${dest}: ${err.message}`);
    return;
  }
  let entries;
  try {
    entries = fs.readdirSync(src, { withFileTypes: true });
  } catch (err) {
    console.error(`  ✗ Failed to read ${src}: ${err.message}`);
    return;
  }
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    try {
      if (entry.isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    } catch (err) {
      console.error(`  ✗ Failed to copy ${srcPath}: ${err.message}`);
    }
  }
}

// ─── generateConfig ────────────────────────────────────────────────────────────

function generateConfig(erneRoot, targetDir, detection, profile, mcpSelections) {
  // Derive project root (cwd) from targetDir (.claude dir is one level inside project)
  const cwd = path.dirname(targetDir);
  const ruleLayers = determineRuleLayers(detection, cwd);
  let mcpCount = 0;

  // 1. Copy universal content (commands as skills, contexts, skills, hook scripts)

  // Remove old .claude/commands/ directory from previous installs
  const oldCommandsDir = path.join(targetDir, 'commands');
  if (fs.existsSync(oldCommandsDir)) {
    fs.rmSync(oldCommandsDir, { recursive: true, force: true });
  }

  // Copy commands as Claude Code skills: commands/foo.md → skills/foo/SKILL.md
  const commandsSrc = path.join(erneRoot, 'commands');
  if (fs.existsSync(commandsSrc)) {
    const commandFiles = fs.readdirSync(commandsSrc).filter((f) => f.endsWith('.md'));
    for (const file of commandFiles) {
      const name = path.basename(file, '.md');
      const skillDir = path.join(targetDir, 'skills', name);
      fs.mkdirSync(skillDir, { recursive: true });
      fs.copyFileSync(path.join(commandsSrc, file), path.join(skillDir, 'SKILL.md'));
    }
  }

  // Copy contexts and skills directories
  const universalDirs = ['contexts', 'skills'];
  for (const dir of universalDirs) {
    const src = path.join(erneRoot, dir);
    if (fs.existsSync(src)) {
      copyDir(src, path.join(targetDir, dir));
    }
  }

  // Copy hook configs (hooks.json, profiles/)
  const hooksSrc = path.join(erneRoot, 'hooks');
  if (fs.existsSync(hooksSrc)) {
    copyDir(hooksSrc, path.join(targetDir, 'hooks'));
  }

  // Copy hook scripts locally so they work without node_modules/erne-universal
  const hookScriptsSrc = path.join(erneRoot, 'scripts', 'hooks');
  if (fs.existsSync(hookScriptsSrc)) {
    copyDir(hookScriptsSrc, path.join(targetDir, 'hooks', 'scripts'));
  }

  // 2. Copy base rules (common + framework layers)
  for (const layer of ruleLayers) {
    const layerSrc = path.join(erneRoot, 'rules', layer);
    if (fs.existsSync(layerSrc)) {
      copyDir(layerSrc, path.join(targetDir, 'rules', layer));
    }
  }

  // 3. Apply rule variants (copy variant file over base file)
  for (const [targetPath, mapping] of Object.entries(VARIANT_MAP)) {
    if (!targetPath.startsWith('rules/')) continue;
    const variantName = selectVariant(targetPath, detection);
    if (!variantName) continue;
    const variantSrc = path.join(erneRoot, 'rules', 'variants', variantName);
    if (fs.existsSync(variantSrc)) {
      const destFile = path.join(targetDir, targetPath);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(variantSrc, destFile);
    }
  }

  // 4. Copy agents, skip irrelevant ones
  const agentsSrc = path.join(erneRoot, 'agents');
  if (fs.existsSync(agentsSrc)) {
    const agentsDest = path.join(targetDir, 'agents');
    fs.mkdirSync(agentsDest, { recursive: true });
    const agentFiles = fs.readdirSync(agentsSrc);
    for (const file of agentFiles) {
      // Skip native-bridge-builder unless bare-rn
      if (
        file === 'native-bridge-builder.md' &&
        detection.framework !== 'bare-rn' &&
        detection.framework !== 'expo-bare'
      )
        continue;
      // Skip expo-config-resolver if bare-rn
      if (file === 'expo-config-resolver.md' && detection.framework === 'bare-rn') continue;

      const srcPath = path.join(agentsSrc, file);
      const destPath = path.join(agentsDest, file);
      if (fs.statSync(srcPath).isDirectory()) {
        copyDir(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  // 5. Apply agent variants
  for (const [targetPath, mapping] of Object.entries(VARIANT_MAP)) {
    if (!targetPath.startsWith('agents/')) continue;
    const variantName = selectVariant(targetPath, detection);
    if (!variantName) continue;
    const variantSrc = path.join(erneRoot, 'agents', 'variants', variantName);
    if (fs.existsSync(variantSrc)) {
      const destFile = path.join(targetDir, targetPath);
      fs.mkdirSync(path.dirname(destFile), { recursive: true });
      fs.copyFileSync(variantSrc, destFile);
    }
  }

  // 6. Apply hook profile
  // Write ERNE internal hooks.json (used by run-with-flags.js for profile info)
  // AND write to settings.local.json in Claude Code's format (Claude Code actually reads hooks from here)
  const masterHooksPath = path.join(erneRoot, 'hooks', 'hooks.json');
  const profileHooksPath = path.join(erneRoot, 'hooks', 'profiles', `${profile}.json`);
  if (fs.existsSync(masterHooksPath) && fs.existsSync(profileHooksPath)) {
    const masterHooks = JSON.parse(fs.readFileSync(masterHooksPath, 'utf8'));
    const profileHooks = JSON.parse(fs.readFileSync(profileHooksPath, 'utf8'));
    const merged = mergeHookProfile(masterHooks, profileHooks, profile);

    // Rewrite hook commands to use local .claude/hooks/scripts/ path
    const localPrefix = '.claude/hooks/scripts/run-with-flags.js';
    for (const [event, hooks] of Object.entries(merged)) {
      if (event === '_meta' || !Array.isArray(hooks)) continue;
      for (const hook of hooks) {
        if (hook.command && hook.command.includes('scripts/hooks/run-with-flags.js')) {
          hook.command = hook.command.replace('scripts/hooks/run-with-flags.js', localPrefix);
        }
      }
    }

    // Write ERNE internal hooks.json (for run-with-flags.js profile lookup)
    const destHooksPath = path.join(targetDir, 'hooks.json');
    fs.writeFileSync(destHooksPath, JSON.stringify(merged, null, 2));

    // Write hooks to settings.local.json in Claude Code's format
    // Claude Code reads hooks from the "hooks" key in settings files, NOT from hooks.json
    const claudeCodeHooks = convertToClaudeCodeHooks(masterHooks, profile, targetDir);
    const settingsLocalPath = path.join(targetDir, 'settings.local.json');
    let settingsLocal = {};
    if (fs.existsSync(settingsLocalPath)) {
      try {
        settingsLocal = JSON.parse(fs.readFileSync(settingsLocalPath, 'utf8'));
      } catch {
        /* fresh */
      }
    }
    settingsLocal.hooks = claudeCodeHooks;
    fs.writeFileSync(settingsLocalPath, JSON.stringify(settingsLocal, null, 2) + '\n');
  }

  // 7. Copy MCP configs + generate .mcp.json for Claude Code
  if (mcpSelections && mcpSelections.length > 0) {
    const mcpSrc = path.join(erneRoot, 'mcp-configs');
    const mcpDest = path.join(targetDir, 'mcp');
    const mcpServers = {};
    if (fs.existsSync(mcpSrc)) {
      fs.mkdirSync(mcpDest, { recursive: true });
      for (const sel of mcpSelections) {
        // Try with and without .json extension
        const srcFile = fs.existsSync(path.join(mcpSrc, sel + '.json'))
          ? path.join(mcpSrc, sel + '.json')
          : path.join(mcpSrc, sel);
        if (fs.existsSync(srcFile)) {
          fs.copyFileSync(srcFile, path.join(mcpDest, sel + '.json'));
          mcpCount++;
          // Parse config for .mcp.json generation
          try {
            const mcpConfig = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
            const serverEntry = {};
            if (mcpConfig.command) serverEntry.command = mcpConfig.command;
            if (mcpConfig.args) serverEntry.args = mcpConfig.args;
            if (mcpConfig.env) serverEntry.env = mcpConfig.env;
            if (mcpConfig.url) serverEntry.url = mcpConfig.url;
            mcpServers[sel] = serverEntry;
          } catch {
            /* skip invalid json */
          }
        }
      }
    }
    // Write .mcp.json at project root for Claude Code
    if (Object.keys(mcpServers).length > 0) {
      const projectRoot = path.dirname(targetDir); // targetDir is .claude/, project root is parent
      const mcpJsonPath = path.join(projectRoot, '.mcp.json');
      let existingMcp = {};
      if (fs.existsSync(mcpJsonPath)) {
        try {
          existingMcp = JSON.parse(fs.readFileSync(mcpJsonPath, 'utf8'));
        } catch {
          /* fresh */
        }
      }
      if (!existingMcp.mcpServers) existingMcp.mcpServers = {};
      // Merge — don't overwrite existing servers
      for (const [name, config] of Object.entries(mcpServers)) {
        if (!existingMcp.mcpServers[name]) {
          existingMcp.mcpServers[name] = config;
        }
      }
      fs.writeFileSync(mcpJsonPath, JSON.stringify(existingMcp, null, 2) + '\n');
    }
  }

  // 8. Write settings.json with full detection profile
  const settingsPath = path.join(targetDir, 'settings.json');
  const settings = {
    erneVersion: require('../package.json').version,
    detection,
    profile,
    ruleLayers,
    mcpSelections: mcpSelections || [],
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

  return { ruleLayers, mcpCount };
}

module.exports = {
  VARIANT_MAP,
  selectVariant,
  generateConfig,
  determineRuleLayers,
  mergeHookProfile,
  convertToClaudeCodeHooks,
  copyDir,
};
