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

## What Gets Installed

```
.claude/
  agents/       # 8 specialized AI agents
  rules/        # 25 coding standard rules (layered by platform)
  commands/     # 16 slash commands
  contexts/     # 3 behavior modes (dev, review, vibe)
  hooks.json    # Git-style hooks for quality enforcement
  skills/       # 8 reusable knowledge skills
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

- **minimal** — Only pre-commit lint
- **standard** — Format + typecheck + common validations
- **strict** — All checks including security, performance budgets, accessibility

Change profile: set `ERNE_PROFILE=minimal|standard|strict` in your environment.

## Learn More

- [Agents](agents.md) — How specialized agents work
- [Commands](commands.md) — All 16 slash commands
- [Hook Profiles](hooks-profiles.md) — Quality enforcement system
- [Creating Skills](creating-skills.md) — Extend ERNE with custom knowledge
