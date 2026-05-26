// Task 117.4 — PostgreSQL adapter for IMonitorStoreAsync.
//
// Mirrors `DashboardStore`'s SQLite behaviour against a Postgres
// backend. Two design notes worth reading before changing anything:
//
//   1. BIGINT columns (every monotonic ms timestamp) round-trip
//      through Node as `string` by default, because JS numbers can't
//      hold 64-bit ints safely. We coerce them back to `number` at
//      the row-mapper boundary — fine for current epoch ms, careful
//      with anything that crosses Number.MAX_SAFE_INTEGER (year
//      ~287396 AD; not our problem).
//
//   2. `IN (...)` filters need positional `$N` placeholders generated
//      on the fly because pg doesn't expand arrays for us. The
//      `inExpansion` helper handles that, threading the running
//      placeholder index through the SQL builder.
//
// Migrations: applied via `bootstrap()`; checksum-verified against
// `_migrations` so a partially-applied schema is detected on restart.

import { createHash } from 'node:crypto';
import type { IMonitorStoreAsync } from './IMonitorStoreAsync.js';
import type { PgClient } from './pgClient.js';
import {
  POSTGRES_BOOKKEEPING_SQL,
  POSTGRES_DEFAULT_MIGRATIONS,
  POSTGRES_RESET_TABLES,
  type PostgresMigration,
} from './postgresSchema.js';
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
  type NotificationListFilter,
  type NotificationRecord,
  type SessionRecord,
  type Severity,
  type SymbolFileListFilter,
  type SymbolFileRecord,
  type SymbolPlatform,
} from './types.js';

export interface PostgresStoreOptions {
  client: PgClient;
  /** Override migration list — used by tests. */
  migrations?: readonly PostgresMigration[];
  /** Inject `now()` for deterministic migration timestamps. */
  now?: () => number;
}

export class PostgresStore implements IMonitorStoreAsync {
  private readonly client: PgClient;
  private readonly migrations: readonly PostgresMigration[];
  private readonly now: () => number;
  private bootstrapped = false;
  private appliedMigrationCount = 0;

  constructor(options: PostgresStoreOptions) {
    this.client = options.client;
    this.migrations = options.migrations ?? POSTGRES_DEFAULT_MIGRATIONS;
    this.now = options.now ?? Date.now;
  }

  /**
   * Apply the bookkeeping table + every pending migration. Idempotent;
   * the `_migrations` row's checksum lets us detect drift between the
   * declared SQL and what was actually applied last time.
   */
  async bootstrap(): Promise<void> {
    if (this.bootstrapped) return;
    await this.client.query(POSTGRES_BOOKKEEPING_SQL);
    const applied = await this.client.query<{ version: number; checksum: string }>(
      'SELECT version, checksum FROM _migrations ORDER BY version ASC',
    );
    const appliedMap = new Map(applied.rows.map((r) => [Number(r.version), r.checksum]));
    let count = 0;
    for (const m of this.migrations) {
      const want = checksum(m.up);
      const have = appliedMap.get(m.version);
      if (have === want) {
        count += 1;
        continue;
      }
      if (have && have !== want) {
        throw new Error(
          `migration ${m.version} (${m.name}) checksum drift: applied=${have} declared=${want}`,
        );
      }
      await this.client.withTransaction(async (tx) => {
        await tx.query(m.up);
        await tx.query(
          'INSERT INTO _migrations(version, name, applied_at, checksum) VALUES ($1, $2, $3, $4)',
          [m.version, m.name, this.now(), want],
        );
      });
      count += 1;
    }
    this.appliedMigrationCount = count;
    this.bootstrapped = true;
  }

  // ------------------------------ Events ------------------------------

  async insertEvent(event: EventRecord): Promise<{ inserted: boolean }> {
    const result = await this.client.query(
      `INSERT INTO events (
        id, type, severity, session_id, fingerprint, timestamp,
        received_at, screen, platform, payload_json, user_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO NOTHING`,
      [
        event.id,
        event.type,
        event.severity,
        event.sessionId,
        event.fingerprint ?? null,
        event.timestamp,
        event.receivedAt,
        event.screen ?? null,
        event.platform ?? null,
        JSON.stringify(event.payload),
        event.userId ?? null,
      ],
    );
    return { inserted: (result.rowCount ?? 0) > 0 };
  }

  async insertEventsBatch(events: EventRecord[]): Promise<{ inserted: number; duplicates: number }> {
    let inserted = 0;
    let duplicates = 0;
    await this.client.withTransaction(async (tx) => {
      for (const event of events) {
        const result = await tx.query(
          `INSERT INTO events (
            id, type, severity, session_id, fingerprint, timestamp,
            received_at, screen, platform, payload_json, user_id
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (id) DO NOTHING`,
          [
            event.id,
            event.type,
            event.severity,
            event.sessionId,
            event.fingerprint ?? null,
            event.timestamp,
            event.receivedAt,
            event.screen ?? null,
            event.platform ?? null,
            JSON.stringify(event.payload),
            event.userId ?? null,
          ],
        );
        if ((result.rowCount ?? 0) > 0) inserted += 1;
        else duplicates += 1;
      }
    });
    return { inserted, duplicates };
  }

  async hasEventId(id: string): Promise<boolean> {
    const result = await this.client.query('SELECT 1 FROM events WHERE id = $1 LIMIT 1', [id]);
    return result.rows.length > 0;
  }

  async listEvents(filter: EventListFilter = {}): Promise<EventRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM events');
    applyEventFilter(builder, filter);
    builder.orderBy('timestamp DESC');
    if (filter.limit !== undefined) builder.limit(filter.limit);
    if (filter.offset !== undefined) builder.offset(filter.offset);
    const result = await this.client.query<EventRow>(builder.text(), builder.params());
    return result.rows.map(rowToEvent);
  }

  async countEvents(filter: EventListFilter = {}): Promise<number> {
    const builder = new SqlBuilder('SELECT COUNT(*)::int AS count FROM events');
    applyEventFilter(builder, filter);
    const result = await this.client.query<{ count: number }>(builder.text(), builder.params());
    return Number(result.rows[0]?.count ?? 0);
  }

  async deleteEventsByUserId(userId: string): Promise<number> {
    const result = await this.client.withTransaction(async (tx) => {
      const eventResult = await tx.query('DELETE FROM events WHERE user_id = $1', [userId]);
      // Sessions only get dropped when no events for any other user
      // remain — same rule as the SQLite implementation.
      await tx.query(
        `DELETE FROM sessions s
         WHERE s.user_id = $1
           AND NOT EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id)`,
        [userId],
      );
      return eventResult.rowCount ?? 0;
    });
    return result;
  }

  async exportUserData(userId: string): Promise<{
    userId: string;
    sessions: SessionRecord[];
    events: EventRecord[];
    exportedAt: number;
  }> {
    const sessionResult = await this.client.query<SessionRow>(
      'SELECT * FROM sessions WHERE user_id = $1 ORDER BY started_at DESC',
      [userId],
    );
    const eventResult = await this.client.query<EventRow>(
      'SELECT * FROM events WHERE user_id = $1 ORDER BY timestamp DESC',
      [userId],
    );
    return {
      userId,
      sessions: sessionResult.rows.map(rowToSession),
      events: eventResult.rows.map(rowToEvent),
      exportedAt: this.now(),
    };
  }

  async summariseUserData(userId: string): Promise<{
    userId: string;
    sessionCount: number;
    eventCount: number;
    crashCount: number;
    firstSeen: number | null;
    lastSeen: number | null;
    eventTypes: { type: string; count: number }[];
  }> {
    const sessionAgg = await this.client.query<{
      session_count: number;
      crash_count: number;
    }>(
      'SELECT COUNT(*)::int AS session_count, COALESCE(SUM(crash_count), 0)::int AS crash_count FROM sessions WHERE user_id = $1',
      [userId],
    );
    const eventAgg = await this.client.query<{
      event_count: number;
      first_seen: string | null;
      last_seen: string | null;
    }>(
      `SELECT COUNT(*)::int AS event_count,
              MIN(timestamp) AS first_seen,
              MAX(timestamp) AS last_seen
       FROM events WHERE user_id = $1`,
      [userId],
    );
    const typeAgg = await this.client.query<{ type: string; count: number }>(
      `SELECT type, COUNT(*)::int AS count
       FROM events WHERE user_id = $1
       GROUP BY type
       ORDER BY count DESC`,
      [userId],
    );
    return {
      userId,
      sessionCount: Number(sessionAgg.rows[0]?.session_count ?? 0),
      eventCount: Number(eventAgg.rows[0]?.event_count ?? 0),
      crashCount: Number(sessionAgg.rows[0]?.crash_count ?? 0),
      firstSeen: coerceBigInt(eventAgg.rows[0]?.first_seen ?? null),
      lastSeen: coerceBigInt(eventAgg.rows[0]?.last_seen ?? null),
      eventTypes: typeAgg.rows.map((r) => ({ type: r.type, count: Number(r.count) })),
    };
  }

  // ------------------------------ Sessions ------------------------------

  async getSession(id: string): Promise<SessionRecord | null> {
    const result = await this.client.query<SessionRow>('SELECT * FROM sessions WHERE id = $1', [id]);
    const row = result.rows[0];
    return row ? rowToSession(row) : null;
  }

  async upsertSession(session: SessionRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO sessions (
        id, user_id, started_at, ended_at, platform, device_json,
        app_version, runtime_version, channel, event_count, crash_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (id) DO UPDATE SET
        user_id = EXCLUDED.user_id,
        started_at = EXCLUDED.started_at,
        ended_at = EXCLUDED.ended_at,
        platform = EXCLUDED.platform,
        device_json = EXCLUDED.device_json,
        app_version = EXCLUDED.app_version,
        runtime_version = EXCLUDED.runtime_version,
        channel = EXCLUDED.channel,
        event_count = EXCLUDED.event_count,
        crash_count = EXCLUDED.crash_count`,
      [
        session.id,
        session.userId ?? null,
        session.startedAt,
        session.endedAt ?? null,
        session.platform ?? null,
        session.device ? JSON.stringify(session.device) : null,
        session.appVersion ?? null,
        session.runtimeVersion ?? null,
        session.channel ?? null,
        session.eventCount,
        session.crashCount,
      ],
    );
  }

  async endSession(id: string, endedAt: number): Promise<void> {
    await this.client.query('UPDATE sessions SET ended_at = $1 WHERE id = $2', [endedAt, id]);
  }

  async bumpSessionCounters(id: string, eventDelta: number, crashDelta: number): Promise<void> {
    await this.client.query(
      'UPDATE sessions SET event_count = event_count + $1, crash_count = crash_count + $2 WHERE id = $3',
      [eventDelta, crashDelta, id],
    );
  }

  async listSessions(limit = 100): Promise<SessionRecord[]> {
    const result = await this.client.query<SessionRow>(
      'SELECT * FROM sessions ORDER BY started_at DESC LIMIT $1',
      [limit],
    );
    return result.rows.map(rowToSession);
  }

  // ------------------------------ Crash groups ------------------------------

  async upsertCrashGroup(record: CrashGroupRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO crash_groups (
        fingerprint, message, first_seen, last_seen, event_count,
        session_count, status, top_screen, ai_suggestion_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (fingerprint) DO UPDATE SET
        message = EXCLUDED.message,
        last_seen = GREATEST(crash_groups.last_seen, EXCLUDED.last_seen),
        event_count = crash_groups.event_count + 1,
        top_screen = COALESCE(EXCLUDED.top_screen, crash_groups.top_screen),
        ai_suggestion_json = COALESCE(EXCLUDED.ai_suggestion_json, crash_groups.ai_suggestion_json)`,
      [
        record.fingerprint,
        record.message,
        record.firstSeen,
        record.lastSeen,
        record.eventCount,
        record.sessionCount,
        record.status,
        record.topScreen ?? null,
        record.aiSuggestion ? JSON.stringify(record.aiSuggestion) : null,
      ],
    );
  }

  async setCrashGroupStatus(fingerprint: string, status: CrashGroupStatus): Promise<void> {
    await this.client.query('UPDATE crash_groups SET status = $1 WHERE fingerprint = $2', [
      status,
      fingerprint,
    ]);
  }

  async listCrashGroups(filter: CrashGroupListFilter = {}): Promise<CrashGroupRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM crash_groups');
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      builder.in('status', statuses);
    }
    if (filter.since !== undefined) builder.where('last_seen >= ?', filter.since);
    if (filter.until !== undefined) builder.where('last_seen <= ?', filter.until);
    builder.orderBy('last_seen DESC');
    if (filter.limit !== undefined) builder.limit(filter.limit);
    if (filter.offset !== undefined) builder.offset(filter.offset);
    const result = await this.client.query<CrashGroupRow>(builder.text(), builder.params());
    return result.rows.map(rowToCrashGroup);
  }

  // ------------------------------ Bug reports ------------------------------

  async insertBugReport(record: BugReportRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO bug_reports (
        id, session_id, submitted_at, title, description, status,
        assignee, attachments_json, event_ids_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        record.id,
        record.sessionId,
        record.submittedAt,
        record.title ?? null,
        record.description ?? null,
        record.status,
        record.assignee ?? null,
        record.attachments ? JSON.stringify(record.attachments) : null,
        record.eventIds ? JSON.stringify(record.eventIds) : null,
      ],
    );
  }

  async updateBugReport(
    id: string,
    patch: Partial<Pick<BugReportRecord, 'status' | 'assignee' | 'title' | 'description'>>,
  ): Promise<void> {
    const sets: string[] = [];
    const params: unknown[] = [];
    let idx = 1;
    if (patch.status !== undefined) {
      sets.push(`status = $${idx++}`);
      params.push(patch.status);
    }
    if (patch.assignee !== undefined) {
      sets.push(`assignee = $${idx++}`);
      params.push(patch.assignee);
    }
    if (patch.title !== undefined) {
      sets.push(`title = $${idx++}`);
      params.push(patch.title);
    }
    if (patch.description !== undefined) {
      sets.push(`description = $${idx++}`);
      params.push(patch.description);
    }
    if (sets.length === 0) return;
    params.push(id);
    await this.client.query(`UPDATE bug_reports SET ${sets.join(', ')} WHERE id = $${idx}`, params);
  }

  async listBugReports(filter: BugReportListFilter = {}): Promise<BugReportRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM bug_reports');
    if (filter.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      builder.in('status', statuses);
    }
    if (filter.sessionId !== undefined) builder.where('session_id = ?', filter.sessionId);
    builder.orderBy('submitted_at DESC');
    if (filter.limit !== undefined) builder.limit(filter.limit);
    if (filter.offset !== undefined) builder.offset(filter.offset);
    const result = await this.client.query<BugReportRow>(builder.text(), builder.params());
    return result.rows.map(rowToBugReport);
  }

  // ------------------------------ Alert rules ------------------------------

  async saveAlertRule(rule: AlertRuleRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO alert_rules (
        id, name, metric, threshold, window_seconds, channels_json,
        cooldown_seconds, enabled, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        metric = EXCLUDED.metric,
        threshold = EXCLUDED.threshold,
        window_seconds = EXCLUDED.window_seconds,
        channels_json = EXCLUDED.channels_json,
        cooldown_seconds = EXCLUDED.cooldown_seconds,
        enabled = EXCLUDED.enabled,
        updated_at = EXCLUDED.updated_at`,
      [
        rule.id,
        rule.name,
        rule.metric,
        rule.threshold,
        rule.windowSeconds,
        JSON.stringify(rule.channels),
        rule.cooldownSeconds,
        rule.enabled,
        rule.createdAt,
        rule.updatedAt,
      ],
    );
  }

  async listAlertRules(): Promise<AlertRuleRecord[]> {
    const result = await this.client.query<AlertRuleRow>(
      'SELECT * FROM alert_rules ORDER BY created_at ASC',
    );
    return result.rows.map(rowToAlertRule);
  }

  async deleteAlertRule(id: string): Promise<boolean> {
    const result = await this.client.query('DELETE FROM alert_rules WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  // ------------------------------ Alert history ------------------------------

  async insertAlertFiring(firing: AlertFiringRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO alert_history (id, rule_id, fired_at, metric_value, severity, payload_json)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        firing.id,
        firing.ruleId,
        firing.firedAt,
        firing.metricValue,
        firing.severity,
        firing.payload ? JSON.stringify(firing.payload) : null,
      ],
    );
  }

  async listAlertHistory(filter: AlertHistoryListFilter = {}): Promise<AlertFiringRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM alert_history');
    if (filter.ruleId !== undefined) builder.where('rule_id = ?', filter.ruleId);
    if (filter.since !== undefined) builder.where('fired_at >= ?', filter.since);
    if (filter.until !== undefined) builder.where('fired_at <= ?', filter.until);
    builder.orderBy('fired_at DESC');
    builder.limit(filter.limit ?? 100);
    const result = await this.client.query<AlertFiringRow>(builder.text(), builder.params());
    return result.rows.map(rowToAlertFiring);
  }

  // ------------------------------ Symbol files ------------------------------

  async saveSymbolFile(record: SymbolFileRecord): Promise<void> {
    await this.client.query(
      `INSERT INTO symbol_files (
        id, platform, bundle_id, version, filename, size_bytes,
        uploaded_at, entry_count, uuid, mapping_text
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        record.id,
        record.platform,
        record.bundleId,
        record.version,
        record.filename,
        record.sizeBytes,
        record.uploadedAt,
        record.entryCount,
        record.uuid,
        record.mappingText,
      ],
    );
  }

  async listSymbolFiles(filter: SymbolFileListFilter = {}): Promise<SymbolFileRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM symbol_files');
    if (filter.platform !== undefined) builder.where('platform = ?', filter.platform);
    if (filter.bundleId !== undefined) builder.where('bundle_id = ?', filter.bundleId);
    if (filter.version !== undefined) builder.where('version = ?', filter.version);
    builder.orderBy('uploaded_at DESC');
    builder.limit(filter.limit ?? 100);
    const result = await this.client.query<SymbolFileRow>(builder.text(), builder.params());
    return result.rows.map(rowToSymbolFile);
  }

  async getSymbolFile(id: string): Promise<SymbolFileRecord | null> {
    const result = await this.client.query<SymbolFileRow>(
      'SELECT * FROM symbol_files WHERE id = $1',
      [id],
    );
    return result.rows[0] ? rowToSymbolFile(result.rows[0]) : null;
  }

  async deleteSymbolFile(id: string): Promise<boolean> {
    const result = await this.client.query('DELETE FROM symbol_files WHERE id = $1', [id]);
    return (result.rowCount ?? 0) > 0;
  }

  async findSymbolFile(
    platform: SymbolPlatform,
    bundleId: string,
    version: string,
  ): Promise<SymbolFileRecord | null> {
    const result = await this.client.query<SymbolFileRow>(
      `SELECT * FROM symbol_files
       WHERE platform = $1 AND bundle_id = $2 AND version = $3
       ORDER BY uploaded_at DESC
       LIMIT 1`,
      [platform, bundleId, version],
    );
    return result.rows[0] ? rowToSymbolFile(result.rows[0]) : null;
  }

  // ------------------------------ Settings ------------------------------

  async getSetting(key: string): Promise<string | null> {
    const result = await this.client.query<{ value: string }>(
      'SELECT value FROM server_settings WHERE key = $1',
      [key],
    );
    return result.rows[0]?.value ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    await this.client.query(
      `INSERT INTO server_settings (key, value, updated_at)
       VALUES ($1, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = EXCLUDED.updated_at`,
      [key, value, this.now()],
    );
  }

  async listSettings(): Promise<{ key: string; value: string; updatedAt: number }[]> {
    const result = await this.client.query<{ key: string; value: string; updated_at: string }>(
      'SELECT key, value, updated_at FROM server_settings ORDER BY key ASC',
    );
    return result.rows.map((r) => ({
      key: r.key,
      value: r.value,
      updatedAt: Number(r.updated_at),
    }));
  }

  // ------------------------------ AI action audit ------------------------------

  async insertAiAction(record: AiActionRecord): Promise<{ inserted: boolean }> {
    const result = await this.client.query(
      `INSERT INTO ai_actions (
        id, timestamp, agent, action, "user", fingerprint,
        tools_called_json, files_considered_json, confidence,
        effective_confidence, classification, outcome, pr_url,
        redaction_labels_json, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.timestamp,
        record.agent,
        record.action,
        record.user ?? null,
        record.fingerprint ?? null,
        record.toolsCalled ? JSON.stringify(record.toolsCalled) : null,
        record.filesConsidered ? JSON.stringify(record.filesConsidered) : null,
        record.confidence ?? null,
        record.effectiveConfidence ?? null,
        record.classification ?? null,
        record.outcome,
        record.prUrl ?? null,
        record.redactionLabels ? JSON.stringify(record.redactionLabels) : null,
        record.metadata ? JSON.stringify(record.metadata) : null,
      ],
    );
    return { inserted: (result.rowCount ?? 0) > 0 };
  }

  async listAiActions(filter: AiActionListFilter = {}): Promise<AiActionRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM ai_actions');
    applyAiActionFilter(builder, filter);
    builder.orderBy('timestamp DESC');
    builder.limit(filter.limit ?? 100);
    if (filter.offset !== undefined) builder.offset(filter.offset);
    const result = await this.client.query<AiActionRow>(builder.text(), builder.params());
    return result.rows.map(rowToAiAction);
  }

  async countAiActions(filter: AiActionListFilter = {}): Promise<number> {
    const builder = new SqlBuilder('SELECT COUNT(*)::int AS count FROM ai_actions');
    applyAiActionFilter(builder, filter);
    const result = await this.client.query<{ count: number }>(builder.text(), builder.params());
    return Number(result.rows[0]?.count ?? 0);
  }

  // ------------------------------ Notifications (Task 117.19) ------------------------------

  async insertNotification(record: NotificationRecord): Promise<{ inserted: boolean }> {
    const result = await this.client.query(
      `INSERT INTO notifications
        (id, created_at, severity, title, body, rule_id, firing_id, read, metadata_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO NOTHING`,
      [
        record.id,
        record.createdAt,
        record.severity,
        record.title,
        record.body,
        record.ruleId ?? null,
        record.firingId ?? null,
        record.read,
        record.metadata ? JSON.stringify(record.metadata) : null,
      ],
    );
    return { inserted: (result.rowCount ?? 0) > 0 };
  }

  async listNotifications(filter: NotificationListFilter = {}): Promise<NotificationRecord[]> {
    const builder = new SqlBuilder('SELECT * FROM notifications');
    if (filter.unreadOnly) builder.where('read = ?', false);
    if (filter.since !== undefined) builder.where('created_at >= ?', filter.since);
    builder.orderBy('created_at DESC');
    builder.limit(filter.limit ?? 100);
    const result = await this.client.query<NotificationRow>(builder.text(), builder.params());
    return result.rows.map(rowToNotification);
  }

  async markNotificationRead(id: string): Promise<boolean> {
    const result = await this.client.query('UPDATE notifications SET read = TRUE WHERE id = $1', [
      id,
    ]);
    return (result.rowCount ?? 0) > 0;
  }

  async countUnreadNotifications(): Promise<number> {
    const result = await this.client.query<{ count: number }>(
      'SELECT COUNT(*)::int AS count FROM notifications WHERE read = FALSE',
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  // ------------------------------ Retention ------------------------------

  async purgeOlderThan(cutoff: number): Promise<{
    events: number;
    sessions: number;
    bugReports: number;
    alertHistory: number;
    aiActions: number;
  }> {
    return this.client.withTransaction(async (tx) => {
      const events = (await tx.query('DELETE FROM events WHERE timestamp < $1', [cutoff]))
        .rowCount ?? 0;
      const bugReports = (await tx.query('DELETE FROM bug_reports WHERE submitted_at < $1', [cutoff]))
        .rowCount ?? 0;
      const alertHistory = (await tx.query('DELETE FROM alert_history WHERE fired_at < $1', [cutoff]))
        .rowCount ?? 0;
      const aiActions = (await tx.query('DELETE FROM ai_actions WHERE timestamp < $1', [cutoff]))
        .rowCount ?? 0;
      // Task 117.19 — in-app notifications decay with telemetry. Not
      // surfaced in the return shape (kept stable for the interface).
      await tx.query('DELETE FROM notifications WHERE created_at < $1', [cutoff]);
      const sessions = (
        await tx.query(
          `DELETE FROM sessions s
           WHERE s.started_at < $1
             AND NOT EXISTS (SELECT 1 FROM events e WHERE e.session_id = s.id)`,
          [cutoff],
        )
      ).rowCount ?? 0;
      return { events, sessions, bugReports, alertHistory, aiActions };
    });
  }

  // ------------------------------ Admin ------------------------------

  async resetAllUserData(): Promise<Record<string, number>> {
    const counts: Record<string, number> = {};
    await this.client.withTransaction(async (tx) => {
      for (const table of POSTGRES_RESET_TABLES) {
        const result = await tx.query(`DELETE FROM ${table}`);
        counts[table] = result.rowCount ?? 0;
      }
    });
    return counts;
  }

  async listAppliedMigrations(): Promise<
    Array<{ version: number; name: string; appliedAt: number }>
  > {
    const result = await this.client.query<{ version: number; name: string; applied_at: string }>(
      'SELECT version, name, applied_at FROM _migrations ORDER BY version ASC',
    );
    return result.rows.map((r) => ({
      version: Number(r.version),
      name: r.name,
      appliedAt: Number(r.applied_at),
    }));
  }

  async selfCheck(): Promise<{ ok: true; tables: string[] }> {
    const result = await this.client.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = current_schema() AND table_type = 'BASE TABLE'
       ORDER BY table_name ASC`,
    );
    return { ok: true, tables: result.rows.map((r) => r.table_name) };
  }

  async readyCheck(): Promise<{
    ready: boolean;
    reason?: string;
    migrationsApplied: number;
  }> {
    try {
      const applied = await this.client.query<{ count: number }>(
        'SELECT COUNT(*)::int AS count FROM _migrations',
      );
      const count = Number(applied.rows[0]?.count ?? 0);
      if (count < this.migrations.length) {
        return {
          ready: false,
          reason: `migrations pending: ${count}/${this.migrations.length} applied`,
          migrationsApplied: count,
        };
      }
      return { ready: true, migrationsApplied: count };
    } catch (err) {
      return {
        ready: false,
        reason: `readyCheck failed: ${err instanceof Error ? err.message : String(err)}`,
        migrationsApplied: this.appliedMigrationCount,
      };
    }
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}

// ──────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────

class SqlBuilder {
  private clauses: string[] = [];
  private paramList: unknown[] = [];
  private suffix = '';
  private orderClause = '';
  private limitClause = '';
  private offsetClause = '';

  constructor(private base: string) {}

  where(template: string, value: unknown): void {
    this.paramList.push(value);
    this.clauses.push(template.replace('?', `$${this.paramList.length}`));
  }

  in(field: string, values: readonly unknown[]): void {
    if (values.length === 0) {
      this.clauses.push('FALSE'); // empty IN list means match nothing
      return;
    }
    const placeholders: string[] = [];
    for (const v of values) {
      this.paramList.push(v);
      placeholders.push(`$${this.paramList.length}`);
    }
    this.clauses.push(`${field} IN (${placeholders.join(', ')})`);
  }

  orderBy(expr: string): void {
    this.orderClause = ` ORDER BY ${expr}`;
  }

  limit(n: number): void {
    this.paramList.push(n);
    this.limitClause = ` LIMIT $${this.paramList.length}`;
  }

  offset(n: number): void {
    this.paramList.push(n);
    this.offsetClause = ` OFFSET $${this.paramList.length}`;
  }

  text(): string {
    const where = this.clauses.length ? ` WHERE ${this.clauses.join(' AND ')}` : '';
    return `${this.base}${where}${this.orderClause}${this.limitClause}${this.offsetClause}${this.suffix}`;
  }

  params(): unknown[] {
    return this.paramList;
  }
}

function applyEventFilter(builder: SqlBuilder, filter: EventListFilter): void {
  if (filter.since !== undefined) builder.where('timestamp >= ?', filter.since);
  if (filter.until !== undefined) builder.where('timestamp <= ?', filter.until);
  if (filter.type !== undefined) {
    const types = Array.isArray(filter.type) ? filter.type : [filter.type];
    builder.in('type', types);
  }
  if (filter.severity !== undefined) {
    const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
    builder.in('severity', severities);
  }
  if (filter.sessionId !== undefined) builder.where('session_id = ?', filter.sessionId);
  if (filter.fingerprint !== undefined) builder.where('fingerprint = ?', filter.fingerprint);
  if (filter.userId !== undefined) builder.where('user_id = ?', filter.userId);
}

function applyAiActionFilter(builder: SqlBuilder, filter: AiActionListFilter): void {
  if (filter.since !== undefined) builder.where('timestamp >= ?', filter.since);
  if (filter.until !== undefined) builder.where('timestamp <= ?', filter.until);
  if (filter.agent !== undefined) builder.where('agent = ?', filter.agent);
  if (filter.action !== undefined) builder.where('action = ?', filter.action);
  if (filter.fingerprint !== undefined) builder.where('fingerprint = ?', filter.fingerprint);
  if (filter.outcome !== undefined) {
    const outcomes = Array.isArray(filter.outcome) ? filter.outcome : [filter.outcome];
    builder.in('outcome', outcomes);
  }
}

function checksum(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

/**
 * pg returns BIGINT columns as strings. Coerce to number — every
 * timestamp we touch is an epoch ms value comfortably under
 * Number.MAX_SAFE_INTEGER.
 */
function coerceBigInt(value: string | number | null): number | null {
  if (value === null) return null;
  return typeof value === 'number' ? value : Number(value);
}

// ──────────────────────────────────────────────────────────────────
// Row mappers
// ──────────────────────────────────────────────────────────────────

interface EventRow extends Record<string, unknown> {
  id: string;
  type: string;
  severity: string;
  session_id: string;
  fingerprint: string | null;
  timestamp: string | number;
  received_at: string | number;
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
    timestamp: Number(row.timestamp),
    receivedAt: Number(row.received_at),
    payload: JSON.parse(row.payload_json) as Record<string, unknown>,
  };
  if (row.fingerprint !== null) record.fingerprint = row.fingerprint;
  if (row.screen !== null) record.screen = row.screen;
  if (row.platform !== null) record.platform = row.platform;
  if (row.user_id !== null) record.userId = row.user_id;
  return record;
}

interface SessionRow extends Record<string, unknown> {
  id: string;
  user_id: string | null;
  started_at: string | number;
  ended_at: string | number | null;
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
    startedAt: Number(row.started_at),
    eventCount: Number(row.event_count),
    crashCount: Number(row.crash_count),
  };
  if (row.user_id !== null) rec.userId = row.user_id;
  if (row.ended_at !== null) rec.endedAt = Number(row.ended_at);
  if (row.platform !== null) rec.platform = row.platform;
  if (row.device_json !== null) rec.device = JSON.parse(row.device_json) as Record<string, unknown>;
  if (row.app_version !== null) rec.appVersion = row.app_version;
  if (row.runtime_version !== null) rec.runtimeVersion = row.runtime_version;
  if (row.channel !== null) rec.channel = row.channel;
  return rec;
}

interface CrashGroupRow extends Record<string, unknown> {
  fingerprint: string;
  message: string;
  first_seen: string | number;
  last_seen: string | number;
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
    firstSeen: Number(row.first_seen),
    lastSeen: Number(row.last_seen),
    eventCount: Number(row.event_count),
    sessionCount: Number(row.session_count),
    status: row.status as CrashGroupStatus,
  };
  if (row.top_screen !== null) rec.topScreen = row.top_screen;
  if (row.ai_suggestion_json !== null) {
    rec.aiSuggestion = JSON.parse(row.ai_suggestion_json) as Record<string, unknown>;
  }
  return rec;
}

interface BugReportRow extends Record<string, unknown> {
  id: string;
  session_id: string;
  submitted_at: string | number;
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
    submittedAt: Number(row.submitted_at),
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

interface AlertRuleRow extends Record<string, unknown> {
  id: string;
  name: string;
  metric: string;
  threshold: number;
  window_seconds: number;
  channels_json: string;
  cooldown_seconds: number;
  enabled: boolean;
  created_at: string | number;
  updated_at: string | number;
}

function rowToAlertRule(row: AlertRuleRow): AlertRuleRecord {
  return {
    id: row.id,
    name: row.name,
    metric: row.metric,
    threshold: Number(row.threshold),
    windowSeconds: Number(row.window_seconds),
    channels: JSON.parse(row.channels_json) as string[],
    cooldownSeconds: Number(row.cooldown_seconds),
    enabled: Boolean(row.enabled),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

interface AlertFiringRow extends Record<string, unknown> {
  id: string;
  rule_id: string;
  fired_at: string | number;
  metric_value: number;
  severity: string;
  payload_json: string | null;
}

function rowToAlertFiring(row: AlertFiringRow): AlertFiringRecord {
  const rec: AlertFiringRecord = {
    id: row.id,
    ruleId: row.rule_id,
    firedAt: Number(row.fired_at),
    metricValue: Number(row.metric_value),
    severity: row.severity as Severity,
  };
  if (row.payload_json !== null) {
    rec.payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  }
  return rec;
}

interface NotificationRow extends Record<string, unknown> {
  id: string;
  created_at: string | number;
  severity: string;
  title: string;
  body: string;
  rule_id: string | null;
  firing_id: string | null;
  read: boolean;
  metadata_json: string | null;
}

function rowToNotification(row: NotificationRow): NotificationRecord {
  const rec: NotificationRecord = {
    id: row.id,
    createdAt: Number(row.created_at),
    severity: row.severity as Severity,
    title: row.title,
    body: row.body,
    read: Boolean(row.read),
  };
  if (row.rule_id !== null) rec.ruleId = row.rule_id;
  if (row.firing_id !== null) rec.firingId = row.firing_id;
  if (row.metadata_json !== null) {
    rec.metadata = JSON.parse(row.metadata_json) as Record<string, unknown>;
  }
  return rec;
}

interface SymbolFileRow extends Record<string, unknown> {
  id: string;
  platform: string;
  bundle_id: string;
  version: string;
  filename: string;
  size_bytes: string | number;
  uploaded_at: string | number;
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
    sizeBytes: Number(row.size_bytes),
    uploadedAt: Number(row.uploaded_at),
    entryCount: Number(row.entry_count),
    uuid: row.uuid,
    mappingText: row.mapping_text,
  };
}

interface AiActionRow extends Record<string, unknown> {
  id: string;
  timestamp: string | number;
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
    timestamp: Number(row.timestamp),
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
  if (row.confidence !== null) rec.confidence = Number(row.confidence);
  if (row.effective_confidence !== null) {
    rec.effectiveConfidence = Number(row.effective_confidence);
  }
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
