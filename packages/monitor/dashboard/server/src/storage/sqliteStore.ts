import Database, { type Database as Db, type Statement } from 'better-sqlite3';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import type { IMonitorStore } from './IMonitorStore.js';
import {
  type AiActionListFilter,
  type AiActionOutcome,
  type AiActionRecord,
  type AlertFiringRecord,
  type AlertHistoryListFilter,
  type AlertRuleRecord,
  type BugReportListFilter,
  type BugReportRecord,
  type BugReportStatus,
  type CrashGroupListFilter,
  type CrashGroupRecord,
  type CrashGroupStatus,
  type EventListFilter,
  type EventRecord,
  type SessionRecord,
  type Severity,
  type SymbolFileListFilter,
  type SymbolFileRecord,
  type SymbolPlatform,
} from './types.js';

export interface DashboardStoreOptions {
  /**
   * Absolute path to the SQLite file. `:memory:` for in-process only
   * (used by tests). Default: `~/.erne/monitor/dashboard.db`.
   */
  dbPath?: string;
  /**
   * When true, skip the WAL + foreign_keys pragmas. Used by the in-memory
   * tests to keep setup flat. Production defaults to WAL for durability
   * + concurrent read perf.
   */
  skipProductionPragmas?: boolean;
  /**
   * Inject a custom migrations array. Defaults to the bundled v1 schema.
   * Each migration's `up` either runs raw SQL (string) or a function that
   * gets the open db handle.
   */
  migrations?: Migration[];
}

export interface Migration {
  version: number;
  name: string;
  up: string | ((db: Db) => void);
}

const here = dirname(fileURLToPath(import.meta.url));
const SCHEMA_SQL = readFileSync(join(here, 'schema.sql'), 'utf8');

const V3_SERVER_SETTINGS_SQL = `
CREATE TABLE IF NOT EXISTS server_settings (
  key        TEXT    PRIMARY KEY,
  value      TEXT    NOT NULL,
  updated_at INTEGER NOT NULL
);
`;

const V2_SYMBOL_FILES_SQL = `
CREATE TABLE IF NOT EXISTS symbol_files (
  id            TEXT    PRIMARY KEY,
  platform      TEXT    NOT NULL,
  bundle_id     TEXT    NOT NULL,
  version       TEXT    NOT NULL,
  filename      TEXT    NOT NULL,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  uploaded_at   INTEGER NOT NULL,
  entry_count   INTEGER NOT NULL DEFAULT 0,
  uuid          TEXT,
  mapping_text  TEXT
);

CREATE INDEX IF NOT EXISTS idx_symbol_files_uploaded
  ON symbol_files (uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_symbol_files_signature
  ON symbol_files (platform, bundle_id, version, uploaded_at DESC);
`;

const V4_AI_ACTIONS_SQL = `
CREATE TABLE IF NOT EXISTS ai_actions (
  id                      TEXT    PRIMARY KEY,
  timestamp               INTEGER NOT NULL,
  agent                   TEXT    NOT NULL,
  action                  TEXT    NOT NULL,
  user                    TEXT,
  fingerprint             TEXT,
  tools_called_json       TEXT,
  files_considered_json   TEXT,
  confidence              INTEGER,
  effective_confidence    INTEGER,
  classification          TEXT,
  outcome                 TEXT    NOT NULL,
  pr_url                  TEXT,
  redaction_labels_json   TEXT,
  metadata_json           TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_actions_timestamp
  ON ai_actions (timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_agent
  ON ai_actions (agent, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_fingerprint
  ON ai_actions (fingerprint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_ai_actions_outcome
  ON ai_actions (outcome, timestamp DESC);
`;

export const DEFAULT_MIGRATIONS: readonly Migration[] = Object.freeze([
  { version: 1, name: 'initial', up: SCHEMA_SQL },
  { version: 2, name: 'symbol_files', up: V2_SYMBOL_FILES_SQL },
  { version: 3, name: 'server_settings', up: V3_SERVER_SETTINGS_SQL },
  { version: 4, name: 'ai_actions', up: V4_AI_ACTIONS_SQL },
]);

const RESET_TABLES = [
  'events',
  'sessions',
  'crash_groups',
  'bug_reports',
  'alert_rules',
  'alert_history',
  'symbol_files',
  'ai_actions',
] as const;

const RESET_TABLES_ALLOWED: ReadonlySet<string> = new Set<string>(RESET_TABLES);

export function defaultDashboardDbPath(): string {
  return join(homedir(), '.erne', 'monitor', 'dashboard.db');
}

function ensureParentDir(path: string): void {
  if (path === ':memory:') return;
  mkdirSync(dirname(path), { recursive: true });
}

function checksum(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

function hasColumn(db: Db, table: string, column: string): boolean {
  const row = db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .find((r) => (r as { name?: string }).name === column);
  return Boolean(row);
}

/**
 * Expand an `IN (...)` filter onto the clauses + params collections using
 * distinct named placeholders (`@field0`, `@field1`, ...). Keeps SQL
 * injection surface zero while letting callers filter by arbitrary-length
 * lists of enum values.
 */
function expandIn(
  field: string,
  values: readonly string[],
  clauses: string[],
  params: Record<string, unknown>,
): void {
  const placeholders: string[] = [];
  for (let i = 0; i < values.length; i++) {
    const key = `${field}${i}`;
    placeholders.push(`@${key}`);
    params[key] = values[i];
  }
  clauses.push(`${field} IN (${placeholders.join(', ')})`);
}

interface PreparedStatements {
  insertEvent: Statement;
  hasEventId: Statement;
  getSession: Statement;
  upsertSession: Statement;
  endSession: Statement;
  bumpSessionCounters: Statement;
  insertCrashGroup: Statement;
  touchCrashGroup: Statement;
  insertBugReport: Statement;
  upsertAlertRule: Statement;
  deleteAlertRule: Statement;
  insertAlertFiring: Statement;
  insertSymbolFile: Statement;
  deleteSymbolFile: Statement;
  getSymbolFileById: Statement;
  insertAiAction: Statement;
}

/**
 * Central persistent store for the @erne/monitor dashboard server.
 *
 * Wraps `better-sqlite3` with a typed, record-oriented API. All write
 * paths go through prepared statements for speed + SQL-injection safety.
 * Read paths build parameterized queries dynamically so the panels can
 * filter by type / severity / session / time range without string
 * interpolation.
 */
export class DashboardStore implements IMonitorStore {
  private readonly db: Db;
  private readonly statements: PreparedStatements;
  private closed = false;

  constructor(options: DashboardStoreOptions = {}) {
    const { dbPath = defaultDashboardDbPath(), skipProductionPragmas, migrations } = options;
    ensureParentDir(dbPath);
    this.db = new Database(dbPath);
    if (!skipProductionPragmas) {
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');
      this.db.pragma('synchronous = NORMAL');
    }
    this.runMigrations(migrations ?? DEFAULT_MIGRATIONS);
    this.statements = this.prepare();
  }

  private runMigrations(migrations: readonly Migration[]): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS _migrations (
        version    INTEGER PRIMARY KEY,
        name       TEXT    NOT NULL,
        applied_at INTEGER NOT NULL,
        checksum   TEXT    NOT NULL
      );
    `);

    const applied = this.db.prepare('SELECT version, checksum FROM _migrations').all() as Array<{
      version: number;
      checksum: string;
    }>;
    const appliedMap = new Map(applied.map((row) => [row.version, row.checksum]));

    for (const migration of migrations) {
      const body = typeof migration.up === 'string' ? migration.up : '';
      const sum = typeof migration.up === 'string' ? checksum(body) : `fn:${migration.name}`;
      const existing = appliedMap.get(migration.version);
      if (existing !== undefined) {
        if (existing !== sum) {
          throw new Error(
            `[dashboard-store] Migration v${migration.version} checksum drift — ` +
              `schema file was edited after it shipped. Bump to a new version instead.`,
          );
        }
        continue;
      }
      const run = this.db.transaction(() => {
        if (typeof migration.up === 'string') {
          this.db.exec(migration.up);
        } else {
          migration.up(this.db);
        }
        this.db
          .prepare(
            'INSERT INTO _migrations (version, name, applied_at, checksum) VALUES (?, ?, ?, ?)',
          )
          .run(migration.version, migration.name, Date.now(), sum);
      });
      run();
    }
  }

  private prepare(): PreparedStatements {
    return {
      insertEvent: this.db.prepare(
        // Task 117.49 — idempotent insert. `OR IGNORE` keeps the original
        // row when the id is already present so a retry flood produces
        // zero duplicate rows, zero counter double-bumps, and zero
        // duplicate broadcasts. Callers inspect `stmt.run().changes` to
        // know whether the event was actually new.
        `INSERT OR IGNORE INTO events
         (id, type, severity, session_id, fingerprint, timestamp, received_at, screen, platform, payload_json, user_id)
         VALUES (@id, @type, @severity, @sessionId, @fingerprint, @timestamp, @receivedAt, @screen, @platform, @payloadJson, @userId)`,
      ),
      hasEventId: this.db.prepare('SELECT 1 FROM events WHERE id = ? LIMIT 1'),
      getSession: this.db.prepare('SELECT * FROM sessions WHERE id = ?'),
      upsertSession: this.db.prepare(
        `INSERT INTO sessions
         (id, user_id, started_at, ended_at, platform, device_json, app_version, runtime_version, channel, event_count, crash_count)
         VALUES (@id, @userId, @startedAt, @endedAt, @platform, @deviceJson, @appVersion, @runtimeVersion, @channel, @eventCount, @crashCount)
         ON CONFLICT(id) DO UPDATE SET
           user_id         = excluded.user_id,
           ended_at        = COALESCE(excluded.ended_at, sessions.ended_at),
           platform        = COALESCE(excluded.platform, sessions.platform),
           device_json     = COALESCE(excluded.device_json, sessions.device_json),
           app_version     = COALESCE(excluded.app_version, sessions.app_version),
           runtime_version = COALESCE(excluded.runtime_version, sessions.runtime_version),
           channel         = COALESCE(excluded.channel, sessions.channel)`,
      ),
      endSession: this.db.prepare('UPDATE sessions SET ended_at = @endedAt WHERE id = @id'),
      bumpSessionCounters: this.db.prepare(
        `UPDATE sessions
         SET event_count = event_count + @eventDelta,
             crash_count = crash_count + @crashDelta
         WHERE id = @id`,
      ),
      insertCrashGroup: this.db.prepare(
        `INSERT INTO crash_groups
         (fingerprint, message, first_seen, last_seen, event_count, session_count, status, top_screen, ai_suggestion_json)
         VALUES (@fingerprint, @message, @firstSeen, @lastSeen, @eventCount, @sessionCount, @status, @topScreen, @aiSuggestionJson)
         ON CONFLICT(fingerprint) DO UPDATE SET
           message             = excluded.message,
           last_seen           = MAX(crash_groups.last_seen, excluded.last_seen),
           first_seen          = MIN(crash_groups.first_seen, excluded.first_seen),
           event_count         = crash_groups.event_count + excluded.event_count,
           session_count       = crash_groups.session_count + excluded.session_count,
           top_screen          = COALESCE(excluded.top_screen, crash_groups.top_screen),
           ai_suggestion_json  = COALESCE(excluded.ai_suggestion_json, crash_groups.ai_suggestion_json)`,
      ),
      touchCrashGroup: this.db.prepare(
        'UPDATE crash_groups SET status = @status WHERE fingerprint = @fingerprint',
      ),
      insertBugReport: this.db.prepare(
        `INSERT OR REPLACE INTO bug_reports
         (id, session_id, submitted_at, title, description, status, assignee, attachments_json, event_ids_json)
         VALUES (@id, @sessionId, @submittedAt, @title, @description, @status, @assignee, @attachmentsJson, @eventIdsJson)`,
      ),
      upsertAlertRule: this.db.prepare(
        `INSERT INTO alert_rules
         (id, name, metric, threshold, window_seconds, channels_json, cooldown_seconds, enabled, created_at, updated_at)
         VALUES (@id, @name, @metric, @threshold, @windowSeconds, @channelsJson, @cooldownSeconds, @enabled, @createdAt, @updatedAt)
         ON CONFLICT(id) DO UPDATE SET
           name             = excluded.name,
           metric           = excluded.metric,
           threshold        = excluded.threshold,
           window_seconds   = excluded.window_seconds,
           channels_json    = excluded.channels_json,
           cooldown_seconds = excluded.cooldown_seconds,
           enabled          = excluded.enabled,
           updated_at       = excluded.updated_at`,
      ),
      deleteAlertRule: this.db.prepare('DELETE FROM alert_rules WHERE id = ?'),
      insertAlertFiring: this.db.prepare(
        `INSERT INTO alert_history
         (id, rule_id, fired_at, metric_value, severity, payload_json)
         VALUES (@id, @ruleId, @firedAt, @metricValue, @severity, @payloadJson)`,
      ),
      insertSymbolFile: this.db.prepare(
        `INSERT INTO symbol_files
         (id, platform, bundle_id, version, filename, size_bytes, uploaded_at, entry_count, uuid, mapping_text)
         VALUES (@id, @platform, @bundleId, @version, @filename, @sizeBytes, @uploadedAt, @entryCount, @uuid, @mappingText)
         ON CONFLICT(id) DO UPDATE SET
           platform     = excluded.platform,
           bundle_id    = excluded.bundle_id,
           version      = excluded.version,
           filename     = excluded.filename,
           size_bytes   = excluded.size_bytes,
           uploaded_at  = excluded.uploaded_at,
           entry_count  = excluded.entry_count,
           uuid         = excluded.uuid,
           mapping_text = excluded.mapping_text`,
      ),
      deleteSymbolFile: this.db.prepare('DELETE FROM symbol_files WHERE id = ?'),
      getSymbolFileById: this.db.prepare('SELECT * FROM symbol_files WHERE id = ?'),
      // Task 117.81 — `INSERT OR IGNORE` matches the events idempotency
      // pattern. A retried REST write produces the same id and gets
      // collapsed silently.
      insertAiAction: this.db.prepare(
        `INSERT OR IGNORE INTO ai_actions
         (id, timestamp, agent, action, user, fingerprint,
          tools_called_json, files_considered_json,
          confidence, effective_confidence, classification,
          outcome, pr_url, redaction_labels_json, metadata_json)
         VALUES (@id, @timestamp, @agent, @action, @user, @fingerprint,
                 @toolsCalledJson, @filesConsideredJson,
                 @confidence, @effectiveConfidence, @classification,
                 @outcome, @prUrl, @redactionLabelsJson, @metadataJson)`,
      ),
    };
  }

  close(): void {
    if (this.closed) return;
    this.db.close();
    this.closed = true;
  }

  /** Expose the raw handle for tests / future read-heavy panels. */
  get raw(): Db {
    return this.db;
  }

  /** List applied migrations, ordered oldest first. */
  listAppliedMigrations(): Array<{ version: number; name: string; appliedAt: number }> {
    return (
      this.db
        .prepare('SELECT version, name, applied_at AS appliedAt FROM _migrations ORDER BY version')
        .all() as Array<{ version: number; name: string; appliedAt: number }>
    ).slice();
  }

  // ------------------------------ Events ------------------------------

  insertEvent(event: EventRecord): { inserted: boolean } {
    const result = this.statements.insertEvent.run({
      id: event.id,
      type: event.type,
      severity: event.severity,
      sessionId: event.sessionId,
      fingerprint: event.fingerprint ?? null,
      timestamp: event.timestamp,
      receivedAt: event.receivedAt,
      screen: event.screen ?? null,
      platform: event.platform ?? null,
      payloadJson: JSON.stringify(event.payload),
      userId: event.userId ?? null,
    });
    // Task 117.49 — `INSERT OR IGNORE` returns `changes=0` when the id
    // collides with an existing row. Callers use this to increment the
    // dedup stat and skip downstream side-effects (counter bump +
    // broadcast).
    return { inserted: result.changes > 0 };
  }

  insertEventsBatch(events: EventRecord[]): { inserted: number; duplicates: number } {
    let inserted = 0;
    let duplicates = 0;
    const insertMany = this.db.transaction((batch: EventRecord[]) => {
      for (const e of batch) {
        const res = this.insertEvent(e);
        if (res.inserted) inserted += 1;
        else duplicates += 1;
      }
    });
    insertMany(events);
    return { inserted, duplicates };
  }

  hasEventId(id: string): boolean {
    return this.statements.hasEventId.get(id) !== undefined;
  }

  listEvents(filter: EventListFilter = {}): EventRecord[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};

    if (filter.since !== undefined) {
      clauses.push('timestamp >= @since');
      params.since = filter.since;
    }
    if (filter.until !== undefined) {
      clauses.push('timestamp <= @until');
      params.until = filter.until;
    }
    if (filter.sessionId !== undefined) {
      clauses.push('session_id = @sessionId');
      params.sessionId = filter.sessionId;
    }
    if (filter.fingerprint !== undefined) {
      clauses.push('fingerprint = @fingerprint');
      params.fingerprint = filter.fingerprint;
    }
    if (filter.userId !== undefined) {
      clauses.push('user_id = @userId');
      params.userId = filter.userId;
    }
    if (filter.type !== undefined) {
      const types: string[] = Array.isArray(filter.type) ? filter.type : [filter.type];
      expandIn('type', types, clauses, params);
    }
    if (filter.severity !== undefined) {
      const severities: Severity[] = Array.isArray(filter.severity)
        ? filter.severity
        : [filter.severity];
      expandIn('severity', severities, clauses, params);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    params.limit = limit;
    params.offset = offset;

    const rows = this.db
      .prepare(`SELECT * FROM events ${where} ORDER BY timestamp DESC LIMIT @limit OFFSET @offset`)
      .all(params) as Array<EventRow>;

    return rows.map(rowToEvent);
  }

  countEvents(filter: EventListFilter = {}): number {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.since !== undefined) {
      clauses.push('timestamp >= @since');
      params.since = filter.since;
    }
    if (filter.until !== undefined) {
      clauses.push('timestamp <= @until');
      params.until = filter.until;
    }
    if (filter.type !== undefined) {
      const types: string[] = Array.isArray(filter.type) ? filter.type : [filter.type];
      expandIn('type', types, clauses, params);
    }
    if (filter.severity !== undefined) {
      const severities: Severity[] = Array.isArray(filter.severity)
        ? filter.severity
        : [filter.severity];
      expandIn('severity', severities, clauses, params);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const row = this.db.prepare(`SELECT COUNT(*) AS c FROM events ${where}`).get(params) as {
      c: number;
    };
    return row.c;
  }

  /**
   * DSAR-safe purge by user id. Deletes every event tagged with the user,
   * plus any session fully owned by that user. Returns the count of rows
   * removed from the `events` table (sessions are removed transactively).
   */
  deleteEventsByUserId(userId: string): number {
    const run = this.db.transaction((uid: string): number => {
      const info = this.db.prepare('DELETE FROM events WHERE user_id = ?').run(uid);
      this.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(uid);
      return Number(info.changes);
    });
    return run(userId);
  }

  /**
   * DSAR export: every session + event owned by `userId`. Returned in the
   * shape the dashboard serialises verbatim to a JSON file the operator can
   * hand to the data subject. No PII scrubbing beyond the user-id filter —
   * export is literally what the server stored.
   */
  exportUserData(userId: string): {
    userId: string;
    sessions: SessionRecord[];
    events: EventRecord[];
    exportedAt: number;
  } {
    const sessionRows = this.db
      .prepare('SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at DESC')
      .all(userId) as SessionRow[];
    const eventRows = this.db
      .prepare('SELECT * FROM events WHERE user_id = ? ORDER BY timestamp DESC LIMIT 10000')
      .all(userId) as EventRow[];
    return {
      userId,
      sessions: sessionRows.map(rowToSession),
      events: eventRows.map(rowToEvent),
      exportedAt: Date.now(),
    };
  }

  /**
   * DSAR summary: counts by category for the consent viewer. The dashboard
   * renders these as chips so operators see what's actually on file before
   * committing to an export / delete.
   */
  summariseUserData(userId: string): {
    userId: string;
    sessionCount: number;
    eventCount: number;
    crashCount: number;
    firstSeen: number | null;
    lastSeen: number | null;
    eventTypes: { type: string; count: number }[];
  } {
    const sessionStats = this.db
      .prepare(
        `SELECT COUNT(*) AS sessionCount,
                MIN(started_at) AS firstSeen,
                MAX(COALESCE(ended_at, started_at)) AS lastSeen
         FROM sessions WHERE user_id = ?`,
      )
      .get(userId) as {
      sessionCount: number;
      firstSeen: number | null;
      lastSeen: number | null;
    };
    const eventStats = this.db
      .prepare(
        `SELECT COUNT(*) AS eventCount,
                SUM(CASE WHEN type = 'crash' THEN 1 ELSE 0 END) AS crashCount
         FROM events WHERE user_id = ?`,
      )
      .get(userId) as { eventCount: number; crashCount: number };
    const typeRows = this.db
      .prepare(
        `SELECT type, COUNT(*) AS count FROM events
         WHERE user_id = ?
         GROUP BY type
         ORDER BY count DESC`,
      )
      .all(userId) as { type: string; count: number }[];
    return {
      userId,
      sessionCount: sessionStats.sessionCount,
      eventCount: eventStats.eventCount,
      crashCount: eventStats.crashCount ?? 0,
      firstSeen: sessionStats.firstSeen,
      lastSeen: sessionStats.lastSeen,
      eventTypes: typeRows,
    };
  }

  // ------------------------------ Sessions ------------------------------

  getSession(id: string): SessionRecord | null {
    const row = this.statements.getSession.get(id) as SessionRow | undefined;
    return row ? rowToSession(row) : null;
  }

  upsertSession(session: SessionRecord): void {
    this.statements.upsertSession.run({
      id: session.id,
      userId: session.userId ?? null,
      startedAt: session.startedAt,
      endedAt: session.endedAt ?? null,
      platform: session.platform ?? null,
      deviceJson: session.device ? JSON.stringify(session.device) : null,
      appVersion: session.appVersion ?? null,
      runtimeVersion: session.runtimeVersion ?? null,
      channel: session.channel ?? null,
      eventCount: session.eventCount,
      crashCount: session.crashCount,
    });
  }

  endSession(id: string, endedAt: number): void {
    this.statements.endSession.run({ id, endedAt });
  }

  bumpSessionCounters(id: string, eventDelta: number, crashDelta: number): void {
    this.statements.bumpSessionCounters.run({ id, eventDelta, crashDelta });
  }

  listSessions(limit = 50): SessionRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM sessions ORDER BY started_at DESC LIMIT ?')
      .all(limit) as SessionRow[];
    return rows.map(rowToSession);
  }

  // ------------------------------ Crash groups ------------------------------

  upsertCrashGroup(record: CrashGroupRecord): void {
    this.statements.insertCrashGroup.run({
      fingerprint: record.fingerprint,
      message: record.message,
      firstSeen: record.firstSeen,
      lastSeen: record.lastSeen,
      eventCount: record.eventCount,
      sessionCount: record.sessionCount,
      status: record.status,
      topScreen: record.topScreen ?? null,
      aiSuggestionJson: record.aiSuggestion ? JSON.stringify(record.aiSuggestion) : null,
    });
  }

  setCrashGroupStatus(fingerprint: string, status: CrashGroupStatus): void {
    this.statements.touchCrashGroup.run({ fingerprint, status });
  }

  listCrashGroups(filter: CrashGroupListFilter = {}): CrashGroupRecord[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.since !== undefined) {
      clauses.push('last_seen >= @since');
      params.since = filter.since;
    }
    if (filter.until !== undefined) {
      clauses.push('last_seen <= @until');
      params.until = filter.until;
    }
    if (filter.status !== undefined) {
      const statuses: CrashGroupStatus[] = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      expandIn('status', statuses, clauses, params);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    params.limit = limit;
    params.offset = offset;

    const rows = this.db
      .prepare(
        `SELECT * FROM crash_groups ${where} ORDER BY last_seen DESC LIMIT @limit OFFSET @offset`,
      )
      .all(params) as CrashGroupRow[];
    return rows.map(rowToCrashGroup);
  }

  // ------------------------------ Bug reports ------------------------------

  insertBugReport(record: BugReportRecord): void {
    this.statements.insertBugReport.run({
      id: record.id,
      sessionId: record.sessionId,
      submittedAt: record.submittedAt,
      title: record.title ?? null,
      description: record.description ?? null,
      status: record.status,
      assignee: record.assignee ?? null,
      attachmentsJson: record.attachments ? JSON.stringify(record.attachments) : null,
      eventIdsJson: record.eventIds ? JSON.stringify(record.eventIds) : null,
    });
  }

  updateBugReport(
    id: string,
    patch: Partial<Pick<BugReportRecord, 'status' | 'assignee' | 'title' | 'description'>>,
  ): void {
    const fields: string[] = [];
    const params: Record<string, unknown> = { id };
    for (const [key, value] of Object.entries(patch)) {
      if (value === undefined) continue;
      const column =
        key === 'assignee'
          ? 'assignee'
          : key === 'title'
            ? 'title'
            : key === 'description'
              ? 'description'
              : 'status';
      fields.push(`${column} = @${key}`);
      params[key] = value;
    }
    if (fields.length === 0) return;
    this.db.prepare(`UPDATE bug_reports SET ${fields.join(', ')} WHERE id = @id`).run(params);
  }

  listBugReports(filter: BugReportListFilter = {}): BugReportRecord[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.sessionId !== undefined) {
      clauses.push('session_id = @sessionId');
      params.sessionId = filter.sessionId;
    }
    if (filter.status !== undefined) {
      const statuses: BugReportStatus[] = Array.isArray(filter.status)
        ? filter.status
        : [filter.status];
      expandIn('status', statuses, clauses, params);
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    params.limit = limit;
    params.offset = offset;

    const rows = this.db
      .prepare(
        `SELECT * FROM bug_reports ${where} ORDER BY submitted_at DESC LIMIT @limit OFFSET @offset`,
      )
      .all(params) as BugReportRow[];
    return rows.map(rowToBugReport);
  }

  // ------------------------------ Alert rules ------------------------------

  saveAlertRule(rule: AlertRuleRecord): void {
    this.statements.upsertAlertRule.run({
      id: rule.id,
      name: rule.name,
      metric: rule.metric,
      threshold: rule.threshold,
      windowSeconds: rule.windowSeconds,
      channelsJson: JSON.stringify(rule.channels),
      cooldownSeconds: rule.cooldownSeconds,
      enabled: rule.enabled ? 1 : 0,
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt,
    });
  }

  listAlertRules(): AlertRuleRecord[] {
    const rows = this.db
      .prepare('SELECT * FROM alert_rules ORDER BY created_at ASC')
      .all() as AlertRuleRow[];
    return rows.map(rowToAlertRule);
  }

  deleteAlertRule(id: string): boolean {
    const info = this.statements.deleteAlertRule.run(id);
    return Number(info.changes) > 0;
  }

  // ------------------------------ Alert history ------------------------------

  insertAlertFiring(firing: AlertFiringRecord): void {
    this.statements.insertAlertFiring.run({
      id: firing.id,
      ruleId: firing.ruleId,
      firedAt: firing.firedAt,
      metricValue: firing.metricValue,
      severity: firing.severity,
      payloadJson: firing.payload ? JSON.stringify(firing.payload) : null,
    });
  }

  listAlertHistory(filter: AlertHistoryListFilter = {}): AlertFiringRecord[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.ruleId !== undefined) {
      clauses.push('rule_id = @ruleId');
      params.ruleId = filter.ruleId;
    }
    if (filter.since !== undefined) {
      clauses.push('fired_at >= @since');
      params.since = filter.since;
    }
    if (filter.until !== undefined) {
      clauses.push('fired_at <= @until');
      params.until = filter.until;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 100;
    params.limit = limit;

    const rows = this.db
      .prepare(`SELECT * FROM alert_history ${where} ORDER BY fired_at DESC LIMIT @limit`)
      .all(params) as AlertFiringRow[];
    return rows.map(rowToAlertFiring);
  }

  // ------------------------------ Symbol files ------------------------------

  saveSymbolFile(record: SymbolFileRecord): void {
    this.statements.insertSymbolFile.run({
      id: record.id,
      platform: record.platform,
      bundleId: record.bundleId,
      version: record.version,
      filename: record.filename,
      sizeBytes: record.sizeBytes,
      uploadedAt: record.uploadedAt,
      entryCount: record.entryCount,
      uuid: record.uuid,
      mappingText: record.mappingText,
    });
  }

  listSymbolFiles(filter: SymbolFileListFilter = {}): SymbolFileRecord[] {
    const clauses: string[] = [];
    const params: Record<string, unknown> = {};
    if (filter.platform !== undefined) {
      clauses.push('platform = @platform');
      params.platform = filter.platform;
    }
    if (filter.bundleId !== undefined) {
      clauses.push('bundle_id = @bundleId');
      params.bundleId = filter.bundleId;
    }
    if (filter.version !== undefined) {
      clauses.push('version = @version');
      params.version = filter.version;
    }
    const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
    const limit = filter.limit ?? 100;
    params.limit = limit;
    const rows = this.db
      .prepare(`SELECT * FROM symbol_files ${where} ORDER BY uploaded_at DESC LIMIT @limit`)
      .all(params) as SymbolFileRow[];
    return rows.map(rowToSymbolFile);
  }

  getSymbolFile(id: string): SymbolFileRecord | null {
    const row = this.statements.getSymbolFileById.get(id) as SymbolFileRow | undefined;
    return row ? rowToSymbolFile(row) : null;
  }

  deleteSymbolFile(id: string): boolean {
    const info = this.statements.deleteSymbolFile.run(id);
    return Number(info.changes) > 0;
  }

  /**
   * Find the freshest symbol artefact matching a (platform, bundleId, version)
   * signature. Used by the resolve endpoint when the client doesn't already
   * know which artefact to consult.
   */
  findSymbolFile(
    platform: SymbolPlatform,
    bundleId: string,
    version: string,
  ): SymbolFileRecord | null {
    const row = this.db
      .prepare(
        `SELECT * FROM symbol_files
         WHERE platform = @platform AND bundle_id = @bundleId AND version = @version
         ORDER BY uploaded_at DESC
         LIMIT 1`,
      )
      .get({ platform, bundleId, version }) as SymbolFileRow | undefined;
    return row ? rowToSymbolFile(row) : null;
  }

  // ------------------------------ Server settings ------------------------------

  getSetting(key: string): string | null {
    const row = this.db.prepare('SELECT value FROM server_settings WHERE key = ?').get(key) as
      | { value: string }
      | undefined;
    return row?.value ?? null;
  }

  setSetting(key: string, value: string): void {
    this.db
      .prepare(
        `INSERT INTO server_settings (key, value, updated_at)
         VALUES (@key, @value, @ts)
         ON CONFLICT(key) DO UPDATE SET
           value      = excluded.value,
           updated_at = excluded.updated_at`,
      )
      .run({ key, value, ts: Date.now() });
  }

  listSettings(): { key: string; value: string; updatedAt: number }[] {
    const rows = this.db
      .prepare('SELECT key, value, updated_at AS updatedAt FROM server_settings ORDER BY key')
      .all() as { key: string; value: string; updatedAt: number }[];
    return rows.slice();
  }

  // ------------------------------ AI action audit ------------------------------

  insertAiAction(record: AiActionRecord): { inserted: boolean } {
    const result = this.statements.insertAiAction.run({
      id: record.id,
      timestamp: record.timestamp,
      agent: record.agent,
      action: record.action,
      user: record.user ?? null,
      fingerprint: record.fingerprint ?? null,
      toolsCalledJson: record.toolsCalled ? JSON.stringify(record.toolsCalled) : null,
      filesConsideredJson: record.filesConsidered
        ? JSON.stringify(record.filesConsidered)
        : null,
      confidence: record.confidence ?? null,
      effectiveConfidence: record.effectiveConfidence ?? null,
      classification: record.classification ?? null,
      outcome: record.outcome,
      prUrl: record.prUrl ?? null,
      redactionLabelsJson: record.redactionLabels
        ? JSON.stringify(record.redactionLabels)
        : null,
      metadataJson: record.metadata ? JSON.stringify(record.metadata) : null,
    });
    return { inserted: Number(result.changes) > 0 };
  }

  listAiActions(filter: AiActionListFilter = {}): AiActionRecord[] {
    const { sql, params } = buildAiActionsQuery(filter);
    const limit = filter.limit ?? 100;
    const offset = filter.offset ?? 0;
    const rows = this.db
      .prepare(`SELECT * FROM ai_actions ${sql} ORDER BY timestamp DESC LIMIT @limit OFFSET @offset`)
      .all({ ...params, limit, offset }) as AiActionRow[];
    return rows.map(rowToAiAction);
  }

  countAiActions(filter: AiActionListFilter = {}): number {
    const { sql, params } = buildAiActionsQuery(filter);
    const row = this.db
      .prepare(`SELECT COUNT(*) AS c FROM ai_actions ${sql}`)
      .get(params) as { c: number };
    return row.c;
  }

  /**
   * Task 117.71 — retention purge. Runs in one transaction so a crash
   * mid-run leaves the DB consistent. Order matters: events must be
   * deleted first so the session cleanup can use the post-purge event
   * table to decide which sessions are now orphaned.
   *
   * Sessions are only deleted when they have BOTH `started_at < cutoff`
   * AND zero remaining events after the event purge. That way a long-
   * running session that has recent telemetry keeps its shell even when
   * its `started_at` is older than retention.
   */
  purgeOlderThan(cutoff: number): {
    events: number;
    sessions: number;
    bugReports: number;
    alertHistory: number;
    aiActions: number;
  } {
    const run = this.db.transaction((at: number) => {
      const eventsInfo = this.db.prepare('DELETE FROM events WHERE timestamp < ?').run(at);
      const bugReportsInfo = this.db
        .prepare('DELETE FROM bug_reports WHERE submitted_at < ?')
        .run(at);
      const alertHistoryInfo = this.db
        .prepare('DELETE FROM alert_history WHERE fired_at < ?')
        .run(at);
      // Task 117.81 — audit rows decay with the rest of telemetry. The
      // confidence-bucket store inside the agent keeps long-term
      // history; the per-action audit log is for incident response and
      // doesn't need to live longer than retention_days.
      const aiActionsInfo = this.db
        .prepare('DELETE FROM ai_actions WHERE timestamp < ?')
        .run(at);
      // Only drop sessions whose events are all gone AND are themselves
      // older than the cutoff. NOT IN (...) over the post-purge events
      // table is fine here — the table has an index on session_id.
      const sessionsInfo = this.db
        .prepare(
          `DELETE FROM sessions
             WHERE started_at < ?
               AND id NOT IN (SELECT DISTINCT session_id FROM events)`,
        )
        .run(at);
      return {
        events: Number(eventsInfo.changes),
        sessions: Number(sessionsInfo.changes),
        bugReports: Number(bugReportsInfo.changes),
        alertHistory: Number(alertHistoryInfo.changes),
        aiActions: Number(aiActionsInfo.changes),
      };
    });
    return run(cutoff);
  }

  /**
   * Nuke every user-data table — events, sessions, crash groups, bug
   * reports, alert rules + history, symbol files. Preserves the schema +
   * migration bookkeeping + server_settings themselves so the next request
   * keeps working. Returns a map of table → rowsDeleted.
   *
   * The table list is interpolated into the DELETE statement, so we guard
   * it with an allowlist. That's strictly defensive — the set is also
   * declared as a `const readonly` tuple — but the pattern stops any future
   * copy-paste from turning this into an injection point.
   */
  resetAllUserData(): Record<string, number> {
    const counts: Record<string, number> = {};
    const run = this.db.transaction(() => {
      for (const t of RESET_TABLES) {
        if (!RESET_TABLES_ALLOWED.has(t)) {
          throw new Error(`[dashboard-store] resetAllUserData: unknown table ${t}`);
        }
        const info = this.db.prepare(`DELETE FROM ${t}`).run();
        counts[t] = Number(info.changes);
      }
    });
    run();
    return counts;
  }

  /** Sanity probe used by the health endpoint in server.ts. */
  selfCheck(): { ok: true; tables: string[] } {
    const names = (
      this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .all() as Array<{ name: string }>
    ).map((r) => r.name);
    if (!hasColumn(this.db, 'events', 'payload_json')) {
      throw new Error('[dashboard-store] events.payload_json missing — migrations corrupt');
    }
    return { ok: true, tables: names };
  }

  /**
   * Readiness contract (Task 117.100): applied migration count must equal
   * the default migration list, and in WAL mode we require the checkpoint
   * to be current-enough that writes won't block. SQLite under WAL returns
   * 3 counters from `wal_checkpoint(PASSIVE)` — `busy` / `log` / `checkpointed`
   * — when `busy === 0` we know no active writer is holding the write lock.
   */
  readyCheck(): { ready: boolean; reason?: string; migrationsApplied: number } {
    const migrationsApplied = (
      this.db.prepare('SELECT COUNT(*) AS c FROM _migrations').get() as { c: number }
    ).c;
    if (migrationsApplied < DEFAULT_MIGRATIONS.length) {
      return {
        ready: false,
        reason: `migrations pending (${migrationsApplied}/${DEFAULT_MIGRATIONS.length})`,
        migrationsApplied,
      };
    }
    // `wal_checkpoint(PASSIVE)` reports [busy, log, checkpointed] — only the
    // busy flag matters for readiness. In non-WAL mode the pragma returns
    // [0, -1, -1] which is equally "not-busy."
    try {
      const result = this.db.pragma('wal_checkpoint(PASSIVE)') as Array<{
        busy: number;
        log: number;
        checkpointed: number;
      }>;
      const busy = result[0]?.busy ?? 0;
      if (busy !== 0) {
        return { ready: false, reason: 'WAL checkpoint busy', migrationsApplied };
      }
    } catch (err) {
      return {
        ready: false,
        reason: `WAL probe failed: ${(err as Error).message}`,
        migrationsApplied,
      };
    }
    return { ready: true, migrationsApplied };
  }
}

// ==== Row types + row→record mappers ===========================================

interface EventRow {
  id: string;
  type: string;
  severity: string;
  session_id: string;
  fingerprint: string | null;
  timestamp: number;
  received_at: number;
  screen: string | null;
  platform: string | null;
  payload_json: string;
  user_id: string | null;
}

function rowToEvent(row: EventRow): EventRecord {
  const record: EventRecord = {
    id: row.id,
    type: row.type,
    severity: row.severity as Severity,
    sessionId: row.session_id,
    timestamp: row.timestamp,
    receivedAt: row.received_at,
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
  if (row.fingerprint !== null) record.fingerprint = row.fingerprint;
  if (row.screen !== null) record.screen = row.screen;
  if (row.platform !== null) record.platform = row.platform;
  if (row.user_id !== null) record.userId = row.user_id;
  return record;
}

interface SessionRow {
  id: string;
  user_id: string | null;
  started_at: number;
  ended_at: number | null;
  platform: string | null;
  device_json: string | null;
  app_version: string | null;
  runtime_version: string | null;
  channel: string | null;
  event_count: number;
  crash_count: number;
}

function rowToSession(row: SessionRow): SessionRecord {
  const rec: SessionRecord = {
    id: row.id,
    startedAt: row.started_at,
    eventCount: row.event_count,
    crashCount: row.crash_count,
  };
  if (row.user_id !== null) rec.userId = row.user_id;
  if (row.ended_at !== null) rec.endedAt = row.ended_at;
  if (row.platform !== null) rec.platform = row.platform;
  if (row.device_json !== null) rec.device = JSON.parse(row.device_json) as Record<string, unknown>;
  if (row.app_version !== null) rec.appVersion = row.app_version;
  if (row.runtime_version !== null) rec.runtimeVersion = row.runtime_version;
  if (row.channel !== null) rec.channel = row.channel;
  return rec;
}

interface CrashGroupRow {
  fingerprint: string;
  message: string;
  first_seen: number;
  last_seen: number;
  event_count: number;
  session_count: number;
  status: string;
  top_screen: string | null;
  ai_suggestion_json: string | null;
}

function rowToCrashGroup(row: CrashGroupRow): CrashGroupRecord {
  const rec: CrashGroupRecord = {
    fingerprint: row.fingerprint,
    message: row.message,
    firstSeen: row.first_seen,
    lastSeen: row.last_seen,
    eventCount: row.event_count,
    sessionCount: row.session_count,
    status: row.status as CrashGroupStatus,
  };
  if (row.top_screen !== null) rec.topScreen = row.top_screen;
  if (row.ai_suggestion_json !== null) {
    rec.aiSuggestion = JSON.parse(row.ai_suggestion_json) as Record<string, unknown>;
  }
  return rec;
}

interface BugReportRow {
  id: string;
  session_id: string;
  submitted_at: number;
  title: string | null;
  description: string | null;
  status: string;
  assignee: string | null;
  attachments_json: string | null;
  event_ids_json: string | null;
}

function rowToBugReport(row: BugReportRow): BugReportRecord {
  const rec: BugReportRecord = {
    id: row.id,
    sessionId: row.session_id,
    submittedAt: row.submitted_at,
    status: row.status as BugReportStatus,
  };
  if (row.title !== null) rec.title = row.title;
  if (row.description !== null) rec.description = row.description;
  if (row.assignee !== null) rec.assignee = row.assignee;
  if (row.attachments_json !== null) {
    rec.attachments = JSON.parse(row.attachments_json) as Record<string, unknown>;
  }
  if (row.event_ids_json !== null) {
    rec.eventIds = JSON.parse(row.event_ids_json) as string[];
  }
  return rec;
}

interface AlertRuleRow {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  window_seconds: number;
  channels_json: string;
  cooldown_seconds: number;
  enabled: number;
  created_at: number;
  updated_at: number;
}

function rowToAlertRule(row: AlertRuleRow): AlertRuleRecord {
  return {
    id: row.id,
    name: row.name,
    metric: row.metric,
    threshold: row.threshold,
    windowSeconds: row.window_seconds,
    channels: JSON.parse(row.channels_json) as string[],
    cooldownSeconds: row.cooldown_seconds,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

interface AlertFiringRow {
  id: string;
  rule_id: string;
  fired_at: number;
  metric_value: number;
  severity: string;
  payload_json: string | null;
}

function rowToAlertFiring(row: AlertFiringRow): AlertFiringRecord {
  const rec: AlertFiringRecord = {
    id: row.id,
    ruleId: row.rule_id,
    firedAt: row.fired_at,
    metricValue: row.metric_value,
    severity: row.severity as Severity,
  };
  if (row.payload_json !== null) {
    rec.payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  }
  return rec;
}

interface SymbolFileRow {
  id: string;
  platform: string;
  bundle_id: string;
  version: string;
  filename: string;
  size_bytes: number;
  uploaded_at: number;
  entry_count: number;
  uuid: string | null;
  mapping_text: string | null;
}

function rowToSymbolFile(row: SymbolFileRow): SymbolFileRecord {
  return {
    id: row.id,
    platform: row.platform as SymbolPlatform,
    bundleId: row.bundle_id,
    version: row.version,
    filename: row.filename,
    sizeBytes: row.size_bytes,
    uploadedAt: row.uploaded_at,
    entryCount: row.entry_count,
    uuid: row.uuid,
    mappingText: row.mapping_text,
  };
}

interface AiActionRow {
  id: string;
  timestamp: number;
  agent: string;
  action: string;
  user: string | null;
  fingerprint: string | null;
  tools_called_json: string | null;
  files_considered_json: string | null;
  confidence: number | null;
  effective_confidence: number | null;
  classification: string | null;
  outcome: string;
  pr_url: string | null;
  redaction_labels_json: string | null;
  metadata_json: string | null;
}

function rowToAiAction(row: AiActionRow): AiActionRecord {
  const rec: AiActionRecord = {
    id: row.id,
    timestamp: row.timestamp,
    agent: row.agent,
    action: row.action,
    outcome: row.outcome as AiActionOutcome,
  };
  if (row.user !== null) rec.user = row.user;
  if (row.fingerprint !== null) rec.fingerprint = row.fingerprint;
  if (row.tools_called_json !== null) {
    rec.toolsCalled = JSON.parse(row.tools_called_json) as string[];
  }
  if (row.files_considered_json !== null) {
    rec.filesConsidered = JSON.parse(row.files_considered_json) as string[];
  }
  if (row.confidence !== null) rec.confidence = row.confidence;
  if (row.effective_confidence !== null) rec.effectiveConfidence = row.effective_confidence;
  if (row.classification !== null) rec.classification = row.classification;
  if (row.pr_url !== null) rec.prUrl = row.pr_url;
  if (row.redaction_labels_json !== null) {
    rec.redactionLabels = JSON.parse(row.redaction_labels_json) as string[];
  }
  if (row.metadata_json !== null) {
    rec.metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  }
  return rec;
}

function buildAiActionsQuery(filter: AiActionListFilter): {
  sql: string;
  params: Record<string, unknown>;
} {
  const clauses: string[] = [];
  const params: Record<string, unknown> = {};
  if (filter.since !== undefined) {
    clauses.push('timestamp >= @since');
    params.since = filter.since;
  }
  if (filter.until !== undefined) {
    clauses.push('timestamp <= @until');
    params.until = filter.until;
  }
  if (filter.agent !== undefined) {
    clauses.push('agent = @agent');
    params.agent = filter.agent;
  }
  if (filter.action !== undefined) {
    clauses.push('action = @action');
    params.action = filter.action;
  }
  if (filter.fingerprint !== undefined) {
    clauses.push('fingerprint = @fingerprint');
    params.fingerprint = filter.fingerprint;
  }
  if (filter.outcome !== undefined) {
    const list: string[] = Array.isArray(filter.outcome)
      ? filter.outcome.map((s) => String(s))
      : [String(filter.outcome)];
    const placeholders: string[] = [];
    for (let i = 0; i < list.length; i++) {
      placeholders.push(`@outcome${i}`);
      params[`outcome${i}`] = list[i];
    }
    clauses.push(`outcome IN (${placeholders.join(', ')})`);
  }
  return {
    sql: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    params,
  };
}
