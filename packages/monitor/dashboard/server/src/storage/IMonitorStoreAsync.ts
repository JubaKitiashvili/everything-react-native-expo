// Task 117.4 — async sibling of IMonitorStore.
//
// Same surface as the synchronous interface, with every return type
// wrapped in `Promise`. Used by the PostgreSQL adapter (and any future
// remote adapter — ClickHouse, Mongo) where there's no honest way to
// hide the async wire boundary behind a sync API.
//
// Existing wsHandler / server.ts code paths consume the sync
// `IMonitorStore` via `DashboardStore` and stay that way until a
// follow-up task migrates them. This split is deliberate: it lets the
// Postgres adapter land + ship + be tested without touching the SDK
// ingest hot path or the dashboard REST layer.
//
// Invariants:
//   - The async interface is a strict superset shape of the sync one.
//     Adapters that wrap a sync store (e.g. SqliteAsyncWrapper, future)
//     just `Promise.resolve()` around the existing methods.
//   - Methods MUST NOT introduce async-only semantics that have no
//     sync analogue — the goal is parity, not divergence.
//   - Migrations are the adapter's responsibility, same as the sync
//     interface.

import type {
  AiActionListFilter,
  AiActionRecord,
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

export interface IMonitorStoreAsync {
  // ------------------------------ Events ------------------------------
  insertEvent(event: EventRecord): Promise<{ inserted: boolean }>;
  insertEventsBatch(events: EventRecord[]): Promise<{ inserted: number; duplicates: number }>;
  hasEventId(id: string): Promise<boolean>;
  listEvents(filter?: EventListFilter): Promise<EventRecord[]>;
  countEvents(filter?: EventListFilter): Promise<number>;
  deleteEventsByUserId(userId: string): Promise<number>;
  exportUserData(userId: string): Promise<{
    userId: string;
    sessions: SessionRecord[];
    events: EventRecord[];
    exportedAt: number;
  }>;
  summariseUserData(userId: string): Promise<{
    userId: string;
    sessionCount: number;
    eventCount: number;
    crashCount: number;
    firstSeen: number | null;
    lastSeen: number | null;
    eventTypes: { type: string; count: number }[];
  }>;

  // ------------------------------ Sessions ------------------------------
  getSession(id: string): Promise<SessionRecord | null>;
  upsertSession(session: SessionRecord): Promise<void>;
  endSession(id: string, endedAt: number): Promise<void>;
  bumpSessionCounters(id: string, eventDelta: number, crashDelta: number): Promise<void>;
  listSessions(limit?: number): Promise<SessionRecord[]>;

  // ------------------------------ Crash groups ------------------------------
  upsertCrashGroup(record: CrashGroupRecord): Promise<void>;
  setCrashGroupStatus(fingerprint: string, status: CrashGroupStatus): Promise<void>;
  listCrashGroups(filter?: CrashGroupListFilter): Promise<CrashGroupRecord[]>;

  // ------------------------------ Bug reports ------------------------------
  insertBugReport(record: BugReportRecord): Promise<void>;
  updateBugReport(
    id: string,
    patch: Partial<Pick<BugReportRecord, 'status' | 'assignee' | 'title' | 'description'>>,
  ): Promise<void>;
  listBugReports(filter?: BugReportListFilter): Promise<BugReportRecord[]>;

  // ------------------------------ Alert rules ------------------------------
  saveAlertRule(rule: AlertRuleRecord): Promise<void>;
  listAlertRules(): Promise<AlertRuleRecord[]>;
  deleteAlertRule(id: string): Promise<boolean>;

  // ------------------------------ Alert history ------------------------------
  insertAlertFiring(firing: AlertFiringRecord): Promise<void>;
  listAlertHistory(filter?: AlertHistoryListFilter): Promise<AlertFiringRecord[]>;

  // ------------------------------ Symbol files ------------------------------
  saveSymbolFile(record: SymbolFileRecord): Promise<void>;
  listSymbolFiles(filter?: SymbolFileListFilter): Promise<SymbolFileRecord[]>;
  getSymbolFile(id: string): Promise<SymbolFileRecord | null>;
  deleteSymbolFile(id: string): Promise<boolean>;
  findSymbolFile(
    platform: SymbolPlatform,
    bundleId: string,
    version: string,
  ): Promise<SymbolFileRecord | null>;

  // ------------------------------ Settings ------------------------------
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
  listSettings(): Promise<{ key: string; value: string; updatedAt: number }[]>;

  // ------------------------------ AI action audit ------------------------------
  insertAiAction(record: AiActionRecord): Promise<{ inserted: boolean }>;
  listAiActions(filter?: AiActionListFilter): Promise<AiActionRecord[]>;
  countAiActions(filter?: AiActionListFilter): Promise<number>;

  // ------------------------------ Retention ------------------------------
  purgeOlderThan(cutoff: number): Promise<{
    events: number;
    sessions: number;
    bugReports: number;
    alertHistory: number;
    aiActions: number;
  }>;

  // ------------------------------ Admin ------------------------------
  resetAllUserData(): Promise<Record<string, number>>;
  listAppliedMigrations(): Promise<Array<{ version: number; name: string; appliedAt: number }>>;
  selfCheck(): Promise<{ ok: true; tables: string[] }>;
  readyCheck(): Promise<{ ready: boolean; reason?: string; migrationsApplied: number }>;
  close(): Promise<void>;
}
