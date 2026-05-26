# ERNE Monitor — Backup / Data-Export Format

This document specifies the **portable backup format** produced and consumed by
the `@erne/monitor` dashboard server. It is the on-disk interchange format used
for:

- routine backups of a self-hosted dashboard,
- moving data between two self-hosted instances,
- migrating a self-hosted instance to a future ERNE Cloud (see
  [`./oss-to-cloud.md`](./oss-to-cloud.md)).

The format is **storage-engine-agnostic**: it is the same whether the source
backend is SQLite (the default) or PostgreSQL. The dashboard's storage adapter
interface (`IMonitorStore`) is the source of truth for which tables exist; this
format serializes exactly those user-data tables.

> **Status:** the format below is the canonical shape the backup tooling
> produces, and it ships today. The dashboard-server package exposes
> `backupStore(store, outPath)` / `restoreStore(store, inPath, { mode })` plus a
> `runBackupCli(store, argv)` dispatcher (`backup <path>` /
> `restore <path> [--replace]`; default restore mode is `merge`). The
> serialised envelope is `BACKUP_FORMAT_VERSION` 1. This spec defines the
> contract that tooling honors and the format stays versioned so future schema
> changes remain importable.

## Top-level envelope

A backup is a single JSON document with a versioned envelope:

```jsonc
{
  "version": 1,
  "createdAt": "2026-05-26T12:00:00.000Z",
  "tables": {
    "events": [ /* EventRecord[] */ ],
    "sessions": [ /* SessionRecord[] */ ],
    "crash_groups": [ /* CrashGroupRecord[] */ ],
    "bug_reports": [ /* BugReportRecord[] */ ],
    "alert_rules": [ /* AlertRuleRecord[] */ ],
    "alert_history": [ /* AlertFiringRecord[] */ ],
    "symbol_files": [ /* SymbolFileRecord[] */ ],
    "ai_actions": [ /* AiActionRecord[] */ ],
    "server_settings": [ /* SettingRecord[] */ ]
  }
}
```

### Envelope fields

| Field | Type | Notes |
| ----- | ---- | ----- |
| `version` | integer | Format version. Currently `1`. Bumped only on a breaking change to the envelope or a table's record shape. Importers must reject a `version` they do not understand. |
| `createdAt` | ISO-8601 string (UTC) | When the backup was generated. Informational; not used for merge decisions. |
| `tables` | object | One key per exported table. All nine keys are always present; an empty table is `[]` (never omitted, never `null`). |

### What is and is not included

**Included** (the nine user-data / configuration tables above):
`events`, `sessions`, `crash_groups`, `bug_reports`, `alert_rules`,
`alert_history`, `symbol_files`, `ai_actions`, `server_settings`.

**Deliberately excluded:**

- **`_migrations`** — migration bookkeeping. The target instance applies its own
  migrations; copying the source's migration ledger would be wrong. (This
  mirrors the storage layer, which never touches `_migrations` during retention
  or reset.)
- **Anything not in `IMonitorStore`.** If a table is not part of the storage
  adapter contract, it is not part of the backup.

## Per-table record shapes

The record shapes below mirror the dashboard server's storage record types
(`EventRecord`, `SessionRecord`, etc.). Timestamps inside records are stored as
**epoch milliseconds** (numbers), matching the live store — only the envelope's
`createdAt` is ISO-8601. Fields marked optional may be omitted when absent.

### `events` — `EventRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key, used for dedup on import) |
| `type` | string | yes |
| `severity` | `"critical" \| "warning" \| "info" \| "success" \| "muted"` | yes |
| `sessionId` | string | yes |
| `fingerprint` | string | no |
| `timestamp` | number (epoch ms) | yes |
| `receivedAt` | number (epoch ms) | yes |
| `screen` | string | no |
| `platform` | string | no |
| `payload` | object | yes (free-form JSON) |
| `userId` | string | no |

### `sessions` — `SessionRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key) |
| `userId` | string | no |
| `startedAt` | number (epoch ms) | yes |
| `endedAt` | number (epoch ms) | no (absent = still open) |
| `platform` | string | no |
| `device` | object | no |
| `appVersion` | string | no |
| `runtimeVersion` | string | no |
| `channel` | string | no |
| `eventCount` | number | yes |
| `crashCount` | number | yes |

### `crash_groups` — `CrashGroupRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `fingerprint` | string | yes (primary key) |
| `message` | string | yes |
| `firstSeen` | number (epoch ms) | yes |
| `lastSeen` | number (epoch ms) | yes |
| `eventCount` | number | yes |
| `sessionCount` | number | yes |
| `status` | `"new" \| "investigating" \| "resolved" \| "ignored"` | yes |
| `topScreen` | string | no |
| `aiSuggestion` | object | no |

### `bug_reports` — `BugReportRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key) |
| `sessionId` | string | yes |
| `submittedAt` | number (epoch ms) | yes |
| `title` | string | no |
| `description` | string | no |
| `status` | `"new" \| "assigned" \| "resolved"` | yes |
| `assignee` | string | no |
| `attachments` | object | no |
| `eventIds` | string[] | no |

### `alert_rules` — `AlertRuleRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key) |
| `name` | string | yes |
| `metric` | string | yes |
| `threshold` | number | yes |
| `windowSeconds` | number | yes |
| `channels` | string[] | yes |
| `cooldownSeconds` | number | yes |
| `enabled` | boolean | yes |
| `createdAt` | number (epoch ms) | yes |
| `updatedAt` | number (epoch ms) | yes |

### `alert_history` — `AlertFiringRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key) |
| `ruleId` | string | yes (references `alert_rules.id`) |
| `firedAt` | number (epoch ms) | yes |
| `metricValue` | number | yes |
| `severity` | `Severity` | yes |
| `payload` | object | no |

### `symbol_files` — `SymbolFileRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key) |
| `platform` | `"ios" \| "android"` | yes |
| `bundleId` | string | yes |
| `version` | string | yes |
| `filename` | string | yes |
| `sizeBytes` | number | yes |
| `uploadedAt` | number (epoch ms) | yes |
| `entryCount` | number | yes |
| `uuid` | string \| null | yes |
| `mappingText` | string \| null | yes |

> **Size warning.** `symbol_files.mappingText` can be large (full source map /
> ProGuard mapping text). Backups that include symbol files can be substantial.
> A CLI may offer `--no-symbols` to omit `symbol_files` for a lighter export;
> the field is then exported as `[]`.

### `ai_actions` — `AiActionRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `id` | string | yes (primary key) |
| `timestamp` | number (epoch ms) | yes |
| `agent` | string | yes |
| `action` | string | yes |
| `user` | string | no |
| `fingerprint` | string | no |
| `toolsCalled` | string[] | no |
| `filesConsidered` | string[] | no |
| `confidence` | number (0–100) | no |
| `effectiveConfidence` | number (0–100) | no |
| `classification` | string | no |
| `outcome` | `AiActionOutcome` | yes |
| `prUrl` | string | no |
| `redactionLabels` | string[] | no |
| `metadata` | object | no |

### `server_settings` — `SettingRecord[]`

| Field | Type | Required |
| ----- | ---- | -------- |
| `key` | string | yes (primary key) |
| `value` | string | yes (settings are stored as strings; structured values are JSON-stringified) |
| `updatedAt` | number (epoch ms) | yes |

## Import semantics: merge vs replace

The format supports two import modes. The mode is chosen by the operator at
import time (e.g. `restore --mode merge|replace`); it is **not** stored in the
envelope.

### `replace` (default for a fresh target)

The target's user-data tables are cleared, then populated from the backup.
After a `replace` import, the target's nine exported tables contain exactly the
backup's rows.

- Equivalent to "wipe and load." Use when migrating to a brand-new instance.
- `_migrations` and any non-exported state on the target are untouched — the
  target keeps its own migration ledger and applies migrations as needed.
- This is the mode the OSS → Cloud migration uses for a clean cutover.

### `merge`

The backup's rows are inserted into the target **without clearing** existing
rows. Conflicts are resolved by primary key:

| Table | Primary key | On key conflict |
| ----- | ----------- | --------------- |
| `events` | `id` | keep existing (idempotent — matches the live store's idempotent insert) |
| `sessions` | `id` | upsert (incoming wins) |
| `crash_groups` | `fingerprint` | upsert (incoming wins) |
| `bug_reports` | `id` | upsert (incoming wins) |
| `alert_rules` | `id` | upsert (incoming wins) |
| `alert_history` | `id` | keep existing (append-only history) |
| `symbol_files` | `id` | upsert (incoming wins) |
| `ai_actions` | `id` | keep existing (idempotent audit trail) |
| `server_settings` | `key` | **operator choice** — default keep existing, so a merge does not clobber the target's configured settings |

Rationale:

- **Append-only / audit tables** (`events`, `alert_history`, `ai_actions`) treat
  a key collision as a duplicate and keep the existing row. This matches the
  live ingest pipeline, where re-sending an event id is a no-op.
- **Mutable state** (`sessions`, `crash_groups`, `bug_reports`, `alert_rules`,
  `symbol_files`) upserts so the freshest version wins.
- **`server_settings`** defaults to keep-existing because settings are
  environment-specific (endpoints, tokens, retention windows) — you rarely want
  a backup to overwrite the live config of the target.

### Referential notes

- `alert_history.ruleId` references `alert_rules.id`. When merging history
  without its rules, history rows may reference a rule that no longer exists;
  this is tolerated (history is read-only and self-describing).
- `events.sessionId` references `sessions.id`. Importers should load `sessions`
  before `events` so counters and joins resolve cleanly.

## Versioning & forward compatibility

- The envelope `version` is the contract. An importer **must** refuse a
  `version` greater than it understands (fail loud, do not silently drop fields).
- Adding an optional field to a record shape is **not** a breaking change and
  does not bump `version`.
- Renaming/removing a field, changing a field's type, adding or removing a table
  from `tables`, or changing the meaning of an existing field **is** a breaking
  change and bumps `version`. The next version should document a migration from
  the previous one in this file.

## Validation checklist for an importer

1. `version` is present, an integer, and `<= ` the importer's supported version.
2. `tables` is an object containing all nine expected keys (empty arrays allowed).
3. Each record carries its required fields with the right types.
4. Timestamps are numbers (epoch ms), not strings, inside records.
5. Sessions are applied before events.
6. The chosen mode (`merge` / `replace`) is logged, and per-table row counts are
   reported after import.
