# Migrating from self-hosted ERNE Monitor to ERNE Cloud

> **Status: forward-looking.** ERNE Monitor is **self-hosted-by-default** today.
> A hosted "ERNE Cloud" is on the roadmap but **not yet generally available**.
> This guide describes the intended migration path so that self-hosted users can
> plan ahead and so that the backup format stays migration-ready. Nothing here
> requires you to leave self-hosted — staying self-hosted is a fully supported,
> permanent option. When ERNE Cloud ships, this document will be updated with
> exact endpoints, regions, and tooling.

## Who this is for

Teams running the open-source `@erne/monitor` dashboard server (SQLite or
PostgreSQL backend) who want to move to a managed ERNE Cloud instance to avoid
operating the backend themselves — while keeping their historical telemetry,
crash groups, alert rules, and configured settings.

## The migration in one sentence

You take a **backup** in the portable
[data-export format](./data-export-format.md) from your self-hosted instance,
hand it to ERNE Cloud, and Cloud performs a **`replace` import** into a fresh
hosted instance — then you repoint your apps' transport endpoint at Cloud.

## Before you start

- **Read the format spec.** The migration moves exactly the nine tables in
  [`data-export-format.md`](./data-export-format.md). Understanding what is and
  is not in that envelope sets correct expectations for what transfers.
- **Know your backend.** The export is engine-agnostic, so it does not matter
  whether you're on SQLite or PostgreSQL — both produce the same backup shape.
- **Check your retention.** Only data still within your configured retention
  window exists to export. If you want a longer history in Cloud, widen
  retention (or pause the retention job) before taking the final backup.
- **Inventory your settings.** `server_settings` carries environment-specific
  values (endpoints, tokens, retention windows). Some of these are meaningful
  only on your self-hosted box and should **not** be carried into Cloud verbatim
  (see "What does not transfer").

## What transfers

Everything in the backup envelope transfers — the nine user-data /
configuration tables:

| Transfers | Notes |
| --------- | ----- |
| `events` | Full time-series telemetry within retention |
| `sessions` | Session shells + counters; sessions load before events on import |
| `crash_groups` | Aggregate crash state, status (new/investigating/resolved/ignored), AI suggestions |
| `bug_reports` | Shake-to-report submissions, status, assignees, attachments metadata |
| `alert_rules` | Your alerting configuration |
| `alert_history` | Past firings (append-only) |
| `symbol_files` | dSYM / ProGuard / source-map artefacts (can be large) |
| `ai_actions` | The AI Fix PR / MCP audit trail |
| `server_settings` | Carried in the export, but **selectively applied** on import — see below |

## What does **not** transfer

- **Migration bookkeeping (`_migrations`).** Cloud runs its own schema
  migrations. The source's migration ledger is intentionally excluded from the
  backup format and is never imported.
- **Environment-specific settings, in practice.** Although `server_settings` is
  in the export, a Cloud import treats settings as **keep-existing by default**
  (the format's `merge` rule for `server_settings`). On a `replace` import into a
  fresh Cloud instance, Cloud applies only the settings that make sense in the
  hosted environment and ignores host-only ones (local file paths, your
  self-hosted bind address, your own retention-job cron, etc.). Re-enter
  Cloud-relevant settings (alert channel webhooks, notification targets) in the
  Cloud console after migration.
- **Anything outside the storage adapter.** Files on your server's disk that the
  dashboard does not track in one of the nine tables (e.g. raw uploads kept
  outside the symbol store, custom scripts, reverse-proxy config) do not
  transfer. Re-create those in Cloud as needed.
- **In-flight buffers.** Events still sitting in a client's offline queue or in
  the server's write-ahead buffer at the moment of export are not in the backup.
  See "Avoiding gaps" below.

## Recommended cutover sequence

This sequence minimizes both downtime and data loss.

### 1. Provision Cloud (no traffic yet)

Create the Cloud instance. Do not repoint any apps yet.

### 2. Seed Cloud with a first backup (bulk load)

Take a backup from self-hosted and `replace`-import it into the empty Cloud
instance. This moves the bulk of your history while your apps are still sending
to self-hosted.

```bash
# illustrative — exact CLI names are finalized when Cloud ships
erne-monitor backup --out ./erne-backup.json
# upload ./erne-backup.json to Cloud; Cloud runs a `replace` import
```

### 3. Dual-write or short freeze (your choice)

Two strategies for the gap between the seed backup and the final cutover:

- **Short freeze (simplest).** Briefly stop the self-hosted ingest (or accept
  that the last few minutes of events will be reconciled by a delta backup),
  take a **second** backup, and `merge`-import it into Cloud. Because `events`,
  `alert_history`, and `ai_actions` import idempotently by primary key, the
  overlap with the seed backup is safe — duplicates are dropped.
- **Dual-write (zero gap, more effort).** Point apps at both endpoints during the
  transition so Cloud receives live traffic while you finish reconciling
  history. Event ids are stable, so the eventual delta `merge` still dedups
  cleanly.

### 4. Repoint apps

Change the client transport endpoint (`config.transport.endpoint`) to the Cloud
URL and ship it (OTA update for the JS layer, or a release if your endpoint is
baked at build time). From here, new telemetry flows to Cloud.

### 5. Verify

- Compare per-table row counts reported by the Cloud import against your
  self-hosted counts (within the retention window and accounting for the delta).
- Confirm crash-group statuses, alert rules, and the AI action audit trail look
  correct in the Cloud console.
- Confirm new events from a test device land in Cloud.

### 6. Decommission self-hosted (after a soak)

Keep the self-hosted instance read-only for a soak period (a week is a
reasonable default) before tearing it down, so you can fall back if needed.

## Downtime expectations

- **Bulk seed (step 2):** zero app-facing downtime — apps still talk to
  self-hosted.
- **Cutover (steps 3–4):**
  - *Short-freeze strategy:* a brief ingest pause on self-hosted (typically
    minutes) while you take and apply the delta backup; clients buffer offline
    and drain on retry, so you generally lose **no events**, only delay them.
  - *Dual-write strategy:* effectively zero ingest downtime.
- **Dashboard availability:** the Cloud console is available as soon as the seed
  import completes; the self-hosted dashboard stays up throughout.

## Avoiding gaps and duplicates

- **Duplicates are handled for you.** `events`, `alert_history`, and
  `ai_actions` dedup by primary key on import, so re-importing overlapping data
  (seed + delta) does not double-count. This is the same idempotency the live
  ingest pipeline relies on.
- **Gaps are avoided by client buffering.** `@erne/monitor`'s transport is
  offline-first with retry, so events generated during a short ingest freeze are
  buffered on-device and drained once the new endpoint is live — provided you
  repoint within the client's buffer/retention window.

## Rollback

The migration is designed to be reversible until you decommission self-hosted:

1. **Repoint apps back** to the self-hosted endpoint (OTA / release). Because
   self-hosted was kept read-only and online during the soak, it immediately
   resumes ingest.
2. **Reconcile Cloud-only data (optional).** If Cloud accumulated events after
   cutover that you want back on self-hosted, take a backup **from Cloud** and
   `merge`-import it into self-hosted. The same idempotent-by-id rules apply, so
   the merge is safe.
3. **No destructive step is required to roll back** before decommission — the
   seed/delta imports never deleted your self-hosted data.

The only point of no easy return is **step 6 (decommission)**. Do not tear down
self-hosted until you have verified Cloud and completed the soak.

## Summary

| Phase | Self-hosted | Cloud | App traffic |
| ----- | ----------- | ----- | ----------- |
| Provision | live | empty | → self-hosted |
| Seed (`replace`) | live | bulk-loaded | → self-hosted |
| Delta (`merge`) | brief freeze *or* dual-write | reconciled | → self-hosted (or both) |
| Repoint | read-only | live | → Cloud |
| Soak | read-only (fallback) | live | → Cloud |
| Decommission | torn down | live | → Cloud |

For the exact bytes that move, see
[`./data-export-format.md`](./data-export-format.md).

---

⚠️ **Verify before publishing / before Cloud GA:** the final CLI command names
(`erne-monitor backup` / `restore`), the Cloud import UI, supported regions, and
any Cloud-side data-residency guarantees are placeholders until ERNE Cloud
ships. Update this guide with concrete details at GA.
