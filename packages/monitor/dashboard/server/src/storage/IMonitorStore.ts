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
  AlertFiringRecord,
  AlertHistoryListFilter,
  AlertRuleRecord,
  BugReportListFilter,
  BugReportRecord,
  CrashGroupListFilter,
  CrashGroupRecord,
  CrashGroupStatus,
  EventListFilter,
  EventRecord,
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
  insertEvent(event: EventRecord): void;
  insertEventsBatch(events: EventRecord[]): void;
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
