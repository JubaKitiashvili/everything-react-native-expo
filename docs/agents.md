# ERNE Agents

Agents are specialized AI personas with focused expertise. Each agent has specific knowledge areas and behavioral guidelines.

## Available Agents

| Agent | Specialty | Used By Commands |
|-------|-----------|-----------------|
| architect | System design, navigation, file structure | /plan, /navigate |
| senior-developer | End-to-end feature implementation, screens, hooks, API, state | /code, /feature, /plan |
| feature-builder | Focused feature units, works in parallel with senior-developer | /feature, /code, /component |
| code-reviewer | Code quality, best practices, security | /code-review, /quality-gate, /deploy |
| tdd-guide | Test-driven development, testing patterns | /tdd, /component |
| performance-profiler | FPS, memory, bundle size, animations | /perf, /quality-gate, /debug |
| ui-designer | NativeWind, Reanimated, components | /animate, /component |
| native-bridge-builder | Swift/Kotlin bridges, Expo Modules | /native-module |
| expo-config-resolver | EAS, app.config, build fixes | /build-fix, /deploy |
| upgrade-assistant | Version migrations, breaking changes | /upgrade |
| pipeline-orchestrator | Multi-agent pipeline coordination, workflow sequencing | /orchestrate |

## How Agents Work

Agents are defined in `.claude/agents/` as markdown files with frontmatter:

```yaml
---
name: agent-name
description: What this agent does
---
```

The content of the agent file provides the agent's system prompt — its expertise, guidelines, and behavioral rules.

## Agent Orchestration

Commands can use agents in three patterns:

1. **Single agent** — One agent handles the task (e.g., `/plan` uses architect)
2. **Parallel agents** — Multiple agents work simultaneously (e.g., `/code-review` runs code-reviewer + performance-profiler)
3. **Sequential agents** — One agent feeds into another (e.g., `/native-module` runs native-bridge-builder then code-reviewer)

## Customizing Agents

You can modify agent behavior by editing their files in `.claude/agents/`. Changes take effect immediately — no restart needed.
