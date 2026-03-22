---
name: erne-worker
description: ERNE — Autonomous ticket execution — polls a provider, picks up ready tickets, and runs the full ERNE pipeline (validate, plan, code, test, review, PR).
---

# /erne-worker — Autonomous Ticket Execution

## Usage

```bash
erne worker --config <path-to-worker.json>
```

## Options

| Flag | Description |
|------|-------------|
| `--config <path>` | Path to worker configuration JSON (required) |
| `--dry-run` | Fetch tickets and print them without executing |
| `--once` | Process one ticket and exit |

## Pipeline Steps

1. **Poll** — Fetch ready tickets from the configured provider
2. **Validate** — Check ticket has enough detail (title, description, acceptance criteria)
3. **Confidence Score** — Estimate likelihood of autonomous success (0-100)
4. **Context Resolve** — Load project stack, audit data, and relevant files
5. **Plan** — Generate implementation plan from ticket + context
6. **Execute** — Run Claude Code in an isolated git worktree
7. **Test** — Run test suite, verify no regressions
8. **Self-Review** — Automated code review against ERNE standards
9. **Health Delta** — Compare audit score before/after
10. **PR** — Create pull request with full summary and link to ticket

## Supported Providers

- **clickup** — ClickUp tasks (API token + list ID)
- **github** — GitHub Issues (repo + labels)
- **linear** — Linear issues (API key + team)
- **jira** — Jira issues (API token + project)
- **local** — JSON file with ticket definitions (for testing)

## Configuration Reference

See `worker.example.json` at the project root for a full example. Key sections:

- `provider` — Type, credentials, poll interval, filters
- `repo` — Local path, base branch, remote
- `erne` — Hook profile, quality gates, confidence threshold
- `log` — File path and log level

## Examples

```bash
# Dry run to see available tickets
erne worker --config worker.json --dry-run

# Process one ticket and stop
erne worker --config worker.json --once

# Continuous polling mode
erne worker --config worker.json
```
