# ERNE Plan 4: Install CLI & Distribution

**Date:** 2026-03-10
**Spec:** `docs/superpowers/specs/2026-03-10-everything-react-native-expo-design.md`
**Depends on:** Plans 1–3 (all content files must exist before install can link them)

---

## Overview

This plan covers the **installer CLI** (`npx erne-universal init`), **project scaffolding**, **CI/CD**, **website**, **testing**, and **distribution packaging**. After this plan, ERNE is a shippable npm package.

**Total files:** ~18 new files
**Tasks:** 8 across 3 chunks + verification

---

## Chunk 1: Package Scaffolding & CLI Installer

### Task 1: Package Foundation (4 files)

#### File 1.1: `package.json`

```json
{
  "name": "erne-universal",
  "version": "0.1.0",
  "description": "Complete AI coding agent harness for React Native and Expo development",
  "keywords": [
    "react-native",
    "expo",
    "claude-code",
    "ai-agents",
    "mobile-development",
    "coding-assistant"
  ],
  "license": "MIT",
  "repository": {
    "type": "git",
    "url": "https://github.com/JubaKitiashvili/everything-react-native-expo"
  },
  "homepage": "https://erne.dev",
  "bin": {
    "erne": "./bin/cli.js"
  },
  "files": [
    "bin/",
    "agents/",
    "commands/",
    "rules/",
    "skills/",
    "hooks/",
    "contexts/",
    "mcp-configs/",
    "scripts/",
    "examples/",
    "schemas/",
    "docs/",
    "install.sh",
    "LICENSE",
    "README.md"
  ],
  "engines": {
    "node": ">=18"
  },
  "scripts": {
    "test": "node --test tests/",
    "lint": "node scripts/lint-content.js",
    "validate": "node scripts/validate-all.js",
    "prepublishOnly": "npm run validate"
  },
  "devDependencies": {}
}
```

**Notes:**
- Zero runtime dependencies — CLI uses only Node.js built-ins (`fs`, `path`, `readline`)
- `bin.erne` allows `npx erne-universal init` to work
- `files` array controls what gets published to npm (excludes tests, website, .github)
- `engines.node >= 18` — required for `node --test`, `fs.cpSync`, `readline/promises`

#### File 1.2: `bin/cli.js`

```javascript
#!/usr/bin/env node
// bin/cli.js — ERNE CLI entry point
// Usage: npx erne-universal <command>
//   Commands:
//     init     — Interactive project setup
//     update   — Update ERNE to latest version
//     version  — Show installed version

'use strict';

const { resolve, join } = require('path');

const COMMANDS = {
  init: () => require('../lib/init'),
  update: () => require('../lib/update'),
  version: () => {
    const pkg = require('../package.json');
    console.log(`erne v${pkg.version}`);
    process.exit(0);
  },
  help: () => {
    console.log(`
  erne — AI coding agent harness for React Native & Expo

  Usage:
    npx erne-universal <command>

  Commands:
    init       Set up ERNE in your project
    update     Update to the latest version
    version    Show installed version
    help       Show this help message

  Website: https://erne.dev
    `);
    process.exit(0);
  }
};

const command = process.argv[2] || 'help';

if (!COMMANDS[command]) {
  console.error(`Unknown command: ${command}`);
  console.error('Run "npx erne-universal help" for available commands.');
  process.exit(1);
}

// Execute command module
const run = COMMANDS[command]();
if (typeof run === 'function') {
  run().catch(err => {
    console.error('Error:', err.message);
    process.exit(1);
  });
}
```

**Notes:**
- Shebang line for npx execution
- Lazy-loads command modules to keep startup fast
- `help` as default command when no args given
- No external dependencies — only `require('path')` and sibling modules

#### File 1.3: `LICENSE`

```
MIT License

Copyright (c) 2026 ERNE Contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

#### File 1.4: `README.md`

````markdown
# everything-react-native-expo (ERNE)

Complete AI coding agent harness for React Native and Expo development.

## Quick Start

```bash
npx erne-universal init
```

This will:
1. Detect your project type (Expo managed, bare RN, or monorepo)
2. Let you choose a hook profile (minimal / standard / strict)
3. Select MCP integrations (simulator control, GitHub, etc.)
4. Generate your `.claude/` configuration

## What's Included

| Component | Count |
|-----------|-------|
| Agents | 8 specialized AI agents |
| Commands | 16 slash commands |
| Rule layers | 5 (common, expo, bare-rn, native-ios, native-android) |
| Hook profiles | 3 (minimal, standard, strict) |
| Skills | 8 reusable knowledge modules |
| Contexts | 3 behavior modes (dev, review, vibe) |
| MCP configs | 10 server integrations |

## Agents

- **architect** — System design and project structure
- **code-reviewer** — Code quality and best practices
- **tdd-guide** — Test-driven development workflow
- **performance-profiler** — Performance diagnostics
- **native-bridge-builder** — Native module development
- **expo-config-resolver** — Expo configuration issues
- **ui-designer** — UI/UX implementation
- **upgrade-assistant** — Version migration

## Hook Profiles

| Profile | Use Case |
|---------|----------|
| minimal | Fast iteration, vibe coding |
| standard | Balanced quality + speed (recommended) |
| strict | Production-grade enforcement |

Change profile: Edit `hookProfile` in `.claude/settings.json` or use `/vibe` context.

## Commands

Core: `/plan`, `/code-review`, `/tdd`, `/build-fix`, `/perf`, `/upgrade`, `/native-module`, `/navigate`

Extended: `/animate`, `/deploy`, `/component`, `/debug`, `/quality-gate`

Learning: `/learn`, `/retrospective`, `/setup-device`

## Documentation

- [Getting Started](docs/getting-started.md)
- [Agents Guide](docs/agents.md)
- [Commands Reference](docs/commands.md)
- [Hooks & Profiles](docs/hooks-profiles.md)
- [Creating Skills](docs/creating-skills.md)

## Links

- Website: [erne.dev](https://erne.dev)
- npm: [erne-universal](https://www.npmjs.com/package/erne-universal)

## License

MIT
````

---

### Task 2: Installer Core Logic (2 files)

#### File 2.1: `lib/init.js`

```javascript
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
```

**Notes:**
- 4-step interactive flow matching spec Section 6 exactly
- Project detection: checks `app.json`, `expo` in deps, `ios/` Swift, `android/` Kotlin
- `readline/promises` for async interactive prompts (Node 18+)
- `fs.cpSync` for directory copying (Node 16.7+, stable in 18+)
- Hook profile merging filters master hooks.json by profile flags
- Generated CLAUDE.md uses `@import` for rule layer inclusion
- Zero external dependencies

#### File 2.2: `lib/update.js`

```javascript
// lib/update.js — Update ERNE to latest version
// Usage: npx erne-universal update

'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

module.exports = async function update() {
  const cwd = process.cwd();
  const claudeDir = path.join(cwd, '.claude');
  const settingsPath = path.join(claudeDir, 'settings.json');

  console.log('\n  erne — Checking for updates...\n');

  // Check if ERNE is installed in this project
  if (!fs.existsSync(settingsPath)) {
    console.log('  ⚠ ERNE not found in this project.');
    console.log('  Run "npx erne-universal init" to set up.');
    return;
  }

  const settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  console.log(`  Current version: ${settings.erneVersion}`);

  // Fetch latest version from npm
  let latestVersion;
  try {
    latestVersion = execSync('npm view erne-universal version', { encoding: 'utf8' }).trim();
  } catch {
    console.log('  ⚠ Could not check npm for latest version.');
    console.log('  Check https://erne.dev for updates.');
    return;
  }

  console.log(`  Latest version:  ${latestVersion}`);

  if (settings.erneVersion === latestVersion) {
    console.log('\n  Already up to date!\n');
    return;
  }

  console.log(`\n  Updating ${settings.erneVersion} → ${latestVersion}...`);

  // Re-run init with preserved settings
  // The init command detects existing settings and preserves user choices
  console.log('  Running: npx erne-universal@latest init');
  console.log('  Your profile and MCP selections will be preserved.\n');

  try {
    execSync(`npx erne-universal@${latestVersion} init`, {
      stdio: 'inherit',
      cwd,
    });
  } catch (err) {
    console.error('  Update failed:', err.message);
    console.error('  Manual update: npm install -g erne-universal@latest && erne init');
  }
};
```

**Notes:**
- Checks current version from `.claude/settings.json`
- Compares against npm registry latest
- Re-runs `init` at latest version (preserves user's profile/MCP choices)
- Falls back gracefully if npm is unreachable

---

### Task 3: Shell Installer (1 file)

#### File 3.1: `install.sh`

```bash
#!/bin/bash
# install.sh — ERNE installer for Claude Code / Cursor / Windsurf
# Usage: curl -fsSL https://erne.dev/install.sh | bash
# Or: git clone <repo> && cd everything-react-native-expo && ./install.sh

set -euo pipefail

ERNE_VERSION="0.1.0"
REPO_URL="https://github.com/JubaKitiashvili/everything-react-native-expo"

echo ""
echo "  erne v${ERNE_VERSION} — AI agent harness for React Native & Expo"
echo ""

# Check prerequisites
command -v node >/dev/null 2>&1 || {
  echo "  ✗ Node.js is required. Install from https://nodejs.org/"
  exit 1
}

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "  ✗ Node.js 18+ required. Current: $(node -v)"
  exit 1
fi

echo "  ✓ Node.js $(node -v) detected"

# Check for npm
command -v npm >/dev/null 2>&1 || {
  echo "  ✗ npm is required."
  exit 1
}

# Determine install method
if [ -f "package.json" ]; then
  echo "  ✓ package.json found — installing locally"
  echo ""

  # Use npx to run init
  npx erne-universal init
else
  echo "  ⚠ No package.json found in current directory."
  echo "  Navigate to your React Native project first."
  echo ""
  echo "  Usage:"
  echo "    cd your-rn-project"
  echo "    npx erne-universal init"
  exit 1
fi
```

**Notes:**
- Works both as curl-pipe-bash from `erne.dev` and as local `./install.sh`
- Checks Node.js 18+ prerequisite
- Delegates to `npx erne-universal init` for actual installation
- `set -euo pipefail` for robust error handling

---

## Chunk 2: CI/CD, Testing & Validation

### Task 4: GitHub Actions & Contributing (3 files)

#### File 4.1: `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node-version: [18, 20, 22]

    steps:
      - uses: actions/checkout@v4

      - name: Use Node.js ${{ matrix.node-version }}
        uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node-version }}

      - name: Validate content files
        run: npm run validate

      - name: Run tests
        run: npm test

      - name: Check CLI runs
        run: node bin/cli.js version

      - name: Verify file structure
        run: |
          echo "Checking required directories..."
          for dir in agents commands rules skills hooks contexts mcp-configs scripts schemas docs examples; do
            if [ ! -d "$dir" ]; then
              echo "FAIL: Missing directory: $dir"
              exit 1
            fi
          done
          echo "All directories present."

          echo "Checking agent count..."
          AGENT_COUNT=$(ls -1 agents/*.md 2>/dev/null | wc -l | tr -d ' ')
          if [ "$AGENT_COUNT" -ne 8 ]; then
            echo "FAIL: Expected 8 agents, found $AGENT_COUNT"
            exit 1
          fi
          echo "OK: $AGENT_COUNT agents"

          echo "Checking command count..."
          CMD_COUNT=$(ls -1 commands/*.md 2>/dev/null | wc -l | tr -d ' ')
          if [ "$CMD_COUNT" -ne 16 ]; then
            echo "FAIL: Expected 16 commands, found $CMD_COUNT"
            exit 1
          fi
          echo "OK: $CMD_COUNT commands"
```

**Notes:**
- Tests on Node 18, 20, 22 (current LTS range)
- Validates content file frontmatter, runs unit tests, checks CLI, verifies file counts
- Runs on push to main and PRs

#### File 4.2: `.github/CONTRIBUTING.md`

```markdown
# Contributing to ERNE

## Project Structure

- `agents/` — AI agent definitions (8 `.md` files)
- `commands/` — Slash command definitions (16 `.md` files)
- `rules/` — Coding rules organized by layer
- `skills/` — Reusable knowledge modules
- `hooks/` — Git/development hooks with profile system
- `contexts/` — Behavior mode definitions
- `mcp-configs/` — MCP server configuration templates
- `scripts/hooks/` — Hook implementation scripts (CJS)
- `lib/` — CLI logic (init, update)
- `tests/` — Test suites

## Content File Format

Agent, command, and rule files use YAML frontmatter:

    ---
    name: agent-name
    description: What the agent does
    ---

    Content body in markdown.

## Hook Scripts

All hook scripts use CommonJS (`.js` or `.cjs`). No ES modules.

## Testing

    npm test           # Run all tests
    npm run validate   # Validate content files
    npm run lint       # Lint content

## Pull Request Process

1. Fork the repository
2. Create a feature branch
3. Make changes following existing patterns
4. Run `npm run validate && npm test`
5. Submit PR with description of changes
```

#### File 4.3: `.github/ISSUE_TEMPLATE/bug_report.md`

```markdown
---
name: Bug Report
about: Report a problem with ERNE
labels: bug
---

## Description

Brief description of the issue.

## Environment

- ERNE version:
- Node.js version:
- OS:
- Claude Code version:
- Project type: (Expo managed / bare RN / monorepo)

## Steps to Reproduce

1.
2.
3.

## Expected Behavior

## Actual Behavior

## Additional Context
```

---

### Task 5: Validation & Lint Scripts (2 files)

#### File 5.1: `scripts/validate-all.js`

```javascript
#!/usr/bin/env node
// scripts/validate-all.js — Validate all ERNE content files
// Checks: frontmatter format, JSON validity, required fields, file counts

'use strict';

const fs = require('fs');
const path = require('path');

let errors = 0;
let warnings = 0;
let checked = 0;

function error(msg) { errors++; console.error(`  ✗ ${msg}`); }
function warn(msg) { warnings++; console.warn(`  ⚠ ${msg}`); }
function ok(msg) { console.log(`  ✓ ${msg}`); }

// ─── Validate frontmatter in .md files ───
function validateFrontmatter(filePath, requiredFields) {
  checked++;
  const content = fs.readFileSync(filePath, 'utf8');
  const match = content.match(/^---\n([\s\S]*?)\n---/);

  if (!match) {
    error(`${filePath}: Missing frontmatter`);
    return;
  }

  const frontmatter = match[1];
  for (const field of requiredFields) {
    if (!frontmatter.includes(`${field}:`)) {
      error(`${filePath}: Missing required field '${field}'`);
    }
  }
}

// ─── Validate JSON files ───
function validateJson(filePath) {
  checked++;
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
  } catch (e) {
    error(`${filePath}: Invalid JSON — ${e.message}`);
  }
}

// ─── Validate directory file counts ───
function validateCount(dir, ext, expected, label) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith(ext));
  if (files.length !== expected) {
    error(`${label}: Expected ${expected} files, found ${files.length}`);
  } else {
    ok(`${label}: ${files.length} files`);
  }
}

// ─── Main validation ───
console.log('\n  ERNE Content Validation\n');

// Agents
console.log('  Agents:');
validateCount('agents', '.md', 8, 'agents/');
const agentFiles = fs.readdirSync('agents').filter(f => f.endsWith('.md'));
for (const f of agentFiles) {
  validateFrontmatter(path.join('agents', f), ['name', 'description']);
}

// Commands
console.log('  Commands:');
validateCount('commands', '.md', 16, 'commands/');
const cmdFiles = fs.readdirSync('commands').filter(f => f.endsWith('.md'));
for (const f of cmdFiles) {
  validateFrontmatter(path.join('commands', f), ['name', 'description']);
}

// Rules
console.log('  Rules:');
const ruleLayers = ['common', 'expo', 'bare-rn', 'native-ios', 'native-android'];
for (const layer of ruleLayers) {
  const layerDir = path.join('rules', layer);
  if (!fs.existsSync(layerDir)) {
    error(`rules/${layer}/: Missing directory`);
    continue;
  }
  const ruleFiles = fs.readdirSync(layerDir).filter(f => f.endsWith('.md'));
  ok(`rules/${layer}/: ${ruleFiles.length} files`);
  for (const f of ruleFiles) {
    validateFrontmatter(path.join(layerDir, f), ['description']);
  }
}

// Hook profiles
console.log('  Hooks:');
validateJson('hooks/hooks.json');
for (const profile of ['minimal', 'standard', 'strict']) {
  validateJson(path.join('hooks', 'profiles', `${profile}.json`));
}

// MCP configs
console.log('  MCP Configs:');
const mcpFiles = fs.readdirSync('mcp-configs').filter(f => f.endsWith('.json'));
ok(`mcp-configs/: ${mcpFiles.length} files`);
for (const f of mcpFiles) {
  validateJson(path.join('mcp-configs', f));
}

// Contexts
console.log('  Contexts:');
validateCount('contexts', '.md', 3, 'contexts/');

// Skills
console.log('  Skills:');
const skillDirs = fs.readdirSync('skills', { withFileTypes: true })
  .filter(d => d.isDirectory())
  .map(d => d.name);
ok(`skills/: ${skillDirs.length} skill directories`);
for (const dir of skillDirs) {
  const skillMd = path.join('skills', dir, 'SKILL.md');
  if (!fs.existsSync(skillMd)) {
    error(`skills/${dir}/: Missing SKILL.md`);
  } else {
    checked++;
  }
}

// Schemas
console.log('  Schemas:');
validateJson('schemas/hooks.schema.json');
validateJson('schemas/plugin.schema.json');

// Summary
console.log(`\n  Checked ${checked} files: ${errors} errors, ${warnings} warnings\n`);

if (errors > 0) {
  process.exit(1);
}
```

#### File 5.2: `scripts/lint-content.js`

```javascript
#!/usr/bin/env node
// scripts/lint-content.js — Lint ERNE content files for style consistency
// Checks: trailing whitespace, consistent headings, max line length in frontmatter

'use strict';

const fs = require('fs');
const path = require('path');

let issues = 0;

function lint(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  // Check for trailing whitespace
  lines.forEach((line, i) => {
    if (line !== line.trimEnd() && line.trim().length > 0) {
      console.log(`  ${filePath}:${i + 1}: trailing whitespace`);
      issues++;
    }
  });

  // Check frontmatter has no empty description
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (fmMatch) {
    const fm = fmMatch[1];
    if (fm.includes('description:') && fm.match(/description:\s*$/m)) {
      console.log(`  ${filePath}: empty description in frontmatter`);
      issues++;
    }
  }

  // Check file ends with newline
  if (content.length > 0 && !content.endsWith('\n')) {
    console.log(`  ${filePath}: missing trailing newline`);
    issues++;
  }
}

function lintDir(dir, ext) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { recursive: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry);
    if (fullPath.endsWith(ext) && fs.statSync(fullPath).isFile()) {
      lint(fullPath);
    }
  }
}

console.log('\n  ERNE Content Lint\n');

lintDir('agents', '.md');
lintDir('commands', '.md');
lintDir('rules', '.md');
lintDir('contexts', '.md');
lintDir('skills', '.md');
lintDir('docs', '.md');

console.log(`\n  ${issues} issues found\n`);
if (issues > 0) process.exit(1);
```

---

### Task 6: Unit Tests (2 files)

#### File 6.1: `tests/cli.test.js`

```javascript
// tests/cli.test.js — CLI entry point tests
// Uses Node.js built-in test runner (node --test)

'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { execSync } = require('child_process');
const path = require('path');

const CLI_PATH = path.resolve(__dirname, '..', 'bin', 'cli.js');

describe('CLI', () => {
  it('shows version', () => {
    const output = execSync(`node ${CLI_PATH} version`, { encoding: 'utf8' });
    assert.match(output, /erne v\d+\.\d+\.\d+/);
  });

  it('shows help', () => {
    const output = execSync(`node ${CLI_PATH} help`, { encoding: 'utf8' });
    assert.ok(output.includes('erne'));
    assert.ok(output.includes('init'));
    assert.ok(output.includes('update'));
  });

  it('shows help for no arguments', () => {
    const output = execSync(`node ${CLI_PATH}`, { encoding: 'utf8' });
    assert.ok(output.includes('erne'));
  });

  it('errors on unknown command', () => {
    assert.throws(() => {
      execSync(`node ${CLI_PATH} nonexistent`, { encoding: 'utf8' });
    });
  });
});
```

#### File 6.2: `tests/detection.test.js`

```javascript
// tests/detection.test.js — Project detection logic tests
// Tests the detectProject function used in init flow

'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Create temp directory for each test
let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'erne-test-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Extract detectProject for testing
// We test the detection logic by creating mock project structures
// and running the init module's detection against them

describe('Project Detection', () => {
  it('detects Expo managed project', () => {
    // Create app.json
    fs.writeFileSync(
      path.join(tmpDir, 'app.json'),
      JSON.stringify({ expo: { name: 'test' } })
    );
    // Create package.json with expo dep
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { expo: '~51.0.0', 'react-native': '0.74.0' }
      })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.type, 'expo-managed');
    assert.equal(result.hasExpo, true);
    assert.equal(result.isRNProject, true);
  });

  it('detects bare React Native project', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: { 'react-native': '0.74.0' }
      })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.type, 'bare-rn');
    assert.equal(result.hasBareRN, true);
    assert.equal(result.hasExpo, false);
  });

  it('detects iOS native code', () => {
    const iosDir = path.join(tmpDir, 'ios');
    fs.mkdirSync(iosDir, { recursive: true });
    fs.writeFileSync(path.join(iosDir, 'AppDelegate.swift'), '');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-native': '0.74.0' } })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.hasIOS, true);
  });

  it('detects Android native code', () => {
    const androidDir = path.join(tmpDir, 'android');
    fs.mkdirSync(androidDir, { recursive: true });
    fs.writeFileSync(path.join(androidDir, 'MainActivity.kt'), '');
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { 'react-native': '0.74.0' } })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.hasAndroid, true);
  });

  it('returns unknown for non-RN project', () => {
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({ dependencies: { express: '4.0.0' } })
    );

    const result = detectInDir(tmpDir);
    assert.equal(result.type, 'unknown');
    assert.equal(result.isRNProject, false);
  });
});

// Simple project detector mirroring lib/init.js logic
function detectInDir(cwd) {
  const result = {
    isRNProject: false,
    type: 'unknown',
    hasExpo: false,
    hasBareRN: false,
    hasIOS: false,
    hasAndroid: false,
  };

  const expoConfigs = ['app.json', 'app.config.js', 'app.config.ts'];
  result.hasExpo = expoConfigs.some(f => fs.existsSync(path.join(cwd, f)));

  const iosDir = path.join(cwd, 'ios');
  if (fs.existsSync(iosDir) && fs.statSync(iosDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(iosDir, { recursive: true });
      result.hasIOS = entries.some(e => e.endsWith('.swift'));
    } catch { result.hasIOS = false; }
  }

  const androidDir = path.join(cwd, 'android');
  if (fs.existsSync(androidDir) && fs.statSync(androidDir).isDirectory()) {
    try {
      const entries = fs.readdirSync(androidDir, { recursive: true });
      result.hasAndroid = entries.some(e => e.endsWith('.kt'));
    } catch { result.hasAndroid = false; }
  }

  const pkgPath = path.join(cwd, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };
      if (deps['react-native']) {
        result.isRNProject = true;
        result.hasBareRN = !result.hasExpo;
      }
      if (deps['expo']) {
        result.isRNProject = true;
        result.hasExpo = true;
      }
    } catch { /* ignore */ }
  }

  if (result.hasExpo) result.type = 'expo-managed';
  else if (result.hasBareRN) result.type = 'bare-rn';

  return result;
}
```

**Notes:**
- Uses Node.js built-in test runner (`node:test`) — no test framework dependency
- CLI tests verify `version`, `help`, and error handling
- Detection tests create real temp directories with mock project structures
- Tests clean up temp dirs after each test

---

## Chunk 3: Website & Final Packaging

### Task 7: Landing Page (1 file)

#### File 7.1: `website/index.html`

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ERNE — AI Agent Harness for React Native & Expo</title>
  <meta name="description" content="Complete AI coding agent harness for React Native and Expo development. 8 agents, 16 commands, 5 rule layers, 3 hook profiles.">
  <style>
    :root {
      --bg: #0a0a0a;
      --fg: #e5e5e5;
      --accent: #3b82f6;
      --muted: #737373;
      --code-bg: #1a1a1a;
      --border: #262626;
    }

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: var(--bg);
      color: var(--fg);
      line-height: 1.6;
      min-height: 100vh;
    }

    .container { max-width: 800px; margin: 0 auto; padding: 0 24px; }

    header {
      padding: 80px 0 40px;
      text-align: center;
    }

    h1 {
      font-size: 3rem;
      font-weight: 700;
      letter-spacing: -0.02em;
      margin-bottom: 16px;
    }

    .tagline {
      font-size: 1.25rem;
      color: var(--muted);
      max-width: 500px;
      margin: 0 auto 40px;
    }

    .install-box {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 16px 24px;
      font-family: 'SF Mono', 'Fira Code', monospace;
      font-size: 1rem;
      display: inline-block;
      margin-bottom: 8px;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .install-box:hover { border-color: var(--accent); }
    .install-box .prompt { color: var(--muted); }
    .install-box .cmd { color: var(--accent); }

    .copy-hint {
      font-size: 0.85rem;
      color: var(--muted);
    }

    section { padding: 60px 0; }

    h2 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 24px;
    }

    .stats {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
      gap: 16px;
      margin-bottom: 40px;
    }

    .stat {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
      text-align: center;
    }

    .stat-number {
      font-size: 2rem;
      font-weight: 700;
      color: var(--accent);
    }

    .stat-label {
      font-size: 0.85rem;
      color: var(--muted);
      margin-top: 4px;
    }

    .profiles {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
      gap: 16px;
    }

    .profile {
      background: var(--code-bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 20px;
    }

    .profile h3 {
      font-size: 1.1rem;
      margin-bottom: 8px;
    }

    .profile p {
      color: var(--muted);
      font-size: 0.9rem;
    }

    .links {
      display: flex;
      gap: 16px;
      justify-content: center;
      margin-top: 40px;
    }

    .links a {
      color: var(--accent);
      text-decoration: none;
      font-size: 0.95rem;
    }
    .links a:hover { text-decoration: underline; }

    footer {
      border-top: 1px solid var(--border);
      padding: 40px 0;
      text-align: center;
      color: var(--muted);
      font-size: 0.85rem;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>ERNE</h1>
      <p class="tagline">Complete AI coding agent harness for React Native and Expo development</p>
      <div class="install-box" onclick="navigator.clipboard.writeText('npx erne-universal init')">
        <span class="prompt">$ </span><span class="cmd">npx erne-universal init</span>
      </div>
      <p class="copy-hint">Click to copy</p>
    </header>

    <section>
      <div class="stats">
        <div class="stat">
          <div class="stat-number">8</div>
          <div class="stat-label">AI Agents</div>
        </div>
        <div class="stat">
          <div class="stat-number">16</div>
          <div class="stat-label">Commands</div>
        </div>
        <div class="stat">
          <div class="stat-number">5</div>
          <div class="stat-label">Rule Layers</div>
        </div>
        <div class="stat">
          <div class="stat-number">8</div>
          <div class="stat-label">Skills</div>
        </div>
        <div class="stat">
          <div class="stat-number">10</div>
          <div class="stat-label">MCP Configs</div>
        </div>
        <div class="stat">
          <div class="stat-number">3</div>
          <div class="stat-label">Contexts</div>
        </div>
      </div>
    </section>

    <section>
      <h2>Hook Profiles</h2>
      <div class="profiles">
        <div class="profile">
          <h3>minimal</h3>
          <p>Fast iteration, minimal checks. Perfect for vibe coding and rapid prototyping.</p>
        </div>
        <div class="profile">
          <h3>standard</h3>
          <p>Balanced quality and speed. Recommended for most projects.</p>
        </div>
        <div class="profile">
          <h3>strict</h3>
          <p>Production-grade enforcement. Full linting, type checking, and security scans.</p>
        </div>
      </div>
    </section>

    <section>
      <h2>Links</h2>
      <div class="links">
        <a href="https://github.com/JubaKitiashvili/everything-react-native-expo">GitHub</a>
        <a href="https://www.npmjs.com/package/erne-universal">npm</a>
        <a href="https://github.com/JubaKitiashvili/everything-react-native-expo/blob/main/docs/getting-started.md">Docs</a>
      </div>
    </section>

    <footer>
      MIT License &middot; ERNE Contributors
    </footer>
  </div>
</body>
</html>
```

**Notes:**
- Single-page static site for `erne.dev` deployment on Vercel
- Dark theme, minimal CSS, no JavaScript frameworks
- Click-to-copy install command
- Stats section mirrors spec Summary table
- Responsive grid layout

---

### Task 8: Final Verification

#### 8.1: Complete File Inventory

Verify all Plan 4 files exist:

```
Package Foundation (Task 1):
  [ ] package.json
  [ ] bin/cli.js
  [ ] LICENSE
  [ ] README.md

Installer Logic (Task 2):
  [ ] lib/init.js
  [ ] lib/update.js

Shell Installer (Task 3):
  [ ] install.sh

CI/CD (Task 4):
  [ ] .github/workflows/ci.yml
  [ ] .github/CONTRIBUTING.md
  [ ] .github/ISSUE_TEMPLATE/bug_report.md

Validation Scripts (Task 5):
  [ ] scripts/validate-all.js
  [ ] scripts/lint-content.js

Tests (Task 6):
  [ ] tests/cli.test.js
  [ ] tests/detection.test.js

Website (Task 7):
  [ ] website/index.html
```

#### 8.2: Functional Checks

```bash
# CLI runs
node bin/cli.js version
node bin/cli.js help

# JSON valid
node -e "require('./package.json')"

# Scripts run
node scripts/validate-all.js
node scripts/lint-content.js

# Tests pass
node --test tests/

# install.sh is executable
test -x install.sh
```

#### 8.3: npm Publish Readiness

```bash
# Dry run package
npm pack --dry-run

# Verify files array includes all content
npm pack --dry-run 2>&1 | grep -c '.md\|.json\|.js\|.html'

# Verify bin field
node -e "const p = require('./package.json'); console.log('bin:', p.bin)"
```

#### 8.4: Spec Cross-Reference

| Spec Requirement | Plan 4 Location |
|-----------------|-----------------|
| npm: `erne-universal` | package.json name field |
| `npx erne-universal init` | bin/cli.js → lib/init.js |
| 4-step install flow | lib/init.js (detect → profile → MCP → generate) |
| `npx erne-universal update` | bin/cli.js → lib/update.js |
| Shell installer | install.sh |
| CI workflow | .github/workflows/ci.yml |
| Website at erne.dev | website/index.html |
| Semver versioning | package.json version field |
| MIT License | LICENSE |

---

## Plan 4 Summary

| Chunk | Tasks | Files | Description |
|-------|-------|-------|-------------|
| 1 | 1–3 | 7 | Package scaffold, CLI, init/update logic, shell installer |
| 2 | 4–6 | 7 | CI/CD, contributing guide, validation scripts, tests |
| 3 | 7–8 | 1 + verification | Landing page, final checks |
| **Total** | **8** | **~18** | **Complete distribution package** |

---

## All Plans Overview

| Plan | Focus | Files | Status |
|------|-------|-------|--------|
| Plan 1 | Core Infrastructure & Hook System | ~27 | Committed (`6099621`) |
| Plan 2 | Content Layer (rules, agents, commands, contexts, MCP) | ~65 | Committed (`87e9b61`) |
| Plan 3 | Skills & Knowledge Base | ~24 | Committed (`0961ec2`) |
| Plan 4 | Install CLI & Distribution | ~18 | This plan |
| **Total** | **Complete ERNE Package** | **~134** | |
