---
name: erne-init
description: Initialize ERNE — the AI agent harness for React Native & Expo projects. Sets up 13 specialized agents, hook-based code quality enforcement, MCP server integrations, and a visual dashboard. Triggers on "set up erne", "initialize erne", "install erne", "configure agents", "add erne to project", or any first-time ERNE setup request. Always use this skill when the user wants to set up ERNE, even if they don't say "init" explicitly.
---

# Initialize ERNE

ERNE is an AI agent harness for React Native and Expo. Setting it up involves choosing a few preferences and then running a single CLI command. The reason you need to ask the user before running is that the CLI's interactive prompts don't work reliably in Claude Code — so you handle the interaction here in conversation instead.

## Step 1: Ask preferences

Before running anything, ask the user two things in a single message:

**Profile:** ERNE uses hook profiles to control how much code quality checking happens automatically. Ask which one they'd like:
- **minimal** — Almost no automated checks. Good for quick prototyping or when you just want the agents without guardrails.
- **standard** — Catches common issues (formatting, console.logs, platform-specific bugs) without slowing things down. This is what most people pick.
- **strict** — Adds security scanning, accessibility checks, and test gates. Good for production apps or teams.

**MCP servers:** ERNE can configure agent-device (controls iOS Simulator and Android Emulator for screenshots, taps, navigation) and GitHub integration. Ask if they want these set up now or later.

Wait for the user to respond before continuing.

## Step 2: Run the init command

Once you have their preferences, run this in Bash:

```bash
npx erne-universal@latest init --yes --profile <profile> [--no-mcp]
```

Replace `<profile>` with their choice (minimal, standard, or strict). Add `--no-mcp` only if they said no to MCP servers.

The `--yes` flag is important — it tells the CLI to skip its own interactive prompts since you already gathered the preferences.

## Step 3: Launch the dashboard

After init completes, start the dashboard:

```bash
npx erne-universal dashboard &
```

The dashboard runs in the background. Read the output to find which port it started on (usually 3333, but it auto-selects a free port if 3333 is taken).

If the dashboard needs to install dependencies on first run (takes about 2 minutes), tell the user it's installing and will open in the browser when ready.

## Step 4: Tell the user what happened

Summarize in a clear message:
- What was set up (agents, hooks, rules, skills, MCP servers)
- The dashboard URL (e.g., http://localhost:3333)
- That they need to **restart this Claude Code session** for MCP servers and hooks to activate
- A few commands they can try after restart:
  - `/erne-plan` — plan a new feature
  - `/erne-perf` — profile performance issues
  - `/erne-doctor` — check project health
  - `/erne-code-review` — review code quality
  - Type `/erne-` and press Tab to see all commands
