---
name: erne-update
description: ERNE — Update ERNE itself to the latest version and re-initialize the project
---

# /erne-update — Update ERNE

You are executing the `/erne-update` command. This updates the ERNE harness to the latest npm version and re-applies configuration to the current project.

## Process

Run the following command:

```bash
npx erne-universal@latest update
```

This will:
1. Check npm for the latest `erne-universal` version
2. Compare with the currently installed version
3. If newer, re-run `erne init` preserving existing profile and MCP selections
4. Update agents, skills, rules, hooks, and commands to the latest versions

## When No Update Available

If already on the latest version, inform the user and show the current version.

## Manual Alternative

If the update command fails, suggest:

```bash
npx erne-universal@latest init
```

This does a fresh init that preserves user choices (profile, MCP servers).
