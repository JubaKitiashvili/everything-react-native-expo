# @erne/monitor — Dashboard Server

Node HTTP + SQLite backend for the local `@erne/monitor` dashboard.
Built to be launched by `npx @erne/monitor dashboard` (Task 114).

## Scripts

```bash
npm install
npm run build        # tsc → dist/
npm run typecheck    # tsc --noEmit
npm test             # vitest run (storage layer + migrations)
npm run lint         # ESLint 9 flat config
npm run format       # Prettier write
```

## Storage

- `src/storage/schema.sql` — canonical DDL. v1 migration. Never edit
  in-place; add v2 migrations for new columns/indices.
- `src/storage/sqliteStore.ts` — typed wrapper over `better-sqlite3`
  with prepared statements, batch inserts in transactions, filter-aware
  read methods, and a checksum-guarded migrations runner.
- Default file: `~/.erne/monitor/dashboard.db` (created on first use).
  Tests use `:memory:`.

## Tables

| Table           | Purpose                                                 |
| --------------- | ------------------------------------------------------- |
| `events`        | Every monitor event, with payload as JSON               |
| `sessions`      | Per-app-run identity, with event/crash counters         |
| `crash_groups`  | Fingerprint-aggregated crashes + status + AI suggestion |
| `bug_reports`   | Shake-submitted reports, attachments, status, assignee  |
| `alert_rules`   | User-configured alert definitions                       |
| `alert_history` | Fired-alert audit log                                   |
| `_migrations`   | Applied-migration registry with per-version checksum    |

## Server

`src/server.ts` exports `createDashboardServer` and `startDashboardServer`.
The shell today serves static assets from `../public/` and a read-only
REST surface (`/api/health`, `/api/events`, `/api/sessions`,
`/api/crash-groups`, `/api/alert-rules`, `/api/bug-reports`). WebSocket
ingest lands in Task 95; the CLI wrapper lands in Task 114.
