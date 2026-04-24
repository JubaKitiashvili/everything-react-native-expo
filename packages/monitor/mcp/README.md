# @erne/monitor-mcp

Model Context Protocol (MCP) server for the `@erne/monitor` dashboard.
Exposes crash groups, events, sessions, bug reports, and alerts as MCP
tools so Claude Desktop (or any other MCP-aware client) can query your
React Native / Expo runtime telemetry directly.

## Install

```bash
npm install -g @erne/monitor-mcp
# or run on-demand via npx (no install needed):
# npx @erne/monitor-mcp
```

Requires Node.js ≥ 20 and a running `@erne/monitor` dashboard server.
Start the dashboard first (`npx @erne/monitor dashboard`) before adding
it to Claude Desktop — the MCP process simply shells out to its REST
API.

## Configure Claude Desktop

Open **Settings → Developer → Edit Config** (or edit
`~/Library/Application Support/Claude/claude_desktop_config.json` on
macOS / `%APPDATA%\Claude\claude_desktop_config.json` on Windows) and
add:

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

Restart Claude Desktop. The 17 tools appear under the plug icon.

### Environment variables

| Variable             | Default                 | Purpose                                      |
| -------------------- | ----------------------- | -------------------------------------------- |
| `ERNE_DASHBOARD_URL` | `http://127.0.0.1:3333` | Base URL of the dashboard server REST API.   |
| `ERNE_API_KEY`       | *(unset)*               | Bearer token when the dashboard has its      |
|                      |                         | API-key gate enabled (Task 117.61).          |
| `ERNE_MCP_TIMEOUT_MS`| `10000`                 | Per-request HTTP timeout.                    |

## Tools

Seventeen read-only tools, grouped by concept:

### Operations
- **`get_health`** — dashboard liveness probe.
- **`get_readiness`** — migrations applied, WAL clean.
- **`get_queue_stats`** — ingest queue depth, backpressure counter, retries.
- **`get_settings`** — retention window, masked tokens, uptime.

### Events
- **`list_events`** — filter by time range, session, fingerprint, user, type, severity.
- **`search_events`** — substring search over `payload.message`.

### Sessions
- **`list_sessions`** — recent app-runs with event + crash counts.

### Crashes
- **`list_crash_groups`** — fingerprinted crash groups.
- **`get_top_crashes`** — top-N crashes by event count.
- **`get_crash_group`** — single group + its five most recent events.

### Bug reports
- **`list_bug_reports`** — in-app shake-to-report submissions.

### Alerts
- **`list_alert_rules`** — configured rules.
- **`list_alert_history`** — fired alert entries.

### Symbols
- **`list_symbol_files`** — uploaded dSYM / ProGuard maps.
- **`resolve_symbol`** — obfuscated frame → source frame.

### DSAR (GDPR)
- **`get_user_data_summary`** — counts + types for one user.
- **`export_user_data`** — full dump of sessions + events for one user.

Every tool is read-only. Mutations happen through the dashboard UI.

## Safety

Every string field returned to Claude passes through a first-pass
prompt-injection guard (see `src/sanitize.ts`):

- ANSI escapes and control characters stripped.
- Zero-width / directional / tag characters removed (the usual
  "invisible payload" carriers).
- `<system>`, `<tool_use>`, `<…>` tags stripped — telemetry
  can't impersonate a tool call.
- "Ignore previous instructions", "reveal the system prompt", persona
  swaps are redacted with an explicit `[redacted:jailbreak]` marker.
- User-authored fields (crash messages, bug report bodies, event
  payloads) wrapped in `<untrusted data="…">…</untrusted>` fences so
  Claude sees an explicit trust boundary.
- Long strings truncated at 8 KB to cap log-flood attacks.

A separate red-team test suite ships with Task 117.80; the code here is
the foundation it iterates on. Please file an issue if you find a
jailbreak pattern that slips through.

## Example interactions

After connecting:

> **You:** "What's the biggest crash in the last 24 hours?"
>
> *(Claude picks `get_top_crashes` with `since: Date.now() - 86_400_000, limit: 1`.)*
>
> **Claude:** "The top crash is fingerprint `fp-1`, a `TypeError:
> undefined is not an object` that hit 23 sessions across 142 events."

> **You:** "Show me bug reports submitted today that mention 'checkout'."
>
> *(Claude picks `list_bug_reports`, filters client-side.)*

> **You:** "Symbolicate `a.b.c:42` on Android 1.4.0."
>
> *(Claude picks `resolve_symbol`.)*

## Development

```bash
npm install
npm test
npm run build
```

Tests run via vitest against a stubbed `DashboardClient`. The MCP SDK
is a normal dependency — no stdio is exercised during tests.

## License

MIT
