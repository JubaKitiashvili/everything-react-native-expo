// Task 117.4 — StorageAdapter interface extracted from DashboardStore.
//
// Every dashboard-server query and mutation MUST go through this interface
// so the storage backend can be swapped (SQLite default, PostgreSQL adapter,
// future ClickHouse adapter) without touching business logic. The existing
// `DashboardStore` class in sqliteStore.ts is the canonical SQLite impl; any
// new adapter (postgresStore.ts, clickhouseStore.ts, ...) implements the
// same surface.
//
// Invariants:
//   - All methods are synchronous. Any async adapter (e.g. Postgres via
//     node-postgres) must hide the async boundary behind a connection pool
//     + write-ahead buffer so the caller sees the same synchronous API
//     `wsHandler.ts` relies on. Rationale: the ingest hot path cannot
//     await — events arrive on the same event loop the dashboard's WS
//     handler runs on, and adding `await` to every write would require
//     rewriting that entire pipeline.
//   - Mappings from rows to records happen inside the adapter. The caller
//     receives typed records; it never sees raw rows.
//   - Migrations are the adapter's responsibility. Each adapter ships its
//     own migration list + runner.

import type {
  AiActionListFilter,
  AiActionRecord,
  AlertFiringRecord,
  AlertHistoryListFilter,
  AlertRuleRecord,
  AuditLogListFilter,
  AuditLogRecord,
  BugReportListFilter,
  BugReportRecord,
  CrashGroupListFilter,
  CrashGroupRecord,
  CrashGroupStatus,
  EventListFilter,
  EventRecord,
  NotificationListFilter,
  NotificationRecord,
  SessionRecord,
  SymbolFileListFilter,
  SymbolFileRecord,
  SymbolPlatform,
} from './types.js';

/**
 * Universal storage interface for the @erne/monitor dashboard server.
 * Implementations: `DashboardStore` (SQLite, default), future
 * `PostgresStore`, future `ClickHouseStore`.
 */
export interface IMonitorStore {
  // ------------------------------ Events ------------------------------
  /**
   * Idempotent event insert. Returns `{ inserted: true }` when the row
   * is new, `{ inserted: false }` when the id was already present — the
   * ingest pipeline uses this to count duplicates (Task 117.49) and
   * skip the downstream counter bump + broadcast for retries.
   */
  insertEvent(event: EventRecord): { inserted: boolean };
  /** Batch equivalent — returns aggregate insert / duplicate counts. */
  insertEventsBatch(events: EventRecord[]): { inserted: number; duplicates: number };
  /** Fast PK probe used by the ingest dedup guard. */
  hasEventId(id: string): boolean;
  listEvents(filter?: EventListFilter): EventRecord[];
  countEvents(filter?: EventListFilter): number;

  /**
   * DSAR-safe purge: delete every event tagged with the user id, plus any
   * session fully owned by that user. Returns the count of rows removed
   * from the events table (sessions are removed transactively).
   */
  deleteEventsByUserId(userId: string): number;

  /**
   * DSAR export: every session + event owned by `userId`. Returned in the
   * shape the dashboard serialises verbatim to JSON for the data subject.
   */
  exportUserData(userId: string): {
    userId: string;
    sessions: SessionRecord[];
    events: EventRecord[];
    exportedAt: number;
  };

  /**
   * DSAR summary: counts by category for the consent viewer. Per-user
   * rollup with event-type breakdown.
   */
  summariseUserData(userId: string): {
    userId: string;
    sessionCount: number;
    eventCount: number;
    crashCount: number;
    firstSeen: number | null;
    lastSeen: number | null;
    eventTypes: { type: string; count: number }[];
  };

  // ------------------------------ Sessions ------------------------------
  getSession(id: string): SessionRecord | null;
  upsertSession(session: SessionRecord): void;
  endSession(id: string, endedAt: number): void;
  bumpSessionCounters(id: string, eventDelta: number, crashDelta: number): void;
  listSessions(limit?: number): SessionRecord[];

  // ------------------------------ Crash groups ------------------------------
  upsertCrashGroup(record: CrashGroupRecord): void;
  setCrashGroupStatus(fingerprint: string, status: CrashGroupStatus): void;
  listCrashGroups(filter?: CrashGroupListFilter): CrashGroupRecord[];

  // ------------------------------ Bug reports ------------------------------
  insertBugReport(record: BugReportRecord): void;
  updateBugReport(
    id: string,
    patch: Partial<Pick<BugReportRecord, 'status' | 'assignee' | 'title' | 'description'>>,
  ): void;
  listBugReports(filter?: BugReportListFilter): BugReportRecord[];

  // ------------------------------ Alert rules ------------------------------
  saveAlertRule(rule: AlertRuleRecord): void;
  listAlertRules(): AlertRuleRecord[];
  /** Returns true if a rule matched and was deleted, false if no-op. */
  deleteAlertRule(id: string): boolean;

  // ------------------------------ Alert history ------------------------------
  insertAlertFiring(firing: AlertFiringRecord): void;
  listAlertHistory(filter?: AlertHistoryListFilter): AlertFiringRecord[];

  // ------------------------------ Symbol files ------------------------------
  saveSymbolFile(record: SymbolFileRecord): void;
  listSymbolFiles(filter?: SymbolFileListFilter): SymbolFileRecord[];
  getSymbolFile(id: string): SymbolFileRecord | null;
  /** Returns true if a symbol file matched and was deleted, false if no-op. */
  deleteSymbolFile(id: string): boolean;
  /**
   * Find the freshest symbol artefact matching a (platform, bundleId, version)
   * signature. Used by the resolve endpoint when the client doesn't already
   * know which artefact to consult.
   */
  findSymbolFile(
    platform: SymbolPlatform,
    bundleId: string,
    version: string,
  ): SymbolFileRecord | null;

  // ------------------------------ Settings ------------------------------
  getSetting(key: string): string | null;
  setSetting(key: string, value: string): void;
  listSettings(): { key: string; value: string; updatedAt: number }[];

  // ------------------------------ AI action audit (Task 117.81) ------
  /**
   * Record one entry in the AI action audit trail. Idempotent on `id`
   * — a retry that resends the same id is a silent no-op so failed
   * REST writes can be safely re-attempted.
   */
  insertAiAction(record: AiActionRecord): { inserted: boolean };
  /** List rows newest-first, filtered by the requested predicates. */
  listAiActions(filter?: AiActionListFilter): AiActionRecord[];
  /** Count rows matching the same filter — used by paginated views. */
  countAiActions(filter?: AiActionListFilter): number;

  // ------------------------------ Operator audit log (Task 117.65) ---
  /**
   * Record one entry in the operator audit log (export / delete /
   * config-change / login / logout). Idempotent on `id` — a retry that
   * resends the same id is a silent no-op. Recording is best-effort at
   * the call site: an audit-write failure must never break the
   * underlying request.
   */
  recordAuditLog(record: AuditLogRecord): { inserted: boolean };
  /** List rows newest-first, filtered by the requested predicates. */
  listAuditLogs(filter?: AuditLogListFilter): AuditLogRecord[];
  /** Count rows matching the same filter — used by paginated views. */
  countAuditLogs(filter?: AuditLogListFilter): number;

  // ------------------------------ Notifications (Task 117.19) --------
  /**
   * Persist one in-app notification row (written by the `in-app` alert
   * channel). Idempotent on `id` — a retried delivery with the same id
   * is a silent no-op, so a re-fire can't duplicate the inbox entry.
   */
  insertNotification(record: NotificationRecord): { inserted: boolean };
  /** List notifications newest-first, optionally unread-only. */
  listNotifications(filter?: NotificationListFilter): NotificationRecord[];
  /** Mark one notification read. Returns true if a row matched. */
  markNotificationRead(id: string): boolean;
  /** Count unread rows — used by the dashboard's notification badge. */
  countUnreadNotifications(): number;

  // ------------------------------ Retention ------------------------------
  /**
   * Task 117.71 — retention purge. Deletes every time-series row older
   * than `cutoff`:
   *   - events:        `timestamp    < cutoff`
   *   - bug_reports:   `submitted_at < cutoff`
   *   - alert_history: `fired_at     < cutoff`
   *   - sessions:      `started_at   < cutoff` AND no events reference them
   *     after the events purge (so "active" sessions keep their shell even
   *     when older than retention — they still have fresh telemetry).
   *
   * Crash groups are intentionally preserved: they're aggregate state and
   * summarise what happened even after the underlying events vanish. Symbol
   * files and alert rules are configuration, not telemetry. Settings and
   * migration bookkeeping are never touched.
   *
   * Runs in a single transaction so a crash mid-purge leaves the DB in a
   * consistent state. Returns per-table delete counts so the job can log
   * what work it actually did.
   */
  purgeOlderThan(cutoff: number): {
    events: number;
    sessions: number;
    bugReports: number;
    alertHistory: number;
    aiActions: number;
  };

  // ------------------------------ Backup / restore (Task 117.70) ------
  /**
   * Dump every user-data table as raw rows keyed by table name. The rows
   * are the adapter's native column shape (snake_case for SQLite) so a
   * round-trip through `importTable` is lossless. Used by `backupStore`
   * (src/backup/backup.ts) to serialise the whole DB to a versioned JSON
   * file. Tables covered: events, sessions, crash_groups, bug_reports,
   * alert_rules, alert_history, symbol_files, ai_actions, server_settings.
   *
   * Migration bookkeeping (`_migrations`) is intentionally excluded — a
   * restore target applies its own migration list on open.
   */
  exportAllTables(): Record<string, Array<Record<string, unknown>>>;

  /**
   * Insert raw rows back into a named table. `mode: 'replace'` uses an
   * upsert (INSERT OR REPLACE) so an existing row is overwritten;
   * `mode: 'merge'` (default) uses INSERT OR IGNORE so existing rows are
   * preserved and only new ids are added — making a re-run idempotent.
   * Returns the number of rows actually written. Guards the table name
   * against an allowlist before interpolating it into SQL.
   */
  importTable(
    table: string,
    rows: Array<Record<string, unknown>>,
    mode?: 'merge' | 'replace',
  ): number;

  // ------------------------------ Admin ------------------------------
  /**
   * Nuke every user-data table. Preserves migration bookkeeping and
   * server_settings so the next request keeps working. Returns a map of
   * table → rowsDeleted.
   */
  resetAllUserData(): Record<string, number>;

  /** List applied migrations, ordered oldest first. */
  listAppliedMigrations(): Array<{ version: number; name: string; appliedAt: number }>;

  /** Sanity probe used by the health endpoint. */
  selfCheck(): { ok: true; tables: string[] };

  /**
   * Readiness probe — used by `/api/ready` and K8s/ECS/Fly.io readiness
   * checks. A store is "ready" iff:
   *   - every migration in the default migration list is applied
   *   - the storage backend is in a state where writes won't block
   *     (SQLite: WAL checkpoint clean; Postgres: connection pool healthy)
   *   - no pending initialization work remains
   *
   * Distinct from `/api/health` (liveness) — a process can be alive but
   * still applying migrations on first boot, during which new requests
   * should receive 503 until ready.
   */
  readyCheck(): { ready: boolean; reason?: string; migrationsApplied: number };

  /** Release resources. Idempotent. */
  close(): void;
}
