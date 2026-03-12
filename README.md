# 🏗️ ERNE — Everything React Native & Expo

> **The complete AI coding agent harness for React Native and Expo** — 11 specialized agents, adaptive stack detection, multi-agent orchestration, and a pixel-art dashboard. Every config is generated to match *your* exact project setup.

[![npm version](https://img.shields.io/npm/v/erne-universal?color=cc3534&label=npm)](https://www.npmjs.com/package/erne-universal)
[![GitHub stars](https://img.shields.io/github/stars/JubaKitiashvili/everything-react-native-expo?style=social)](https://github.com/JubaKitiashvili/everything-react-native-expo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://makeapullrequest.com)

<p align="center">
  <video src="demo-dashboard.mp4" autoplay loop muted playsinline width="800"></video>
</p>

---

## ⚡ Quick Start

```bash
npx erne-universal init
```

This will:
1. 🔍 **Deep-scan your project** — detects 15 stack dimensions (state management, navigation, styling, lists, images, forms, storage, testing, build system, component style, monorepo, New Architecture, and more)
2. 🎚️ Let you choose a hook profile (minimal / standard / strict)
3. 🔌 Select MCP integrations (simulator control, GitHub, etc.)
4. ⚙️ **Generate adaptive configuration** — selects from 24 variant templates matched to your exact stack (Zustand vs Redux, Expo Router vs React Navigation, NativeWind vs StyleSheet, etc.)

---

## 📦 What's Included

| Component | Count | Description |
|-----------|-------|-------------|
| 🤖 Agents | 11 | Specialized AI agents for architecture, development, review, testing, UI, native, orchestration |
| 🔀 Agent variants | 9 | Stack-adaptive agent configurations (StyleSheet vs NativeWind, Zustand vs Redux, etc.) |
| ⚡ Commands | 19 | Slash commands for every React Native workflow |
| 📏 Rule layers | 5 | Conditional rules: common, expo, bare-rn, native-ios, native-android |
| 🎯 Rule variants | 15 | Stack-specific rules selected by deep detection (state, navigation, styling, security, etc.) |
| 🛡️ Hook profiles | 3 | Minimal, standard, strict — quality enforcement your way |
| 📚 Skills | 7 | Reusable knowledge modules loaded on-demand |
| 🎭 Contexts | 3 | Behavior modes: dev, review, vibe |
| 🔌 MCP configs | 10 | Pre-configured server integrations |
| 📋 Workflow examples | 4 | End-to-end multi-agent workflow guides |
| 🤝 Handoff templates | 4 | Structured agent-to-agent context passing |

---

## 🎮 Agent Dashboard

ERNE includes a real-time pixel-art dashboard that visualizes all 11 agents working in an animated office environment.

```bash
erne dashboard              # Start on port 3333, open browser
erne dashboard --port 4444  # Custom port
erne dashboard --no-open    # Don't open browser
erne start                  # Init project + dashboard in background
```

**Features:**
- 🏢 4 office rooms — Development, Code Review, Testing, and Conference
- 🎨 11 animated agent sprites with walking, typing, and done animations
- 💬 Thought bubbles showing the current task above working agents
- 🖥️ Animated monitor screens (green code when working, screensaver when idle)
- 🔔 Toast notifications for agent start/complete events
- 📊 Bottom stats bar with session duration, tasks completed, working/planning counts
- 👤 Agent detail overlay with full activity history (click any agent)
- 🎯 Pipeline orchestrator coordination view in conference room
- 🔄 Real-time WebSocket updates with auto-reconnect

---

## 🎯 Multi-Agent Orchestration

ERNE supports coordinated multi-agent workflows through the pipeline orchestrator:

```bash
/orchestrate "build user profile screen"
```

**Pipeline phases:**

```
  🏗️ Plan          architect decomposes the task
       ↓
  ⚡ Implement     senior-developer + feature-builder (parallel)
       ↓
  🧪 Test          tdd-guide writes and runs tests
       ↓
  🔍 Review        code-reviewer validates with evidence
       ↓
  📊 Validate      performance-profiler checks performance
```

Features retry logic (max 3 attempts), escalation to user on persistent failures, and structured [handoff templates](docs/handoff-templates.md) for context passing between agents. See [Pipeline Documentation](docs/pipeline.md) for details.

---

## 🤖 Agents

Each agent has a distinct personality, quantified success metrics, and memory integration for cross-session learning.

| Agent | Emoji | Domain | Room |
|-------|-------|--------|------|
| **architect** | 🏗️ | System design and project structure | Development |
| **senior-developer** | 👨‍💻 | End-to-end feature implementation, screens, hooks, API | Development |
| **feature-builder** | ⚡ | Focused implementation units, works in parallel | Development |
| **native-bridge-builder** | 🌉 | Turbo Modules and native platform APIs | Development |
| **expo-config-resolver** | ⚙️ | Expo configuration and build issues | Development |
| **ui-designer** | 🎨 | Accessible, performant UI components | Development |
| **code-reviewer** | 🔍 | Code quality with evidence-based approval | Code Review |
| **upgrade-assistant** | 📦 | Version migration guidance | Code Review |
| **tdd-guide** | 🚦 | Test-driven development workflow | Testing |
| **performance-profiler** | 🏎️ | FPS diagnostics and bundle optimization | Testing |
| **pipeline-orchestrator** | 🎯 | Multi-agent workflow coordination | Conference |

---

## 💰 Token Efficiency

ERNE's architecture is designed to minimize token usage through six layered mechanisms:

| Mechanism | How it works | Savings |
|-----------|-------------|---------|
| **Profile-gated hooks** | Minimal profile runs 4 hooks instead of 16 | ~31% |
| **Conditional rules** | Only loads rules matching your project type (Expo, bare RN, native) | ~26% |
| **On-demand skills** | Skills load only when their command is invoked, not always in context | ~12% |
| **Subagent isolation** | Fresh agent per task with only its own definition + relevant rules | ~12% |
| **Task-specific commands** | 19 focused prompts instead of one monolithic instruction set | ~13% |
| **Context-based behavior** | Modes change behavior dynamically without loading new rulesets | ~3% |

**Result:** Typical workflows use **60–67% fewer tokens** compared to a naive all-in-context approach.

---

## 🛡️ Hook Profiles

| Profile | Hooks | Use Case |
|---------|-------|----------|
| `minimal` | 4 | ⚡ Fast iteration, vibe coding — maximum speed, minimum friction |
| `standard` | 12 | ⚖️ Balanced quality + speed (recommended) — catches real issues |
| `strict` | 16 | 🔒 Production-grade enforcement — full security, accessibility, perf budgets |

Change profile: set `ERNE_PROFILE` env var, add `<!-- Hook Profile: standard -->` to CLAUDE.md, or use `/vibe` context.

---

## ⚡ Commands

| Category | Commands |
|----------|----------|
| **Core** | `/plan`, `/code-review`, `/tdd`, `/build-fix`, `/perf`, `/upgrade`, `/native-module`, `/navigate`, `/code`, `/feature` |
| **Extended** | `/animate`, `/deploy`, `/component`, `/debug`, `/quality-gate` |
| **Orchestration** | `/orchestrate` |
| **Learning** | `/learn`, `/retrospective`, `/setup-device` |

---

## 🖥️ IDE & Editor Support

ERNE works with every major AI coding assistant out of the box:

| File | IDE / Tool |
|------|-----------|
| `CLAUDE.md` | Claude Code |
| `AGENTS.md` | Codex, Windsurf, Cursor, GitHub Copilot |
| `GEMINI.md` | Google Antigravity |
| `.cursorrules` | Cursor |
| `.windsurfrules` | Windsurf |
| `.github/copilot-instructions.md` | GitHub Copilot |

All config files are generated adaptively based on your project's detected stack.

---

## 🏗️ Architecture

```
Claude Code Hooks ──▶ run-with-flags.js ──▶ Profile gate ──▶ Hook scripts
                                                │
                                     ┌──────────┴──────────┐
                                     │   Only hooks for    │
                                     │   active profile    │
                                     │   are executed      │
                                     └─────────────────────┘

erne dashboard ──▶ HTTP + WS Server ──▶ Browser Canvas
                        ▲
Claude Code PreToolUse ─┤  (Agent pattern)
Claude Code PostToolUse ┘
```

**Key design principles:**
- 🪶 **Zero runtime dependencies** for the harness itself (ws package only for dashboard)
- 🎯 **Conditional loading** — rules, skills, and hooks load based on project type and profile
- 🧹 **Fresh subagent per task** — no context pollution between agent invocations
- 🔇 **Silent failure** — hooks never block Claude Code if something goes wrong

---

## 🤝 Contributing

We welcome contributions from everyone — from typo fixes to new agents and skills.

| I want to... | Start here |
|--------------|-----------|
| 🐛 Report a bug | [Bug Report](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=bug_report.md) |
| 💡 Request a feature | [Feature Request](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=feature_request.md) |
| 📚 Propose a new skill | [Skill Proposal](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=new_skill.md) |
| 🔀 Submit a PR | [Contributing Guide](CONTRIBUTING.md) |

```bash
git checkout -b feat/your-feature
npm run validate && npm test   # Must pass before PR
```

---

## 🤝 Partnerships

Skills, agents, and MCP configs are open source — anyone can add them via PR. Partnerships are for deeper collaboration:

| Partnership Type | What It Means |
|-----------------|--------------|
| **Co-Maintenance** | You keep your library's ERNE skill up to date as your API evolves |
| **Early Access** | We update ERNE before your breaking changes ship, so users never hit stale guidance |
| **Joint Promotion** | Your docs recommend ERNE for AI-assisted development, we feature you on [erne.dev](https://erne.dev) |
| **Domain Expertise** | Co-develop specialized agents that require deep knowledge of your platform |

If you maintain a React Native library, Expo tool, or developer service — [let's talk](https://github.com/JubaKitiashvili/everything-react-native-expo/issues/new?template=partnership.md).

---

## 📦 Available On

- [npm](https://www.npmjs.com/package/erne-universal) — `npx erne-universal init`
- [SkillsMP](https://skillsmp.com) — Auto-indexed from GitHub
- [BuildWithClaude](https://buildwithclaude.com) — Plugin directory
- [VoltAgent/awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) — Curated skills list

---

## 📖 Documentation

| Doc | Description |
|-----|-------------|
| [Getting Started](docs/getting-started.md) | Installation and first run |
| [Agents Guide](docs/agents.md) | All 11 agents with domains and usage |
| [Commands Reference](docs/commands.md) | All 19 slash commands |
| [Hooks & Profiles](docs/hooks-profiles.md) | Hook system and 3 profiles |
| [Creating Skills](docs/creating-skills.md) | Author your own skills |
| [Pipeline & Orchestration](docs/pipeline.md) | Multi-agent workflow coordination |
| [Memory Integration](docs/memory-integration.md) | Cross-session learning with MCP |
| [Handoff Templates](docs/handoff-templates.md) | Structured agent-to-agent context |
| [Contributing](CONTRIBUTING.md) | How to contribute |

---

## 📜 License

MIT License — use freely, commercially or personally.

---

<div align="center">

**🏗️ ERNE — Your React Native AI Dream Team 🏗️**

[⭐ Star this repo](https://github.com/JubaKitiashvili/everything-react-native-expo) · [🍴 Fork it](https://github.com/JubaKitiashvili/everything-react-native-expo/fork) · [🐛 Report an issue](https://github.com/JubaKitiashvili/everything-react-native-expo/issues) · [🌐 erne.dev](https://erne.dev)

Made with ❤️ for the React Native community

</div>
