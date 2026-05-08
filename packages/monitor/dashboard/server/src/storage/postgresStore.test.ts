// Task 117.4 — PostgresStore tests against a stub PgClient.
//
// We don't run a real Postgres in CI here — the stub validates that
// every method emits the right SQL with the right parameter binding,
// dispatches transactions correctly, and round-trips row shapes.
// Integration tests against a live database run nightly via a separate
// docker-compose harness (tracked as a follow-up).

import { describe, expect, test } from 'vitest';
import { createHash } from 'node:crypto';
import type { PgClient, PgQueryResult } from './pgClient.js';
import { PostgresStore } from './postgresStore.js';
import { POSTGRES_DEFAULT_MIGRATIONS } from './postgresSchema.js';
import type {
  AiActionRecord,
  AlertFiringRecord,
  AlertRuleRecord,
  BugReportRecord,
  CrashGroupRecord,
  EventRecord,
  SessionRecord,
  SymbolFileRecord,
} from './types.js';

interface RecordedQuery {
  text: string;
  params: unknown[];
  inTransaction: boolean;
}

interface ScriptedResult {
  match: RegExp | string;
  /** Run on every match so we can serve different rows per call. */
  result: (call: number) => Pick<PgQueryResult, 'rows' | 'rowCount'>;
}

interface FakeOptions {
  scripts?: ScriptedResult[];
  /** Default rowCount for non-scripted queries. */
  defaultRowCount?: number;
}

function createFakeClient(options: FakeOptions = {}): {
  client: PgClient;
  queries: RecordedQuery[];
  setNextRows: (rows: Record<string, unknown>[]) => void;
} {
  const queries: RecordedQuery[] = [];
  const matchCounts = new Map<ScriptedResult, number>();
  let nextRowsOverride: Record<string, unknown>[] | null = null;
  const dispatch = (
    text: string,
    params: ReadonlyArray<unknown> | undefined,
    inTransaction: boolean,
  ): Promise<PgQueryResult> => {
    queries.push({ text, params: params ? [...params] : [], inTransaction });
    if (nextRowsOverride) {
      const rows = nextRowsOverride;
      nextRowsOverride = null;
      return Promise.resolve({ rows, rowCount: rows.length });
    }
    for (const script of options.scripts ?? []) {
      const matched =
        typeof script.match === 'string' ? text.includes(script.match) : script.match.test(text);
      if (matched) {
        const idx = (matchCounts.get(script) ?? 0) + 1;
        matchCounts.set(script, idx);
        const out = script.result(idx);
        return Promise.resolve({ rows: out.rows, rowCount: out.rowCount ?? out.rows.length });
      }
    }
    return Promise.resolve({ rows: [], rowCount: options.defaultRowCount ?? 1 });
  };

  const buildClient = (inTx: boolean): PgClient => ({
    async query<R extends Record<string, unknown> = Record<string, unknown>>(
      text: string,
      params?: ReadonlyArray<unknown>,
    ): Promise<PgQueryResult<R>> {
      const result = await dispatch(text, params, inTx);
      return result as PgQueryResult<R>;
    },
    async withTransaction(fn) {
      // Two phantom queries (BEGIN + COMMIT) bracket the inner work to
      // mirror the real-pool wrapping.
      queries.push({ text: 'BEGIN', params: [], inTransaction: false });
      try {
        const result = await fn(buildClient(true));
        queries.push({ text: 'COMMIT', params: [], inTransaction: false });
        return result;
      } catch (err) {
        queries.push({ text: 'ROLLBACK', params: [], inTransaction: false });
        throw err;
      }
    },
    async end() {
      // No-op for the fake client.
    },
  });
  return {
    client: buildClient(false),
    queries,
    setNextRows: (rows) => {
      nextRowsOverride = rows;
    },
  };
}

const NOW = 1_770_000_000_000;

function eventFixture(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    id: 'evt-1',
    type: 'crash',
    severity: 'critical',
    sessionId: 's1',
    timestamp: NOW,
    receivedAt: NOW + 5,
    payload: { message: 'boom' },
    fingerprint: 'fp-1',
    screen: 'Home',
    platform: 'ios',
    userId: 'u-42',
    ...overrides,
  };
}

describe('PostgresStore — bootstrap', () => {
  test('creates the bookkeeping table and applies every pending migration', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.bootstrap();
    // Bookkeeping DDL + a SELECT for applied versions + (BEGIN + DDL +
    // INSERT + COMMIT) per migration.
    const migrationCount = POSTGRES_DEFAULT_MIGRATIONS.length;
    const begins = queries.filter((q) => q.text === 'BEGIN').length;
    expect(begins).toBe(migrationCount);
    const inserts = queries.filter((q) => q.text.includes('INSERT INTO _migrations'));
    expect(inserts).toHaveLength(migrationCount);
    expect(inserts[0]?.params[0]).toBe(POSTGRES_DEFAULT_MIGRATIONS[0]?.version);
    expect(inserts[0]?.params[1]).toBe(POSTGRES_DEFAULT_MIGRATIONS[0]?.name);
    expect(inserts[0]?.params[2]).toBe(NOW);
  });

  test('skips migrations whose checksum already matches', async () => {
    const checksumOf = (s: string): string => createHash('sha256').update(s).digest('hex');
    const { client, queries } = createFakeClient({
      scripts: [
        {
          match: 'SELECT version, checksum FROM _migrations',
          result: () => ({
            rows: POSTGRES_DEFAULT_MIGRATIONS.map((m) => ({
              version: m.version,
              checksum: checksumOf(m.up),
            })),
          }),
        },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    await store.bootstrap();
    expect(queries.some((q) => q.text === 'BEGIN')).toBe(false);
  });

  test('throws on checksum drift between declared SQL and applied row', async () => {
    const { client } = createFakeClient({
      scripts: [
        {
          match: 'SELECT version, checksum FROM _migrations',
          result: () => ({
            rows: [{ version: 1, checksum: 'definitely-not-the-real-checksum' }],
          }),
        },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    await expect(store.bootstrap()).rejects.toThrow(/checksum drift/);
  });
});

describe('PostgresStore — events', () => {
  test('insertEvent uses ON CONFLICT DO NOTHING and surfaces inserted=true on new rows', async () => {
    const { client, queries } = createFakeClient({ defaultRowCount: 1 });
    const store = new PostgresStore({ client, now: () => NOW });
    const result = await store.insertEvent(eventFixture());
    expect(result.inserted).toBe(true);
    const insert = queries.find((q) => q.text.includes('INSERT INTO events'));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain('ON CONFLICT (id) DO NOTHING');
    expect(insert!.params).toEqual([
      'evt-1',
      'crash',
      'critical',
      's1',
      'fp-1',
      NOW,
      NOW + 5,
      'Home',
      'ios',
      JSON.stringify({ message: 'boom' }),
      'u-42',
    ]);
  });

  test('insertEvent reports inserted=false on duplicate id', async () => {
    const { client } = createFakeClient({ defaultRowCount: 0 });
    const store = new PostgresStore({ client, now: () => NOW });
    const result = await store.insertEvent(eventFixture());
    expect(result.inserted).toBe(false);
  });

  test('hasEventId fires a LIMIT 1 probe', async () => {
    const { client, queries } = createFakeClient({
      scripts: [{ match: 'SELECT 1 FROM events', result: () => ({ rows: [{ '?column?': 1 }] }) }],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    expect(await store.hasEventId('evt-1')).toBe(true);
    expect(queries.find((q) => q.text.includes('FROM events WHERE id = $1 LIMIT 1'))).toBeDefined();
  });

  test('listEvents composes WHERE + IN + ORDER BY + LIMIT with positional params', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.listEvents({
      since: 100,
      until: 1_000,
      type: ['crash', 'native_anr'],
      sessionId: 's1',
      limit: 50,
    });
    const select = queries.find((q) => q.text.startsWith('SELECT * FROM events'));
    expect(select).toBeDefined();
    expect(select!.text).toContain('timestamp >= $1');
    expect(select!.text).toContain('timestamp <= $2');
    expect(select!.text).toContain('type IN ($3, $4)');
    expect(select!.text).toContain('session_id = $5');
    expect(select!.text).toContain('ORDER BY timestamp DESC');
    expect(select!.text).toContain('LIMIT $6');
    expect(select!.params).toEqual([100, 1_000, 'crash', 'native_anr', 's1', 50]);
  });

  test('countEvents returns numeric count from the rows[0]', async () => {
    const { client } = createFakeClient({
      scripts: [{ match: 'SELECT COUNT(*)::int', result: () => ({ rows: [{ count: 42 }] }) }],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    expect(await store.countEvents()).toBe(42);
  });

  test('deleteEventsByUserId runs the events DELETE and the orphan-session DELETE in one transaction', async () => {
    const { client, queries } = createFakeClient({ defaultRowCount: 5 });
    const store = new PostgresStore({ client, now: () => NOW });
    const removed = await store.deleteEventsByUserId('u-42');
    expect(removed).toBe(5);
    const tx = queries.filter((q) => q.inTransaction);
    expect(tx.some((q) => q.text.includes('DELETE FROM events WHERE user_id = $1'))).toBe(true);
    expect(tx.some((q) => q.text.includes('DELETE FROM sessions s'))).toBe(true);
  });
});

describe('PostgresStore — sessions, crashes, bug reports', () => {
  test('upsertSession uses INSERT ... ON CONFLICT DO UPDATE', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const session: SessionRecord = {
      id: 's1',
      startedAt: NOW,
      eventCount: 1,
      crashCount: 0,
      userId: 'u-42',
    };
    await store.upsertSession(session);
    const insert = queries.find((q) => q.text.startsWith('INSERT INTO sessions'));
    expect(insert).toBeDefined();
    expect(insert!.text).toContain('ON CONFLICT (id) DO UPDATE');
  });

  test('upsertCrashGroup composes the GREATEST() last_seen merge', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const group: CrashGroupRecord = {
      fingerprint: 'fp',
      message: 'boom',
      firstSeen: NOW,
      lastSeen: NOW,
      eventCount: 1,
      sessionCount: 1,
      status: 'new',
    };
    await store.upsertCrashGroup(group);
    expect(queries[0]?.text).toContain('GREATEST(crash_groups.last_seen, EXCLUDED.last_seen)');
  });

  test('listCrashGroups honours an array status filter via IN', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.listCrashGroups({ status: ['new', 'investigating'] });
    expect(queries[0]?.text).toContain('status IN ($1, $2)');
    expect(queries[0]?.params.slice(0, 2)).toEqual(['new', 'investigating']);
  });

  test('updateBugReport builds a partial SET with only the patched fields', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.updateBugReport('bug-1', { status: 'resolved', assignee: 'juba' });
    expect(queries[0]?.text).toBe('UPDATE bug_reports SET status = $1, assignee = $2 WHERE id = $3');
    expect(queries[0]?.params).toEqual(['resolved', 'juba', 'bug-1']);
  });

  test('updateBugReport is a no-op when the patch is empty', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.updateBugReport('bug-1', {});
    expect(queries).toHaveLength(0);
  });

  test('insertBugReport binds attachments + eventIds as JSON strings', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const record: BugReportRecord = {
      id: 'bug-1',
      sessionId: 's1',
      submittedAt: NOW,
      status: 'new',
      attachments: { screenshot: 'data:image/png' },
      eventIds: ['evt-1', 'evt-2'],
    };
    await store.insertBugReport(record);
    expect(queries[0]?.params[7]).toBe(JSON.stringify(record.attachments));
    expect(queries[0]?.params[8]).toBe(JSON.stringify(record.eventIds));
  });
});

describe('PostgresStore — alerts + symbols + settings + audit', () => {
  test('saveAlertRule upserts with channels JSON', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const rule: AlertRuleRecord = {
      id: 'rule-1',
      name: 'Crash spike',
      metric: 'crash_count',
      threshold: 5,
      windowSeconds: 60,
      channels: ['slack:https://hooks.slack.com/x'],
      cooldownSeconds: 300,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    };
    await store.saveAlertRule(rule);
    expect(queries[0]?.text).toContain('ON CONFLICT (id) DO UPDATE');
    expect(queries[0]?.params[5]).toBe(JSON.stringify(rule.channels));
    expect(queries[0]?.params[7]).toBe(true);
  });

  test('insertAlertFiring stores severity + JSON payload', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const firing: AlertFiringRecord = {
      id: 'fire-1',
      ruleId: 'rule-1',
      firedAt: NOW,
      metricValue: 7,
      severity: 'critical',
      payload: { test: false },
    };
    await store.insertAlertFiring(firing);
    expect(queries[0]?.params[5]).toBe(JSON.stringify(firing.payload));
  });

  test('listAlertHistory honours ruleId + since + LIMIT default', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.listAlertHistory({ ruleId: 'rule-1', since: 100 });
    expect(queries[0]?.text).toContain('rule_id = $1');
    expect(queries[0]?.text).toContain('fired_at >= $2');
    expect(queries[0]?.text).toContain('LIMIT $3');
    expect(queries[0]?.params).toEqual(['rule-1', 100, 100]);
  });

  test('saveSymbolFile binds every column', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const record: SymbolFileRecord = {
      id: 'sym-1',
      platform: 'ios',
      bundleId: 'app',
      version: '1.0.0',
      filename: 'app.dSYM',
      sizeBytes: 1024,
      uploadedAt: NOW,
      entryCount: 0,
      uuid: 'AAAA-BBBB',
      mappingText: null,
    };
    await store.saveSymbolFile(record);
    expect(queries[0]?.text).toContain('INSERT INTO symbol_files');
    expect(queries[0]?.params).toHaveLength(10);
  });

  test('findSymbolFile orders by uploaded_at DESC + LIMIT 1', async () => {
    const { client, queries } = createFakeClient({
      scripts: [
        {
          match: 'FROM symbol_files',
          result: () => ({ rows: [] }),
        },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    const out = await store.findSymbolFile('ios', 'app', '1.0.0');
    expect(out).toBeNull();
    expect(queries[0]?.text).toContain('ORDER BY uploaded_at DESC');
    expect(queries[0]?.text).toContain('LIMIT 1');
  });

  test('getSetting returns the value column or null', async () => {
    const { client } = createFakeClient({
      scripts: [
        { match: 'FROM server_settings', result: () => ({ rows: [{ value: 'dark' }] }) },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    expect(await store.getSetting('theme')).toBe('dark');
  });

  test('setSetting upserts with current now()', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.setSetting('retention_days', '7');
    expect(queries[0]?.params).toEqual(['retention_days', '7', NOW]);
    expect(queries[0]?.text).toContain('ON CONFLICT (key) DO UPDATE');
  });

  test('insertAiAction quotes the reserved "user" identifier', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    const record: AiActionRecord = {
      id: 'a-1',
      timestamp: NOW,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      outcome: 'proposed',
    };
    await store.insertAiAction(record);
    expect(queries[0]?.text).toContain('"user"');
    expect(queries[0]?.text).toContain('ON CONFLICT (id) DO NOTHING');
  });

  test('listAiActions composes outcome IN filter', async () => {
    const { client, queries } = createFakeClient();
    const store = new PostgresStore({ client, now: () => NOW });
    await store.listAiActions({ outcome: ['proposed', 'merged'] as never });
    expect(queries[0]?.text).toContain('outcome IN ($1, $2)');
  });
});

describe('PostgresStore — admin', () => {
  test('purgeOlderThan runs every DELETE inside a single transaction', async () => {
    const { client, queries } = createFakeClient({ defaultRowCount: 2 });
    const store = new PostgresStore({ client, now: () => NOW });
    const out = await store.purgeOlderThan(NOW - 86_400_000);
    expect(out.events).toBe(2);
    const tx = queries.filter((q) => q.inTransaction);
    expect(tx.some((q) => q.text.includes('FROM events'))).toBe(true);
    expect(tx.some((q) => q.text.includes('FROM bug_reports'))).toBe(true);
    expect(tx.some((q) => q.text.includes('FROM alert_history'))).toBe(true);
    expect(tx.some((q) => q.text.includes('FROM ai_actions'))).toBe(true);
    expect(tx.some((q) => q.text.includes('DELETE FROM sessions'))).toBe(true);
  });

  test('readyCheck returns 503-shaped response when migrations are short', async () => {
    const { client } = createFakeClient({
      scripts: [
        { match: 'COUNT(*)::int AS count FROM _migrations', result: () => ({ rows: [{ count: 1 }] }) },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    const out = await store.readyCheck();
    expect(out.ready).toBe(false);
    expect(out.reason).toMatch(/migrations pending/);
    expect(out.migrationsApplied).toBe(1);
  });

  test('readyCheck is happy when migration count matches', async () => {
    const { client } = createFakeClient({
      scripts: [
        {
          match: 'COUNT(*)::int AS count FROM _migrations',
          result: () => ({
            rows: [{ count: POSTGRES_DEFAULT_MIGRATIONS.length }],
          }),
        },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    const out = await store.readyCheck();
    expect(out.ready).toBe(true);
    expect(out.reason).toBeUndefined();
  });

  test('selfCheck enumerates information_schema tables', async () => {
    const { client, queries } = createFakeClient({
      scripts: [
        {
          match: 'information_schema.tables',
          result: () => ({
            rows: [{ table_name: 'events' }, { table_name: 'sessions' }],
          }),
        },
      ],
    });
    const store = new PostgresStore({ client, now: () => NOW });
    const out = await store.selfCheck();
    expect(out.ok).toBe(true);
    expect(out.tables).toEqual(['events', 'sessions']);
    expect(queries[0]?.text).toContain('information_schema.tables');
  });
});
