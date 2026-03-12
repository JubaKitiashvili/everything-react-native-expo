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
  rules/        # 26 coding standard rules (layered by platform)
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

## Multi-Agent Orchestration

Use `/orchestrate` to coordinate agents through a 5-phase pipeline:

```
/orchestrate "build user profile screen"
```

The pipeline orchestrator decomposes the task, dispatches agents (some in parallel), and validates results. See [Pipeline Documentation](pipeline.md) for details.

## Memory Integration

ERNE agents build persistent knowledge about your project across sessions. Patterns learned by one agent (e.g., architect discovering a naming convention) are available to all other agents in future sessions. See [Memory Integration](memory-integration.md) for details.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `init` fails with "No React Native project detected" | Make sure `package.json` has `react-native` or `expo` in dependencies |
| Hooks not running | Check `ERNE_PROFILE` env var and `.claude/hooks.json` |
| Wrong variant selected | Re-run `npx erne-universal init` — it's safe to run multiple times |
| Dashboard won't start | Run `erne doctor` to check setup, ensure port 3333 is free |
| MCP server errors | Verify required tools are installed (Xcode for agent-device, etc.) |

## Learn More

- [Agents](agents.md) — How 11 specialized agents work
- [Commands](commands.md) — All 19 slash commands
- [Pipeline & Orchestration](pipeline.md) — Multi-agent workflow coordination
- [Memory Integration](memory-integration.md) — Cross-session learning
- [Hook Profiles](hooks-profiles.md) — Quality enforcement system
- [Creating Skills](creating-skills.md) — Extend ERNE with custom knowledge
