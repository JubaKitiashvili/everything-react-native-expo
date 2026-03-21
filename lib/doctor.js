// lib/doctor.js — ERNE project health check (merged with audit)
'use strict';

const fs = require('fs');
const path = require('path');
const { runAudit } = require('./audit');

const CHECK = '\x1b[32m✓\x1b[0m';
const CROSS = '\x1b[31m✗\x1b[0m';
const WARN = '\x1b[33m⚠\x1b[0m';
const INFO = '\x1b[36m→\x1b[0m';
const RESET = '\x1b[0m';

/**
 * Run all health checks and print results.
 */
async function doctor() {
  const cwd = process.cwd();

  console.log('\n  ERNE Doctor — Project Health Check\n');

  // ── ERNE Configuration ──
  console.log('  ── ERNE Configuration ──');

  const results = [];
  results.push(checkClaudeMd(cwd));
  results.push(checkHookProfile(cwd));
  results.push(checkSettings(cwd));
  results.push(checkHooksJson(cwd));
  results.push(checkMcpServers(cwd));
  results.push(checkPackageJson(cwd));
  results.push(checkTypescript(cwd));
  results.push(checkNodeModules(cwd));
  results.push(checkVariants(cwd));

  for (const r of results) {
    const icon = r.pass ? CHECK : CROSS;
    console.log(`    ${icon} ${r.message}`);
  }

  const passed = results.filter(r => r.pass).length;
  console.log(`\n  ${passed}/${results.length} config checks passed\n`);

  // ── Project Analysis (audit) ──
  console.log('  ── Project Analysis ──');

  try {
    const { findings, strengths, score } = runAudit(cwd);

    const critical = findings.filter(f => f.severity === 'critical');
    const warnings = findings.filter(f => f.severity === 'warning');
    const info = findings.filter(f => f.severity === 'info');

    // Score display
    const scoreBar = '\u2588'.repeat(Math.floor(score / 5)) + '\u2591'.repeat(20 - Math.floor(score / 5));
    const scoreColor = score >= 80 ? '\x1b[32m' : score >= 60 ? '\x1b[33m' : '\x1b[31m';

    console.log(`  Score: ${scoreColor}${score}/100${RESET}  [${scoreBar}]\n`);

    // Strengths
    if (strengths.length > 0) {
      console.log(`  ${strengths.length} Strengths:`);
      for (const s of strengths.slice(0, 15)) {
        console.log(`    ${CHECK} ${s.title}`);
      }
      if (strengths.length > 15) console.log(`    ... and ${strengths.length - 15} more`);
      console.log();
    }

    // Critical
    if (critical.length > 0) {
      console.log(`  ${critical.length} Critical:`);
      for (const f of critical) {
        console.log(`    ${CROSS} ${f.title}`);
        console.log(`      ${f.detail}`);
        console.log(`      Fix: ${f.fix}`);
      }
      console.log();
    }

    // Warnings
    if (warnings.length > 0) {
      console.log(`  ${warnings.length} Warnings:`);
      for (const f of warnings) {
        console.log(`    ${WARN} ${f.title} — ${f.detail}`);
      }
      console.log();
    }

    // Suggestions
    if (info.length > 0) {
      console.log(`  ${info.length} Suggestions:`);
      for (const f of info) {
        console.log(`    ${INFO} ${f.title}`);
      }
      console.log();
    }

    console.log(`  Report saved to .erne/audit.md and .erne/audit.json\n`);

    // ── Auto-fix (--fix flag) ──
    if (process.argv.includes('--fix')) {
      const fixes = await autoFix(cwd, findings);
      console.log('  ── Auto-fixes Applied ──');
      if (fixes.length > 0) {
        for (const fix of fixes) {
          console.log(`    ${CHECK} ${fix}`);
        }
        console.log(`\n  ${fixes.length} fix(es) applied. Run erne doctor again to verify.\n`);
      } else {
        console.log('  No auto-fixes needed.\n');
      }
    }
  } catch (err) {
    console.log(`  ${CROSS} Audit failed: ${err.message}\n`);
  }
}

/**
 * Auto-fix common issues found by audit.
 */
async function autoFix(cwd, findings) {
  const fixes = [];

  // Fix 1: Add .env to .gitignore
  const gitignorePath = path.join(cwd, '.gitignore');
  const envFinding = findings.find(f => f.title && f.title.includes('.env') && f.title.includes('.gitignore'));
  if (envFinding) {
    if (fs.existsSync(gitignorePath)) {
      fs.appendFileSync(gitignorePath, '\n.env\n.env.local\n');
    } else {
      fs.writeFileSync(gitignorePath, '.env\n.env.local\nnode_modules/\n');
    }
    fixes.push('Added .env to .gitignore');
  }

  // Fix 2: Enable TypeScript strict mode
  const tsconfigPath = path.join(cwd, 'tsconfig.json');
  const tsFinding = findings.find(f => f.title && f.title.includes('strict mode'));
  if (tsFinding && fs.existsSync(tsconfigPath)) {
    try {
      const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'));
      if (!tsconfig.compilerOptions) tsconfig.compilerOptions = {};
      tsconfig.compilerOptions.strict = true;
      fs.writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');
      fixes.push('Enabled TypeScript strict mode');
    } catch { /* skip invalid tsconfig */ }
  }

  return fixes;
}

function checkClaudeMd(cwd) {
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (!fs.existsSync(claudeMdPath)) {
    return { pass: false, message: 'CLAUDE.md not found' };
  }
  try {
    const content = fs.readFileSync(claudeMdPath, 'utf8');
    const isErne = content.includes('ERNE') || content.includes('erne');
    if (isErne) {
      return { pass: true, message: 'CLAUDE.md found (ERNE-configured)' };
    }
    return { pass: true, message: 'CLAUDE.md found (not ERNE-configured)' };
  } catch {
    return { pass: false, message: 'CLAUDE.md exists but unreadable' };
  }
}

function checkHookProfile(cwd) {
  // Check ERNE_PROFILE env var first
  const envProfile = process.env.ERNE_PROFILE;
  if (envProfile) {
    const count = countHooksForProfile(cwd, envProfile);
    const countStr = count !== null ? ` (${count} hooks active)` : '';
    return { pass: true, message: `Hook profile: ${envProfile}${countStr} (from ERNE_PROFILE)` };
  }

  // Check CLAUDE.md for profile comment
  const claudeMdPath = path.join(cwd, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    try {
      const content = fs.readFileSync(claudeMdPath, 'utf8');
      const match = content.match(/<!--\s*erne-profile:\s*(\w+)\s*-->/);
      if (match) {
        const profile = match[1];
        const count = countHooksForProfile(cwd, profile);
        const countStr = count !== null ? ` (${count} hooks active)` : '';
        return { pass: true, message: `Hook profile: ${profile}${countStr}` };
      }
    } catch { /* ignore */ }
  }

  // Check .claude/hooks.json for any hooks (means profile was applied)
  const projectHooksPath = path.join(cwd, '.claude', 'hooks.json');
  if (fs.existsSync(projectHooksPath)) {
    return { pass: true, message: 'Hook profile: detected (hooks.json present)' };
  }

  return { pass: false, message: 'Hook profile: not set (no ERNE_PROFILE or profile comment)' };
}

function countHooksForProfile(cwd, profile) {
  // Try ERNE's own hooks.json first
  const ernePkg = path.resolve(__dirname, '..', 'hooks', 'hooks.json');
  const projectHooks = path.join(cwd, '.claude', 'hooks.json');
  const hooksPath = fs.existsSync(ernePkg) ? ernePkg : projectHooks;

  if (!fs.existsSync(hooksPath)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    // Old format: { hooks: [...] }
    if (Array.isArray(data.hooks)) {
      return data.hooks.filter(h => h.profiles && h.profiles.includes(profile)).length;
    }
    // New event-keyed format: { PreToolUse: [...], PostToolUse: [...] }
    let count = 0;
    for (const [key, hooks] of Object.entries(data)) {
      if (key === '_meta') continue;
      if (Array.isArray(hooks)) {
        count += hooks.filter(h => h.profiles && h.profiles.includes(profile)).length;
      }
    }
    return count;
  } catch {
    return null;
  }
}

function checkSettings(cwd) {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (fs.existsSync(settingsPath)) {
    return { pass: true, message: '.claude/settings.json found' };
  }
  return { pass: false, message: '.claude/settings.json not found' };
}

function checkHooksJson(cwd) {
  // Check project-level hooks first, then ERNE source
  const projectHooks = path.join(cwd, '.claude', 'hooks.json');
  const erneHooks = path.resolve(__dirname, '..', 'hooks', 'hooks.json');
  const hooksPath = fs.existsSync(projectHooks) ? projectHooks : erneHooks;

  if (!fs.existsSync(hooksPath)) {
    return { pass: false, message: 'hooks.json not found' };
  }
  try {
    const data = JSON.parse(fs.readFileSync(hooksPath, 'utf8'));
    let count;
    // Old format: { hooks: [...] }
    if (Array.isArray(data.hooks)) {
      count = data.hooks.length;
    } else {
      // New event-keyed format: { PreToolUse: [...], PostToolUse: [...] }
      count = 0;
      for (const [key, hooks] of Object.entries(data)) {
        if (key === '_meta') continue;
        if (Array.isArray(hooks)) count += hooks.length;
      }
    }
    const label = hooksPath === projectHooks ? '.claude/hooks.json' : 'hooks.json';
    return { pass: true, message: `${label} valid (${count} hook definitions)` };
  } catch {
    return { pass: false, message: 'hooks.json exists but is invalid JSON' };
  }
}

function checkMcpServers(cwd) {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    return { pass: false, message: 'MCP servers: cannot check (no settings.json)' };
  }
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const selections = data.mcpSelections;
    if (!selections || !Array.isArray(selections) || selections.length === 0) {
      return { pass: false, message: 'MCP servers: none configured' };
    }
    return { pass: true, message: `MCP servers: ${selections.join(', ')}` };
  } catch {
    return { pass: false, message: 'MCP servers: settings.json is invalid JSON' };
  }
}

function checkPackageJson(cwd) {
  const pkgPath = path.join(cwd, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return { pass: false, message: 'package.json not found' };
  }
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const parts = [];
    if (deps.expo) parts.push(`expo: ${deps.expo}`);
    if (deps['react-native']) parts.push(`react-native: ${deps['react-native']}`);
    if (parts.length > 0) {
      return { pass: true, message: `package.json found (${parts.join(', ')})` };
    }
    return { pass: true, message: 'package.json found (no expo/react-native dependency)' };
  } catch {
    return { pass: false, message: 'package.json exists but is invalid JSON' };
  }
}

function checkTypescript(cwd) {
  if (fs.existsSync(path.join(cwd, 'tsconfig.json'))) {
    return { pass: true, message: 'TypeScript configured' };
  }
  return { pass: true, message: 'TypeScript not configured (optional)' };
}

function checkNodeModules(cwd) {
  if (fs.existsSync(path.join(cwd, 'node_modules'))) {
    return { pass: true, message: 'node_modules present' };
  }
  return { pass: false, message: 'node_modules not found (run npm install)' };
}

function checkVariants(cwd) {
  const settingsPath = path.join(cwd, '.claude', 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    return { pass: true, message: 'Variants: cannot check (no settings.json)' };
  }
  try {
    const data = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    const detection = data.detection;
    if (!detection || !detection.stack) {
      return { pass: true, message: 'Variants: no detection data in settings' };
    }

    // Check a key variant file — if state-management was detected, the variant should differ from generic
    const stateMgmt = path.join(cwd, '.claude', 'rules', 'common', 'state-management.md');
    if (!fs.existsSync(stateMgmt)) {
      return { pass: true, message: 'Variants: rules not installed (run erne init)' };
    }

    const content = fs.readFileSync(stateMgmt, 'utf8');
    const state = detection.stack.state;
    if (state && state !== 'none') {
      const hasVariantHint = content.includes(state) || content.includes('Zustand') || content.includes('Redux') || content.includes('MobX');
      if (hasVariantHint) {
        return { pass: true, message: `Variants: stack-tailored rules applied (${state})` };
      }
      return { pass: false, message: `Variants: state-management.md may be generic (expected ${state} variant). Re-run: npx erne-universal init` };
    }
    return { pass: true, message: 'Variants: no state management detected' };
  } catch {
    return { pass: true, message: 'Variants: could not verify (settings parse error)' };
  }
}

doctor.autoFix = autoFix;
module.exports = doctor;
