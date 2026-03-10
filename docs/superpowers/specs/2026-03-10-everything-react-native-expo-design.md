# everything-react-native-expo — Design Specification

**Date:** 2026-03-10
**Status:** Approved
**Approach:** Build fresh, using everything-claude-code (ecc) as architectural reference

## Overview

A complete AI coding agent harness for React Native and Expo development. Universal toolkit usable by any RN/Expo/mobile developer — from vibe coders to production teams.

Inspired by [everything-claude-code](https://github.com/affaan-m/everything-claude-code) but purpose-built for mobile development workflows.

### Key Decisions

| Decision | Choice |
|----------|--------|
| Name | everything-react-native-expo (npm: `erne-universal`, CLI short name: `erne`) |
| Scope | Universal — all RN/Expo/mobile developers |
| Components | Full harness: agents, commands, skills, rules, hooks, continuous learning, MCP |
| Rule layering | Hybrid: common/ + expo/ + bare-rn/ + native-ios/ + native-android/ |
| Hook profiles | minimal / standard / strict |
| Distribution | GitHub + npm + Claude Code plugin + landing website |
| Documentation | English only |

---

## Section 1: Project Structure

```
everything-react-native-expo/
├── package.json                    # npm: "erne-universal"
├── install.sh                      # Multi-target installer (claude/cursor)
├── README.md
├── LICENSE                         # MIT
├── .github/
│   ├── workflows/ci.yml
│   └── CONTRIBUTING.md
│
├── agents/                         # 8 specialized agents
│   ├── architect.md
│   ├── code-reviewer.md
│   ├── tdd-guide.md
│   ├── performance-profiler.md
│   ├── native-bridge-builder.md
│   ├── expo-config-resolver.md
│   ├── ui-designer.md
│   └── upgrade-assistant.md
│
├── commands/                       # 16 slash commands
│   ├── plan.md
│   ├── code-review.md
│   ├── tdd.md
│   ├── build-fix.md
│   ├── perf.md
│   ├── upgrade.md
│   ├── native-module.md
│   ├── navigate.md
│   ├── animate.md
│   ├── deploy.md
│   ├── component.md
│   ├── debug.md
│   ├── learn.md
│   ├── quality-gate.md
│   ├── retrospective.md
│   └── setup-device.md
│
├── rules/                          # Hybrid layering
│   ├── common/                     # Always active (TS/React/RN)
│   │   ├── coding-style.md
│   │   ├── patterns.md
│   │   ├── performance.md
│   │   ├── testing.md
│   │   ├── security.md
│   │   ├── navigation.md
│   │   ├── state-management.md
│   │   ├── git-workflow.md
│   │   └── development-workflow.md
│   ├── expo/                       # Expo managed workflow
│   │   ├── coding-style.md
│   │   ├── patterns.md
│   │   ├── security.md
│   │   └── testing.md
│   ├── bare-rn/                    # Bare React Native
│   │   ├── coding-style.md
│   │   ├── patterns.md
│   │   ├── security.md
│   │   └── testing.md
│   ├── native-ios/                 # Swift/Objective-C
│   │   ├── coding-style.md
│   │   ├── patterns.md
│   │   ├── security.md
│   │   └── testing.md
│   └── native-android/             # Kotlin/Java
│       ├── coding-style.md
│       ├── patterns.md
│       ├── security.md
│       └── testing.md
│
├── skills/                         # Reusable knowledge
│   ├── react-native-unified/       # Core RN/Expo skill (45 references)
│   │   ├── SKILL.md
│   │   └── references/
│   ├── continuous-learning-v2/     # Auto skill generation (self-contained)
│   │   ├── config.json
│   │   ├── agent-prompts/          # Prompt templates for analysis (NOT top-level agents)
│   │   ├── hook-templates/         # Hook snippet templates (NOT top-level hooks)
│   │   └── scripts/               # Observation + analysis scripts
│   ├── tdd-workflow/
│   ├── coding-standards/
│   ├── security-review/
│   ├── performance-optimization/
│   ├── native-module-scaffold/
│   └── upgrade-workflow/
│
├── hooks/
│   ├── hooks.json                  # Hook definitions with profile flags
│   └── profiles/
│       ├── minimal.json
│       ├── standard.json
│       └── strict.json
│
├── contexts/                       # Behavior modes
│   ├── dev.md                      # Build fast, iterate
│   ├── review.md                   # Thorough, careful
│   └── vibe.md                     # Creative, experimental
│
├── mcp-configs/                    # Optional MCP server configs
│   ├── agent-device.json           # [Recommended] Simulator/emulator control
│   ├── github.json                 # [Recommended] PR management
│   ├── supabase.json
│   ├── firebase.json
│   ├── figma.json
│   ├── sentry.json
│   ├── expo-api.json
│   ├── appstore-connect.json
│   ├── play-console.json
│   └── memory.json
│
├── scripts/
│   └── hooks/                      # Hook implementation scripts
│       ├── run-with-flags.js
│       ├── session-start.js
│       ├── post-edit-format.js
│       ├── post-edit-typecheck.js
│       ├── check-console-log.js
│       ├── check-platform-specific.js
│       ├── check-reanimated-worklet.js
│       ├── check-expo-config.js
│       ├── bundle-size-check.js
│       ├── pre-commit-lint.js
│       ├── pre-edit-test-gate.js
│       ├── security-scan.js
│       ├── performance-budget.js
│       ├── native-compat-check.js
│       ├── accessibility-check.js
│       ├── continuous-learning-observer.js
│       └── evaluate-session.js
│
├── examples/
│   ├── CLAUDE.md.expo-managed
│   ├── CLAUDE.md.bare-rn
│   └── CLAUDE.md.monorepo
│
├── schemas/
│   ├── hooks.schema.json
│   └── plugin.schema.json
│
├── tests/
│   └── hooks/
│
├── docs/
│   ├── getting-started.md
│   ├── agents.md
│   ├── commands.md
│   ├── hooks-profiles.md
│   └── creating-skills.md
│
└── website/
    └── index.html
```

### Rule Activation Logic

```
CLAUDE.md imports:
  rules/common/*          <- always
  rules/expo/*            <- if app.json or expo config detected
  rules/bare-rn/*         <- if no expo config, has ios/ and android/ dirs
  rules/native-ios/*      <- if ios/ dir contains Swift files
  rules/native-android/*  <- if android/ dir contains Kotlin files
```

**Ambiguous project handling:**

| Scenario | Detection | Rules Applied |
|----------|-----------|---------------|
| Ejected Expo (has both app.json AND ios/android dirs with native code) | `expo` package in dependencies = Expo project | expo/ + native layers (expo takes priority over bare-rn) |
| Mixed Swift + Objective-C | Any `.swift` file in ios/ | native-ios/ (covers both; ObjC bridging is addressed in patterns.md) |
| Mixed Kotlin + Java | Any `.kt` file in android/ | native-android/ (covers both; Java interop in patterns.md) |
| Monorepo | Each package scanned independently | Per-package rule activation; shared common/ only |
| No clear signals | No app.json, no ios/android dirs | common/ only + warning to user to configure manually |

---

## Section 2: Agents

8 specialized agents with parallel execution support.

### Agent Specifications

| Agent | Trigger | Capabilities |
|-------|---------|-------------|
| **architect** | `/plan`, `/navigate` | Feature decomposition, navigation design (Expo Router), state management selection (Zustand/Jotai/TanStack Query), API layer planning, monorepo structure |
| **code-reviewer** | `/code-review`, `/quality-gate` | Re-render detection, RN anti-pattern detection, platform parity checks, Expo SDK usage validation, accessibility audit |
| **tdd-guide** | `/tdd` | Jest + RNTL setup, test-first workflow, Detox E2E scaffolding, mock native modules, coverage enforcement |
| **performance-profiler** | `/perf`, `/debug` | FPS measurement, TTI analysis, bundle size breakdown, memory leak detection, Reanimated worklet validation, Hermes bytecode analysis |
| **native-bridge-builder** | `/native-module` | Turbo Module scaffolding (Swift + Kotlin), Expo Modules API, Fabric component creation, platform-specific impl templates |
| **expo-config-resolver** | `/build-fix`, `/deploy` | EAS Build error diagnosis, app.json/app.config.ts validation, config plugin debugging, provisioning profile issues, Gradle/CocoaPods fixes |
| **ui-designer** | `/component`, `/animate` | NativeWind v5 styling, Reanimated animations, Gesture Handler interactions, expo-ui (SwiftUI/Jetpack Compose), responsive layouts |
| **upgrade-assistant** | `/upgrade` | Expo SDK migration, React Native version upgrades, breaking change detection, dependency compatibility matrix, codemod suggestions |

### Orchestration Patterns

Agents support both sequential and parallel execution via Claude Code's Agent tool.

**Parallel execution (independent tasks):**
- `/code-review` → code-reviewer + performance-profiler simultaneously
- `/quality-gate` → code-reviewer + performance-profiler simultaneously
- `/component` → ui-designer + tdd-guide simultaneously
- `/deploy` → expo-config-resolver + code-reviewer simultaneously

**Sequential execution (dependent tasks):**
- `/plan` → architect (must complete) → tdd-guide (needs architecture)
- `/native-module` → native-bridge-builder (create) → code-reviewer (validate)

**Orchestration flow for common workflows:**

```
New Feature:    architect → tdd-guide → [implement] → code-reviewer
Performance:    performance-profiler → [fix] → performance-profiler (verify)
Native Work:    native-bridge-builder → code-reviewer
Build Error:    expo-config-resolver → [fix] → verify build
UI Task:        ui-designer + tdd-guide (parallel) → code-reviewer
Upgrade:        upgrade-assistant → code-reviewer → tdd-guide (verify tests)
Pre-Merge:      code-reviewer + performance-profiler (parallel)
```

---

## Section 3: Rules

### common/ — Universal RN/TypeScript Rules (Always Active)

| File | Key Rules |
|------|-----------|
| `coding-style.md` | TypeScript strict mode, functional components only, named exports, barrel files banned, path aliases (`@/`), file naming conventions |
| `patterns.md` | Atomic state (Zustand/Jotai over Redux), colocation, custom hooks for shared logic, compound components pattern |
| `performance.md` | Memoization guidelines (React.memo, useMemo, useCallback), FlatList over ScrollView, avoid inline styles in loops, image optimization (expo-image), bundle size budgets |
| `testing.md` | Jest + React Native Testing Library, test behavior not implementation, mock native modules, snapshot tests only for smoke checks |
| `security.md` | No secrets in JS bundle, secure storage for tokens (expo-secure-store), certificate pinning, input sanitization, deep link validation |
| `navigation.md` | Expo Router file-based conventions, typed routes, layout nesting, modal patterns, deep linking structure |
| `state-management.md` | Zustand for client state, TanStack Query for server state, avoid prop drilling beyond 2 levels, context only for truly global concerns |
| `git-workflow.md` | Conventional commits, branch naming, PR size limits, changeset requirements |
| `development-workflow.md` | Dev client over Expo Go for native modules, EAS Build for CI, preview builds for QA |

### expo/ — Expo Managed Workflow Rules

| File | Key Rules |
|------|-----------|
| `coding-style.md` | Use Expo SDK modules over community alternatives, config plugins over manual native edits |
| `patterns.md` | App config patterns, EAS Update OTA strategies, config plugin authoring, Expo Modules API |
| `security.md` | EAS Secrets for env vars, expo-secure-store, update signing |
| `testing.md` | Detox with EAS Build, expo-dev-client testing patterns |

### bare-rn/ — Bare React Native Workflow Rules

| File | Key Rules |
|------|-----------|
| `coding-style.md` | Manual native project management, Podfile/Gradle conventions, autolinking |
| `patterns.md` | Native module registration, Turbo Module boilerplate, Fabric component patterns |
| `security.md` | ProGuard/R8 configuration, iOS keychain direct usage, native certificate pinning |
| `testing.md` | Native unit tests (XCTest/JUnit) alongside JS tests, E2E with Detox bare setup |

### native-ios/ — Swift/Objective-C Rules

| File | Key Rules |
|------|-----------|
| `coding-style.md` | Swift conventions, protocol-oriented design, @objc exposure, SwiftUI integration (expo-ui) |
| `patterns.md` | Turbo Module Swift implementation, ExpoModulesCore View patterns, bridging headers |
| `security.md` | Keychain Services API, App Transport Security, code signing |
| `testing.md` | XCTest for native modules, XCUITest for UI testing |

### native-android/ — Kotlin/Java Rules

| File | Key Rules |
|------|-----------|
| `coding-style.md` | Kotlin-first, coroutines over callbacks, Jetpack Compose integration (expo-ui) |
| `patterns.md` | Turbo Module Kotlin implementation, Fabric ViewManager, Gradle plugin conventions |
| `security.md` | Android Keystore, R8/ProGuard rules for RN, network security config |
| `testing.md` | JUnit5 + Espresso for native modules, Compose testing |

---

## Section 4: Hooks & Profiles

### Hook Lifecycle Points

| Event | When | Purpose |
|-------|------|---------|
| `PreToolUse` | Before any tool executes | Gate dangerous operations, enforce standards |
| `PostToolUse` | After a tool completes | Auto-format, type-check, validate output |
| `Stop` | When Claude finishes a response | Session evaluation, quality checks |
| `PreCompact` | Before context compression | Save critical state |
| `SessionStart` | New session begins | Load project context, detect project type |
| `SessionEnd` | Session closes | Log metrics, save learnings |

### Profile: minimal (vibe coders, rapid prototyping)

| Hook | What It Does |
|------|-------------|
| `session-start.js` | Auto-detect project type (Expo/bare-RN), load correct rules |
| `post-edit-format.js` | Auto-format on save (Prettier) |
| `continuous-learning-observer.js` | Passively observe patterns for skill generation |

Type-check, lint, and test gates are **skipped** for speed.

### Profile: standard (default, balanced)

Everything in minimal, plus:

| Hook | What It Does |
|------|-------------|
| `post-edit-typecheck.js` | Run `tsc --noEmit` on edited files |
| `check-console-log.js` | Warn on console.log in production code |
| `check-platform-specific.js` | Verify Platform.OS checks have both iOS + Android cases |
| `pre-commit-lint.js` | ESLint + Prettier check before commit |
| `bundle-size-check.js` | Warn if dependency significantly increases bundle |
| `check-reanimated-worklet.js` | Warn when worklets reference non-serializable JS |
| `check-expo-config.js` | Validate app.json/app.config.ts after config changes |

### Profile: strict (production teams, CI)

Everything in standard, plus:

| Hook | What It Does |
|------|-------------|
| `pre-edit-test-gate.js` | Require related tests to pass before accepting edits |
| `security-scan.js` | Check for secrets, unsafe patterns, unvalidated deep links |
| `performance-budget.js` | Enforce FPS, TTI, and bundle size budgets |
| `native-compat-check.js` | Verify native code compiles for both platforms |
| `accessibility-check.js` | Enforce a11y labels on touchable elements |

### Profile Selection

Users set their profile in CLAUDE.md:
```markdown
<!-- Hook Profile: standard -->
```

Or via environment variable: `ERNE_PROFILE=strict`

**Precedence (highest wins):**
1. `ERNE_PROFILE` env var (explicit user override)
2. Context preamble (e.g., `vibe` sets minimal)
3. CLAUDE.md `<!-- Hook Profile: ... -->` comment
4. Default: `standard`

Hook definitions reference profiles:
```jsonc
{
  "hooks": [
    {
      "event": "PostToolUse",
      "pattern": "Edit|Write",
      "command": "node scripts/hooks/run-with-flags.js post-edit-typecheck.js",
      "profiles": ["standard", "strict"]
    }
  ]
}
```

### Hook Error Handling

| Behavior | Description |
|----------|-------------|
| **Exit codes** | Exit 0 = pass, exit 1 = fail (block action), exit 2 = warning (log but continue) |
| **Timeout** | All hooks have a 30-second timeout. On timeout, treated as exit 2 (warning). |
| **Blocking vs advisory** | `PreToolUse` hooks are **blocking** (exit 1 prevents the action). `PostToolUse`/`Stop` hooks are **advisory** (exit 1 logs error but doesn't undo the action). |
| **Crash recovery** | If a hook script crashes (unhandled exception), treated as exit 2. Hook runner logs the stack trace to `.claude/logs/hooks.log`. |
| **Profile mismatch** | If a hook's `profiles` array doesn't include the active profile, the hook is silently skipped (not an error). |

---

## Section 5: Skills, Commands, Contexts & MCP Configs

### Skills

**Tier 1 — Core (bundled):**

| Skill | Source | Purpose |
|-------|--------|---------|
| `react-native-unified/` | Merged skill (45 references) | Comprehensive RN/Expo knowledge base |
| `continuous-learning-v2/` | Adapted from ecc | Auto-generate skills from usage patterns |
| `tdd-workflow/` | Adapted from ecc | Test-driven development (Jest + RNTL + Detox) |
| `coding-standards/` | New | Enforce rules in actionable workflow |
| `security-review/` | Adapted from ecc | Mobile security audit |
| `performance-optimization/` | New | Step-by-step perf diagnosis |
| `native-module-scaffold/` | New | Turbo Module / Expo Module creation wizard |
| `upgrade-workflow/` | New | Guided version migration |

**Tier 2 — Generated (by continuous learning):**
Auto-created from observed patterns (e.g., team always uses expo-image, recurring Reanimated errors).

**Tier 3 — Community (user-contributed):**
Templates in `examples/` for custom skills.

### 16 Slash Commands

| Command | Agents | Parallel? | Purpose |
|---------|--------|-----------|---------|
| `/plan` | architect | No | Design feature architecture |
| `/code-review` | code-reviewer + performance-profiler | Yes | Full code review |
| `/tdd` | tdd-guide | No | Test-first development |
| `/build-fix` | expo-config-resolver | No | Fix build failures |
| `/perf` | performance-profiler | No | Performance profiling |
| `/upgrade` | upgrade-assistant | No | Version migration |
| `/native-module` | native-bridge-builder -> code-reviewer | Sequential | Create native modules |
| `/navigate` | architect | No | Navigation design |
| `/animate` | ui-designer | No | Implement animations |
| `/deploy` | expo-config-resolver + code-reviewer | Yes | Validate and submit |
| `/component` | ui-designer + tdd-guide | Yes | Design + test component |
| `/debug` | performance-profiler | No | Systematic diagnosis |
| `/learn` | *script-driven* | No | Manual skill generation (runs continuous-learning-v2 scripts directly) |
| `/quality-gate` | code-reviewer + performance-profiler | Yes | Pre-merge checks |
| `/retrospective` | *script-driven* | No | Session analysis, suggest harness improvements (runs evaluate-session.js) |
| `/setup-device` | *script-driven* | No | Install and configure agent-device MCP (runs setup script) |

### Contexts (Behavior Modes)

| Context | Behavior |
|---------|----------|
| **dev** | Build fast, iterate. Minimal ceremony. Skip comprehensive tests. Ship working prototype first. |
| **review** | Thorough, careful. Check edge cases, validate types, verify platform parity. No shortcuts. |
| **vibe** | Creative mode. Experiment freely, prioritize UX feel over code perfection. Auto-sets minimal hook profile. |

### Context Activation

Contexts are activated via Claude Code's context system (`/context` or `--context` flag). Only one context is active at a time.

**Context–profile interaction:**

| Context | Effect on Hook Profile |
|---------|----------------------|
| `dev` | No override — uses project's configured profile |
| `review` | No override — uses project's configured profile |
| `vibe` | Sets `ERNE_PROFILE=minimal` for the session via context preamble |

The `vibe.md` context file contains a preamble that exports `ERNE_PROFILE=minimal` before any hooks run. This means vibe mode always uses the minimal hook set regardless of what's configured in CLAUDE.md. Users can still override manually by setting `ERNE_PROFILE` explicitly after context activation.

**Precedence (highest to lowest):**
1. Explicit `ERNE_PROFILE` env var set by user in shell
2. Context preamble (e.g., vibe sets minimal)
3. CLAUDE.md comment (`<!-- Hook Profile: standard -->`)
4. Default: `standard`

### MCP Server Configs

**Recommended (pre-checked in installer):**

| Config | Server | Purpose |
|--------|--------|---------|
| `agent-device.json` | agent-device | Control iOS Simulator and Android Emulator (screenshots, tap, type, swipe, navigate) |
| `github.json` | GitHub MCP | PR management, issue tracking, code search |

**Optional:**

| Config | Server | Purpose |
|--------|--------|---------|
| `supabase.json` | Supabase MCP | Backend-as-a-service |
| `firebase.json` | Firebase MCP | Analytics, push notifications, crashlytics |
| `figma.json` | Figma MCP | Design-to-code, extract styles and assets |
| `sentry.json` | Sentry MCP | Crash reporting, performance monitoring |
| `expo-api.json` | Custom | EAS Build status, update channels |
| `appstore-connect.json` | Custom | iOS submission, TestFlight |
| `play-console.json` | Custom | Android submission |
| `memory.json` | Memory MCP | Persistent cross-session knowledge |

### agent-device Smart Integration

When agent-device is installed, commands gain visual capabilities:

| Command | Without agent-device | With agent-device |
|---------|---------------------|-------------------|
| `/debug` | Log analysis, code inspection | + Screenshot, tap through repro steps |
| `/perf` | Bundle/code analysis | + Measure actual FPS, capture jank |
| `/component` | Generate code + tests | + Render on device, screenshot verification |
| `/deploy` | Config validation | + Launch preview build, verify before submit |
| `/build-fix` | Analyze build logs | + Verify fix by building and launching |

Commands check for agent-device availability at runtime and degrade gracefully when unavailable.

---

## Section 6: Distribution & Install

### Distribution Channels

| Channel | How | Audience |
|---------|-----|----------|
| GitHub | `git clone` + `install.sh` | Full control |
| npm | `npx erne-universal init` | Quick setup |
| Claude Code Plugin | Plugin registry | One-click install |
| Website | `erne.tools` or similar | Discovery, docs |

### Install Flow

```
npx erne-universal init
```

**Step 1 — Detect project type:**
```
Scanning project...
  OK app.json found -> Expo managed workflow
  OK ios/ contains Swift files -> iOS native rules enabled
  OK android/ contains Kotlin files -> Android native rules enabled
```

**Step 2 — Choose profile:**
```
Select hook profile:
  (a) minimal  - fast iteration, minimal checks
  (b) standard - balanced quality + speed [recommended]
  (c) strict   - production-grade enforcement
```

**Step 3 — Select MCP integrations:**
```
Recommended MCP servers:
  [x] agent-device - Control iOS Simulator & Android Emulator
  [x] GitHub - PR management, issue tracking

Optional MCP servers:
  [ ] Supabase
  [ ] Firebase
  [ ] Figma
  [ ] Sentry
```

**Step 4 — Generate config:**
```
Generated:
  OK .claude/CLAUDE.md (with correct rule imports)
  OK .claude/AGENTS.md
  OK .claude/hooks.json (standard profile)
  OK .claude/commands/ (16 commands linked)
  OK .claude/mcp-configs/ (selected servers)

Done! Run /plan to start your first feature.
```

### Versioning

Follows semver. Install script pins version in `package.json`. Updates via `npx erne-universal update`.

---

## Summary

| Component | Count |
|-----------|-------|
| Agents | 8 |
| Commands | 16 |
| Rule layers | 5 (common, expo, bare-rn, native-ios, native-android) |
| Rule files | 25 total |
| Hook profiles | 3 (minimal, standard, strict) |
| Hook scripts | 17 |
| Core skills | 8 |
| Contexts | 3 |
| MCP configs | 10 |
| Example templates | 3 |
