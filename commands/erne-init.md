---
name: erne-init
description: ERNE — Initialize the AI agent harness in this project. Sets up 13 agents, hooks, rules, MCP servers, and dashboard. Use when user says "set up erne", "initialize erne", "install erne", or first time setup.
---

# /erne-init — Initialize ERNE

You are executing the `/erne-init` command. This sets up ERNE in the current project.

## Before Running

You MUST ask the user these questions before proceeding. Do NOT skip this step. Do NOT default silently.

### Question 1: Hook Profile

Ask the user:

> Which hook profile would you like?
>
> **a) minimal** — Fast iteration, minimal checks. For rapid prototyping.
> **b) standard** (recommended) — Balanced quality and speed. For most projects.
> **c) strict** — Production-grade enforcement. For teams requiring CI-level quality.

Wait for their response.

### Question 2: MCP Servers

Ask the user:

> ERNE can configure MCP servers for device control and GitHub integration. Configure now?
>
> **a) Yes** — Set up agent-device (simulator/emulator control) + GitHub
> **b) No** — Skip MCP setup, configure later

Wait for their response.

## Run Init

Based on their answers, construct and run the command:

```bash
npx erne-universal init --yes --profile <chosen-profile> [--no-mcp if they chose no]
```

Examples:
- User chose standard + yes to MCP: `npx erne-universal init --yes --profile standard`
- User chose strict + no to MCP: `npx erne-universal init --yes --profile strict --no-mcp`
- User chose minimal + yes to MCP: `npx erne-universal init --yes --profile minimal`

## After Init

1. Tell the user to **restart the Claude Code session** to activate MCP servers and hooks
2. Mention they can run `npx erne-universal dashboard` to launch the visual dashboard
3. List available commands: `/erne-plan`, `/erne-perf`, `/erne-doctor`, etc.
