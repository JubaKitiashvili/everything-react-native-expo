# Getting Started with ERNE

ERNE (Everything React Native Expo) is an AI coding agent harness that supercharges Claude Code for React Native and Expo development.

## Quick Install

```bash
npx erne-universal init
```

The installer will:
1. Detect your project type (Expo managed, bare RN, or both)
2. Ask you to choose a hook profile (minimal, standard, or strict)
3. Let you select MCP integrations (agent-device, GitHub, etc.)
4. Generate all configuration files in `.claude/`

### Adaptive Init System

ERNE's `init` command deep-scans your project across 15 stack dimensions — navigation, state management, styling, lists, images, forms, storage, testing, and more. Based on what it finds, it selects from 24 variant templates to generate rules, agents, and hooks tailored to your exact stack. This means a Zustand + Expo Router project gets different guidance than a Redux Toolkit + React Navigation one, with no manual configuration required.

## What Gets Installed

```
.claude/
  agents/       # 11 specialized AI agents
  rules/        # 25 coding standard rules (layered by platform)
  commands/     # 19 slash commands
  contexts/     # 3 behavior modes (dev, review, vibe)
  hooks.json    # Git-style hooks for quality enforcement
  skills/       # 7 reusable knowledge skills
  mcp-configs/  # Optional MCP server configurations
```

## First Steps

1. **Start building:** `/plan` to design a feature
2. **Write tests first:** `/tdd` for test-driven development
3. **Review code:** `/code-review` for comprehensive analysis
4. **Check performance:** `/perf` for performance profiling

## Behavior Modes

Switch contexts to change how the AI works:

- **dev** — Fast iteration, minimal ceremony
- **review** — Thorough, check everything
- **vibe** — Creative mode, experiment freely

## Hook Profiles

Control quality enforcement level:

- **minimal** — Session-start, post-edit format, continuous-learning observer, dashboard event
- **standard** — Format + typecheck + common validations
- **strict** — All checks including security, performance budgets, accessibility

Change profile: set `ERNE_PROFILE=minimal|standard|strict` in your environment.

## Learn More

- [Agents](agents.md) — How specialized agents work
- [Commands](commands.md) — All 19 slash commands
- [Hook Profiles](hooks-profiles.md) — Quality enforcement system
- [Creating Skills](creating-skills.md) — Extend ERNE with custom knowledge
