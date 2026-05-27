---
title: MCP integration
description: Let Claude (and any MCP-aware client) query your @erne/monitor telemetry, and open AI fix PRs from crash data.
---

`@erne/monitor` ships a Model Context Protocol (MCP) server that exposes your
dashboard's telemetry — crash groups, events, sessions, bug reports, alerts,
symbols, and DSAR data — as MCP tools. Claude Desktop (or any MCP-aware client)
can then query your React Native / Expo runtime data directly. A separate,
confidence-gated **AI Fix PR agent** can turn a crash group into a pull request.

## Prerequisites

- Node.js ≥ 20.
- A running `@erne/monitor` dashboard server — start it first with
  `npx @erne/monitor dashboard` (see [Self-hosting](/self-hosting/)). The MCP
  server shells out to the dashboard's REST API; it doesn't talk to the SDK or
  the device directly.

## Configure Claude Desktop

Open **Settings → Developer → Edit Config** (or edit
`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS /
`%APPDATA%\Claude\claude_desktop_config.json` on Windows) and add:

```json
{
  "mcpServers": {
    "erne-monitor": {
      "command": "npx",
      "args": ["-y", "@erne/monitor-mcp"],
      "env": {
        "ERNE_DASHBOARD_URL": "http://127.0.0.1:3333",
        "ERNE_API_KEY": ""
      }
    }
  }
}
```

Restart Claude Desktop. The tools appear under the plug icon.

### Environment variables

| Variable              | Default                 | Purpose                                                      |
| --------------------- | ----------------------- | ------------------------------------------------------------ |
| `ERNE_DASHBOARD_URL`  | `http://127.0.0.1:3333` | Base URL of the dashboard server REST API.                   |
| `ERNE_API_KEY`        | *(unset)*               | Bearer token when the dashboard's API-key gate is enabled.   |
| `ERNE_MCP_TIMEOUT_MS` | `10000`                 | Per-request HTTP timeout.                                    |

## Tools

The server exposes a focused catalogue of tools — all but one are **read-only**.
Each tool does one thing (narrow inputs) so Claude picks the right one quickly.

### Operations

- **`get_health`** — dashboard liveness probe.
- **`get_readiness`** — migrations applied, store ready.
- **`get_queue_stats`** — ingest queue depth, backpressure counter, retries.
- **`get_settings`** — retention window, masked tokens, uptime.

### Events

- **`list_events`** — filter by time range, session, fingerprint, user, type,
  severity.
- **`search_events`** — substring search over `payload.message`.

### Sessions

- **`list_sessions`** — recent app-runs with event + crash counts.

### Crashes

- **`list_crash_groups`** — fingerprinted crash groups.
- **`get_top_crashes`** — top-N crashes by event count.
- **`get_crash_group`** — a single group plus its five most recent events.
- **`acknowledge_crash_group`** — *write*: move a group from `new` to
  `investigating`. The only mutating tool; the server refuses write tools unless
  the operator explicitly grants write permission.

### Bug reports

- **`list_bug_reports`** — in-app shake-to-report submissions.

### Alerts

- **`list_alert_rules`** — configured rules.
- **`list_alert_history`** — fired-alert entries.

### Symbols

- **`list_symbol_files`** — uploaded dSYM / ProGuard maps.
- **`resolve_symbol`** — resolve an obfuscated frame to its source frame.

### DSAR (GDPR)

- **`get_user_data_summary`** — counts + types for one user.
- **`export_user_data`** — full dump of sessions + events for one user.

## Example interactions

> **You:** "What's the biggest crash in the last 24 hours?"
>
> *Claude picks `get_top_crashes` with `since: Date.now() - 86_400_000, limit: 1`.*

> **You:** "Show me bug reports submitted today that mention 'checkout'."
>
> *Claude picks `list_bug_reports` and filters.*

> **You:** "Symbolicate `a.b.c:42` on Android 1.4.0."
>
> *Claude picks `resolve_symbol`.*

## Prompt-injection safety

Telemetry is attacker-influenced data — a crash message or bug-report body can
contain anything. Every string field returned to Claude passes through a
first-pass prompt-injection guard before it leaves the server:

- ANSI escapes and control characters are stripped.
- Zero-width / directional / tag characters (the usual "invisible payload"
  carriers) are removed.
- `<system>`, `<tool_use>`, and other `<…>` tags are stripped — telemetry can't
  impersonate a tool call.
- "Ignore previous instructions", "reveal the system prompt", and persona swaps
  are redacted with an explicit `[redacted:jailbreak]` marker.
- User-authored fields (crash messages, bug-report bodies, event payloads) are
  wrapped in `<untrusted data="…">…</untrusted>` fences so Claude sees an explicit
  trust boundary.
- Long strings are truncated to cap log-flood attacks.

## Audit trail

Tool calls can optionally write one row to the dashboard's `ai_actions` audit
table — off by default (local dev doesn't need it), opt-in for shared
deployments:

```ts
import { createMcpServer } from '@erne/monitor-mcp';

createMcpServer({
  dashboardUrl: 'http://127.0.0.1:3333',
  apiKey: process.env.ERNE_API_KEY,
  audit: true, // emit one row per tool call
  onAuditError: (err, toolName) => {
    // surface write failures (audit emission is best-effort and never blocks Claude)
  },
});
```

Each row records the agent (`mcp-server`), the action (`invoke-tool:<name>`), the
outcome (`invoked` / `errored`), the tool name, and any sanitiser labels that
triggered on Claude's args.

## AI Fix PR agent

Beyond read access, a separate confidence-gated agent (`@erne/monitor-ai-fix-pr`)
can turn a crash group into a pull request. Given a crash-group fingerprint it
pulls the crash context from the dashboard, asks Claude for a candidate fix, and
opens a PR via the GitHub API. Its confidence decays automatically based on
whether your team merges or rejects each proposal.

```bash
ANTHROPIC_API_KEY=sk-ant-...               \
GITHUB_TOKEN=ghp_...                       \
ERNE_REPO_OWNER=acme                       \
ERNE_REPO_NAME=mobile-app                  \
ERNE_DASHBOARD_URL=http://127.0.0.1:3333   \
npx @erne/monitor-ai-fix-pr fp-abcdef01
```

It requires a running dashboard, an Anthropic API key, and a GitHub token with
write access on the target repo. The CLI prints a JSON result and exits `0` on a
proposed fix, `1` when it skips. Nothing in the agent mutates production data
outside of creating the GitHub PR, and the SDK's `ai.autoFix` /
`ai.maxFilesPerFix` settings bound its behaviour (see
[SDK configuration](/sdk-configuration/)).

## Next steps

- [Self-hosting](/self-hosting/) — run the dashboard the MCP server talks to.
- [Getting started](/getting-started/) — get telemetry flowing in the first
  place.
