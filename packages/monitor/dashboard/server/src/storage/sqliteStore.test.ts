import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardStore, DEFAULT_MIGRATIONS, defaultDashboardDbPath } from './sqliteStore.js';
import type { AuditLogRecord, EventRecord, NotificationRecord, SessionRecord } from './types.js';

function openInMemory(): DashboardStore {
  return new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
}

const NOW = 1_770_000_000_000;

function makeEvent(partial: Partial<EventRecord> = {}): EventRecord {
  return {
    id: partial.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    type: partial.type ?? 'custom',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 'session-a',
    timestamp: partial.timestamp ?? NOW,
    receivedAt: partial.receivedAt ?? NOW + 100,
    payload: partial.payload ?? { value: 1 },
    ...partial,
  };
}

function makeSession(partial: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: partial.id ?? 'session-a',
    startedAt: partial.startedAt ?? NOW - 60_000,
    eventCount: partial.eventCount ?? 0,
    crashCount: partial.crashCount ?? 0,
    ...partial,
  };
}

describe('DashboardStore — migrations', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('creates every table declared in the v1 schema on a fresh in-memory database', () => {
    store = openInMemory();
    const { tables } = store.selfCheck();
    for (const t of [
      '_migrations',
      'alert_history',
      'alert_rules',
      'bug_reports',
      'crash_groups',
      'events',
      'sessions',
    ]) {
      expect(tables).toContain(t);
    }
  });

  test('is idempotent — constructing a second store against the same file re-applies zero migrations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erne-monitor-store-'));
    const dbPath = join(dir, 'dashboard.db');
    try {
      const a = new DashboardStore({ dbPath });
      expect(a.listAppliedMigrations()).toHaveLength(DEFAULT_MIGRATIONS.length);
      a.close();

      const b = new DashboardStore({ dbPath });
      expect(b.listAppliedMigrations()).toHaveLength(DEFAULT_MIGRATIONS.length);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('rejects a migration whose body changed after it shipped (checksum drift)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erne-monitor-store-'));
    const dbPath = join(dir, 'dashboard.db');
    try {
      const a = new DashboardStore({ dbPath });
      a.close();

      const tampered = [
        {
          version: 1,
          name: 'initial',
          up: 'CREATE TABLE IF NOT EXISTS events_tampered (id INTEGER);',
        },
      ];
      expect(() => new DashboardStore({ dbPath, migrations: tampered })).toThrow(/checksum drift/i);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('DashboardStore — events', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('insertEvent + listEvents round-trips payload as a structured object', () => {
    store = openInMemory();
    store.insertEvent(makeEvent({ id: 'e1', payload: { errors: ['a', 'b'], count: 2 } }));
    const [event] = store.listEvents();
    expect(event?.id).toBe('e1');
    expect(event?.payload).toEqual({ errors: ['a', 'b'], count: 2 });
  });

  test('insertEventsBatch collapses duplicate ids via INSERT OR IGNORE (Task 117.49)', () => {
    store = openInMemory();
    const original = makeEvent({ id: 'ok', payload: { kept: true } });
    const replay = makeEvent({ id: 'ok', payload: { kept: false } }); // retry with divergent payload
    const result = store.insertEventsBatch([original, replay]);
    expect(result.inserted).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(store.countEvents()).toBe(1);
    // IGNORE semantics keep the first row — a late retry must not
    // overwrite a valid event with a mutated replay.
    const [row] = store.listEvents({ limit: 1 });
    expect(row?.payload).toEqual({ kept: true });
  });

  test('insertEvent returns { inserted: false } on duplicate id', () => {
    store = openInMemory();
    expect(store.insertEvent(makeEvent({ id: 'x' })).inserted).toBe(true);
    expect(store.insertEvent(makeEvent({ id: 'x' })).inserted).toBe(false);
    expect(store.countEvents()).toBe(1);
  });

  test('hasEventId is true after insert, false otherwise', () => {
    store = openInMemory();
    expect(store.hasEventId('x')).toBe(false);
    store.insertEvent(makeEvent({ id: 'x' }));
    expect(store.hasEventId('x')).toBe(true);
  });

  test('listEvents filters by since/until/type/severity/session/user', () => {
    store = openInMemory();
    store.insertEventsBatch([
      makeEvent({ id: '1', type: 'crash', severity: 'critical', timestamp: NOW - 3_000 }),
      makeEvent({ id: '2', type: 'network', severity: 'warning', timestamp: NOW - 2_000 }),
      makeEvent({
        id: '3',
        type: 'custom',
        severity: 'info',
        timestamp: NOW - 1_000,
        userId: 'user-42',
      }),
      makeEvent({
        id: '4',
        type: 'crash',
        severity: 'critical',
        sessionId: 'session-b',
        timestamp: NOW,
      }),
    ]);

    expect(store.listEvents({ type: 'crash' }).map((e) => e.id)).toEqual(['4', '1']);
    expect(store.listEvents({ severity: ['warning', 'info'] }).map((e) => e.id)).toEqual([
      '3',
      '2',
    ]);
    expect(store.listEvents({ sessionId: 'session-b' }).map((e) => e.id)).toEqual(['4']);
    expect(store.listEvents({ userId: 'user-42' }).map((e) => e.id)).toEqual(['3']);
    expect(store.listEvents({ since: NOW - 1_500 }).map((e) => e.id)).toEqual(['4', '3']);
    expect(store.countEvents({ type: 'crash' })).toBe(2);
  });

  test('deleteEventsByUserId purges only that user, including their sessions (DSAR)', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 'session-a', userId: 'user-42' }));
    store.upsertSession(makeSession({ id: 'session-b', userId: 'user-99' }));
    store.insertEvent(
      makeEvent({ id: '1', sessionId: 'session-a', userId: 'user-42', timestamp: NOW - 1 }),
    );
    store.insertEvent(
      makeEvent({ id: '2', sessionId: 'session-b', userId: 'user-99', timestamp: NOW }),
    );

    expect(store.deleteEventsByUserId('user-42')).toBe(1);
    expect(store.listEvents().map((e) => e.id)).toEqual(['2']);
    expect(store.getSession('session-a')).toBeNull();
    expect(store.getSession('session-b')).not.toBeNull();
  });
});

describe('DashboardStore — sessions', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('upsertSession + endSession + bumpSessionCounters compound correctly', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 's1' }));
    store.bumpSessionCounters('s1', 3, 1);
    store.bumpSessionCounters('s1', 2, 0);
    store.endSession('s1', NOW + 5_000);
    const fetched = store.getSession('s1');
    expect(fetched?.eventCount).toBe(5);
    expect(fetched?.crashCount).toBe(1);
    expect(fetched?.endedAt).toBe(NOW + 5_000);
  });
});

describe('DashboardStore — crash groups', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('upsertCrashGroup aggregates counts and preserves the earliest first_seen + latest last_seen', () => {
    store = openInMemory();
    store.upsertCrashGroup({
      fingerprint: 'fp-1',
      message: 'TypeError',
      firstSeen: NOW - 10_000,
      lastSeen: NOW - 10_000,
      eventCount: 1,
      sessionCount: 1,
      status: 'new',
    });
    store.upsertCrashGroup({
      fingerprint: 'fp-1',
      message: 'TypeError',
      firstSeen: NOW - 20_000,
      lastSeen: NOW,
      eventCount: 3,
      sessionCount: 2,
      status: 'new',
    });
    const [group] = store.listCrashGroups();
    expect(group?.eventCount).toBe(4);
    expect(group?.sessionCount).toBe(3);
    expect(group?.firstSeen).toBe(NOW - 20_000);
    expect(group?.lastSeen).toBe(NOW);

    store.setCrashGroupStatus('fp-1', 'investigating');
    expect(store.listCrashGroups({ status: 'investigating' })[0]?.fingerprint).toBe('fp-1');
    expect(store.listCrashGroups({ status: 'resolved' })).toHaveLength(0);
  });
});

describe('DashboardStore — bug reports', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('insert + update (status) + filter by status', () => {
    store = openInMemory();
    store.insertBugReport({
      id: 'bug-1',
      sessionId: 'session-a',
      submittedAt: NOW,
      title: 'shake report',
      status: 'new',
      attachments: { screenshotUrl: 'data:image/png;base64,aaa' },
      eventIds: ['1', '2'],
    });
    store.updateBugReport('bug-1', { status: 'assigned', assignee: 'juba' });

    const [report] = store.listBugReports({ status: 'assigned' });
    expect(report?.status).toBe('assigned');
    expect(report?.assignee).toBe('juba');
    expect(report?.attachments?.screenshotUrl).toContain('base64');
    expect(report?.eventIds).toEqual(['1', '2']);
  });
});

describe('DashboardStore — alerts', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('saveAlertRule round-trips booleans and channels array; deleteAlertRule removes it', () => {
    store = openInMemory();
    store.saveAlertRule({
      id: 'rule-1',
      name: 'Crash spike',
      metric: 'crash_count',
      threshold: 10,
      windowSeconds: 300,
      channels: ['slack', 'email'],
      cooldownSeconds: 600,
      enabled: true,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const [rule] = store.listAlertRules();
    expect(rule?.enabled).toBe(true);
    expect(rule?.channels).toEqual(['slack', 'email']);

    expect(store.deleteAlertRule('rule-1')).toBe(true);
    expect(store.deleteAlertRule('rule-1')).toBe(false);
    expect(store.listAlertRules()).toHaveLength(0);
  });

  test('insertAlertFiring + listAlertHistory filters by rule and time window', () => {
    store = openInMemory();
    store.insertAlertFiring({
      id: 'fire-1',
      ruleId: 'rule-1',
      firedAt: NOW - 10_000,
      metricValue: 42,
      severity: 'critical',
    });
    store.insertAlertFiring({
      id: 'fire-2',
      ruleId: 'rule-2',
      firedAt: NOW,
      metricValue: 3,
      severity: 'warning',
    });
    expect(store.listAlertHistory({ ruleId: 'rule-1' }).map((f) => f.id)).toEqual(['fire-1']);
    expect(store.listAlertHistory({ since: NOW - 1_000 }).map((f) => f.id)).toEqual(['fire-2']);
  });
});

describe('DashboardStore — symbol files (v2)', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('saveSymbolFile + listSymbolFiles + findSymbolFile round-trip', () => {
    store = openInMemory();
    store.saveSymbolFile({
      id: 'sym-a',
      platform: 'android',
      bundleId: 'com.example.app',
      version: '1.0.0',
      filename: 'mapping.txt',
      sizeBytes: 512,
      uploadedAt: NOW - 10_000,
      entryCount: 0,
      uuid: null,
      mappingText: 'com.example.MainActivity -> a.b.c:',
    });
    store.saveSymbolFile({
      id: 'sym-b',
      platform: 'android',
      bundleId: 'com.example.app',
      version: '1.0.0',
      filename: 'mapping.txt',
      sizeBytes: 800,
      uploadedAt: NOW, // newer
      entryCount: 1,
      uuid: null,
      mappingText: null,
    });
    const list = store.listSymbolFiles({ platform: 'android' });
    expect(list.map((f) => f.id)).toEqual(['sym-b', 'sym-a']); // uploaded_at DESC
    const freshest = store.findSymbolFile('android', 'com.example.app', '1.0.0');
    expect(freshest?.id).toBe('sym-b');
    expect(store.deleteSymbolFile('sym-a')).toBe(true);
    expect(store.deleteSymbolFile('sym-a')).toBe(false);
    expect(store.getSymbolFile('sym-b')?.id).toBe('sym-b');
  });
});

describe('DashboardStore — DSAR summary + export', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('summariseUserData returns counts + event-type breakdown for a user', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 's1', userId: 'user_x', startedAt: NOW - 60_000 }));
    store.upsertSession(makeSession({ id: 's2', userId: 'user_y', startedAt: NOW - 40_000 }));
    store.insertEvent(makeEvent({ id: 'e1', userId: 'user_x', type: 'custom', sessionId: 's1' }));
    store.insertEvent(makeEvent({ id: 'e2', userId: 'user_x', type: 'crash', sessionId: 's1' }));
    store.insertEvent(makeEvent({ id: 'e3', userId: 'user_x', type: 'crash', sessionId: 's1' }));
    store.insertEvent(makeEvent({ id: 'e4', userId: 'user_y', type: 'custom', sessionId: 's2' }));

    const summary = store.summariseUserData('user_x');
    expect(summary.sessionCount).toBe(1);
    expect(summary.eventCount).toBe(3);
    expect(summary.crashCount).toBe(2);
    expect(summary.eventTypes.find((t) => t.type === 'crash')?.count).toBe(2);
    expect(summary.eventTypes.find((t) => t.type === 'custom')?.count).toBe(1);

    const exported = store.exportUserData('user_x');
    expect(exported.userId).toBe('user_x');
    expect(exported.sessions.map((s) => s.id)).toEqual(['s1']);
    expect(exported.events.map((e) => e.id).sort()).toEqual(['e1', 'e2', 'e3']);
  });
});

describe('DashboardStore — server settings (v3)', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('getSetting/setSetting upsert semantics + listSettings ordering', () => {
    store = openInMemory();
    expect(store.getSetting('retention_days')).toBeNull();
    store.setSetting('retention_days', '30');
    expect(store.getSetting('retention_days')).toBe('30');
    store.setSetting('retention_days', '60');
    expect(store.getSetting('retention_days')).toBe('60');
    store.setSetting('ws_auth_token', 'abc123');
    const rows = store.listSettings();
    expect(rows.map((r) => r.key)).toEqual(['retention_days', 'ws_auth_token']);
  });

  test('resetAllUserData wipes user-data tables but preserves server_settings', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 's1' }));
    store.insertEvent(makeEvent({ id: 'e1' }));
    store.saveSymbolFile({
      id: 'sym-a',
      platform: 'android',
      bundleId: 'x',
      version: '1',
      filename: 'm.txt',
      sizeBytes: 10,
      uploadedAt: NOW,
      entryCount: 0,
      uuid: null,
      mappingText: null,
    });
    store.setSetting('retention_days', '90');

    const counts = store.resetAllUserData();
    expect(counts.events).toBeGreaterThanOrEqual(1);
    expect(counts.sessions).toBeGreaterThanOrEqual(1);
    expect(counts.symbol_files).toBeGreaterThanOrEqual(1);

    expect(store.listEvents()).toHaveLength(0);
    expect(store.listSessions()).toHaveLength(0);
    expect(store.listSymbolFiles()).toHaveLength(0);
    // Settings survive the reset.
    expect(store.getSetting('retention_days')).toBe('90');
  });
});

describe('DashboardStore — durability', () => {
  test('data persists across close + reopen on a real file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'erne-monitor-store-'));
    const dbPath = join(dir, 'dashboard.db');
    try {
      const a = new DashboardStore({ dbPath });
      a.upsertSession(makeSession({ id: 'session-a' }));
      a.insertEvent(makeEvent({ id: 'e1' }));
      a.close();

      const b = new DashboardStore({ dbPath });
      expect(b.getSession('session-a')?.id).toBe('session-a');
      expect(b.listEvents().map((e) => e.id)).toEqual(['e1']);
      b.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('defaultDashboardDbPath', () => {
  test('lives under ~/.erne/monitor', () => {
    expect(defaultDashboardDbPath()).toMatch(/\.erne\/monitor\/dashboard\.db$/);
  });
});

describe('DashboardStore — purgeOlderThan (Task 117.71)', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('deletes only events with timestamp strictly below cutoff', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 's1', startedAt: NOW - 100_000 }));
    store.insertEvent(makeEvent({ id: 'old-1', sessionId: 's1', timestamp: NOW - 50_000 }));
    store.insertEvent(makeEvent({ id: 'old-2', sessionId: 's1', timestamp: NOW - 40_000 }));
    store.insertEvent(makeEvent({ id: 'boundary', sessionId: 's1', timestamp: NOW - 30_000 }));
    store.insertEvent(makeEvent({ id: 'new-1', sessionId: 's1', timestamp: NOW - 10_000 }));

    const result = store.purgeOlderThan(NOW - 30_000);

    // `< cutoff` — the boundary row survives.
    expect(result.events).toBe(2);
    const remaining = store.listEvents().map((e) => e.id);
    expect(remaining.sort()).toEqual(['boundary', 'new-1']);
  });

  test('drops sessions only when orphaned AND older than cutoff', () => {
    store = openInMemory();
    // Session A: old, events all purged → should drop.
    store.upsertSession(makeSession({ id: 'sa', startedAt: NOW - 200_000 }));
    store.insertEvent(makeEvent({ id: 'a1', sessionId: 'sa', timestamp: NOW - 180_000 }));
    // Session B: old but still has a fresh event → session survives.
    store.upsertSession(makeSession({ id: 'sb', startedAt: NOW - 200_000 }));
    store.insertEvent(makeEvent({ id: 'b1', sessionId: 'sb', timestamp: NOW - 180_000 }));
    store.insertEvent(makeEvent({ id: 'b2', sessionId: 'sb', timestamp: NOW - 10_000 }));
    // Session C: recent, no telemetry yet → session survives.
    store.upsertSession(makeSession({ id: 'sc', startedAt: NOW - 5_000 }));

    const result = store.purgeOlderThan(NOW - 30_000);

    expect(result.sessions).toBe(1);
    const sessionIds = store.listSessions().map((s) => s.id).sort();
    expect(sessionIds).toEqual(['sb', 'sc']);
  });

  test('purges bug_reports + alert_history by their own timestamp columns', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 's1' }));
    store.insertBugReport({
      id: 'bug-old',
      sessionId: 's1',
      submittedAt: NOW - 100_000,
      status: 'new',
    });
    store.insertBugReport({
      id: 'bug-new',
      sessionId: 's1',
      submittedAt: NOW - 1_000,
      status: 'new',
    });
    store.insertAlertFiring({
      id: 'fire-old',
      ruleId: 'rule-1',
      firedAt: NOW - 100_000,
      metricValue: 1,
      severity: 'error',
    });
    store.insertAlertFiring({
      id: 'fire-new',
      ruleId: 'rule-1',
      firedAt: NOW - 1_000,
      metricValue: 1,
      severity: 'error',
    });

    const result = store.purgeOlderThan(NOW - 50_000);

    expect(result.bugReports).toBe(1);
    expect(result.alertHistory).toBe(1);
    expect(store.listBugReports().map((b) => b.id)).toEqual(['bug-new']);
    expect(store.listAlertHistory().map((h) => h.id)).toEqual(['fire-new']);
  });

  test('cutoff in the future removes nothing', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 's1' }));
    store.insertEvent(makeEvent({ id: 'e1' }));
    const result = store.purgeOlderThan(0);
    expect(result).toEqual({
      events: 0,
      sessions: 0,
      bugReports: 0,
      alertHistory: 0,
      aiActions: 0,
    });
    expect(store.listEvents()).toHaveLength(1);
    expect(store.listSessions()).toHaveLength(1);
  });

  test('preserves crash groups, symbol files, alert rules, and server_settings', () => {
    store = openInMemory();
    store.upsertCrashGroup({
      fingerprint: 'fp-1',
      message: 'boom',
      firstSeen: NOW - 200_000,
      lastSeen: NOW - 180_000,
      eventCount: 3,
      sessionCount: 1,
      status: 'new',
    });
    store.saveSymbolFile({
      id: 'sym-1',
      platform: 'ios',
      bundleId: 'com.acme',
      version: '1.0',
      filename: 'map.txt',
      sizeBytes: 0,
      uploadedAt: NOW - 200_000,
      entryCount: 0,
      uuid: null,
      mappingText: null,
    });
    store.saveAlertRule({
      id: 'rule-1',
      name: 'crash spike',
      metric: 'crash.count',
      threshold: 1,
      windowSeconds: 60,
      channels: ['email'],
      cooldownSeconds: 300,
      enabled: true,
      createdAt: NOW - 200_000,
      updatedAt: NOW - 200_000,
    });
    store.setSetting('retention_days', '7');

    store.purgeOlderThan(NOW);

    expect(store.listCrashGroups()).toHaveLength(1);
    expect(store.listSymbolFiles()).toHaveLength(1);
    expect(store.listAlertRules()).toHaveLength(1);
    expect(store.getSetting('retention_days')).toBe('7');
  });
});

describe('DashboardStore — AI action audit (Task 117.81)', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('inserts and lists rows newest-first', () => {
    store = openInMemory();
    store.insertAiAction({
      id: 'act-1',
      timestamp: NOW - 5000,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      fingerprint: 'fp-a',
      outcome: 'proposed',
      confidence: 80,
      classification: 'null-check',
      prUrl: 'https://github.com/o/r/pull/1',
      filesConsidered: ['src/Home.tsx'],
    });
    store.insertAiAction({
      id: 'act-2',
      timestamp: NOW - 1000,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      fingerprint: 'fp-b',
      outcome: 'skipped',
      metadata: { reason: 'confidence-too-low' },
    });
    const rows = store.listAiActions();
    expect(rows.map((r) => r.id)).toEqual(['act-2', 'act-1']);
    expect(rows[0]?.metadata).toEqual({ reason: 'confidence-too-low' });
    expect(rows[1]?.prUrl).toBe('https://github.com/o/r/pull/1');
    expect(rows[1]?.filesConsidered).toEqual(['src/Home.tsx']);
  });

  test('insert is idempotent on id (returns inserted=false on retry)', () => {
    store = openInMemory();
    const r1 = store.insertAiAction({
      id: 'act-x',
      timestamp: NOW,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      outcome: 'proposed',
    });
    const r2 = store.insertAiAction({
      id: 'act-x',
      timestamp: NOW + 100,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      outcome: 'proposed',
    });
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(store.listAiActions()).toHaveLength(1);
  });

  test('filters by agent + outcome + fingerprint + time range', () => {
    store = openInMemory();
    for (let i = 0; i < 10; i++) {
      store.insertAiAction({
        id: `act-${i}`,
        timestamp: NOW - i * 1000,
        agent: i < 5 ? 'ai-fix-pr' : 'mcp-tool',
        action: 'invoked',
        fingerprint: i % 2 === 0 ? 'fp-a' : 'fp-b',
        outcome: i % 3 === 0 ? 'errored' : 'invoked',
      });
    }
    expect(store.listAiActions({ agent: 'ai-fix-pr' })).toHaveLength(5);
    expect(store.listAiActions({ outcome: 'errored' })).toHaveLength(4);
    expect(store.listAiActions({ outcome: ['errored', 'invoked'] })).toHaveLength(10);
    expect(store.listAiActions({ fingerprint: 'fp-a' })).toHaveLength(5);
    // since cutoff at NOW-3500 → entries 0..3 survive
    expect(store.listAiActions({ since: NOW - 3500 })).toHaveLength(4);
    expect(store.countAiActions({ agent: 'mcp-tool' })).toBe(5);
  });

  test('audit rows decay with retention purge', () => {
    store = openInMemory();
    store.insertAiAction({
      id: 'old',
      timestamp: NOW - 100_000,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      outcome: 'proposed',
    });
    store.insertAiAction({
      id: 'new',
      timestamp: NOW - 1000,
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      outcome: 'proposed',
    });
    const result = store.purgeOlderThan(NOW - 50_000);
    expect(result.aiActions).toBe(1);
    expect(store.listAiActions().map((r) => r.id)).toEqual(['new']);
  });
});

describe('DashboardStore — notifications (Task 117.19)', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  function makeNotification(partial: Partial<NotificationRecord> = {}): NotificationRecord {
    return {
      id: partial.id ?? `notif-${Math.random().toString(36).slice(2)}`,
      createdAt: partial.createdAt ?? NOW,
      severity: partial.severity ?? 'critical',
      title: partial.title ?? 'Crash spike',
      body: partial.body ?? 'Crash spike: crash_count = 7 >= 5 in 300s',
      read: partial.read ?? false,
      ...partial,
    };
  }

  test('creates the notifications table and bumps the migration count', () => {
    store = openInMemory();
    expect(store.selfCheck().tables).toContain('notifications');
    expect(store.listAppliedMigrations()).toHaveLength(DEFAULT_MIGRATIONS.length);
    // Sanity: v5 is the notifications migration.
    expect(DEFAULT_MIGRATIONS.find((m) => m.version === 5)?.name).toBe('notifications');
  });

  test('insert + list newest-first, round-tripping optional fields', () => {
    store = openInMemory();
    store.insertNotification(
      makeNotification({ id: 'n1', createdAt: NOW - 2000, ruleId: 'r1', firingId: 'f1', metadata: { test: true } }),
    );
    store.insertNotification(makeNotification({ id: 'n2', createdAt: NOW - 1000 }));
    const list = store.listNotifications();
    expect(list.map((n) => n.id)).toEqual(['n2', 'n1']);
    const n1 = list.find((n) => n.id === 'n1');
    expect(n1?.ruleId).toBe('r1');
    expect(n1?.firingId).toBe('f1');
    expect(n1?.metadata).toEqual({ test: true });
    expect(n1?.read).toBe(false);
  });

  test('insert is idempotent on id', () => {
    store = openInMemory();
    expect(store.insertNotification(makeNotification({ id: 'dup' })).inserted).toBe(true);
    expect(store.insertNotification(makeNotification({ id: 'dup' })).inserted).toBe(false);
    expect(store.listNotifications()).toHaveLength(1);
  });

  test('unreadOnly filter + markNotificationRead + countUnread', () => {
    store = openInMemory();
    store.insertNotification(makeNotification({ id: 'a' }));
    store.insertNotification(makeNotification({ id: 'b' }));
    expect(store.countUnreadNotifications()).toBe(2);
    expect(store.markNotificationRead('a')).toBe(true);
    expect(store.markNotificationRead('missing')).toBe(false);
    expect(store.countUnreadNotifications()).toBe(1);
    expect(store.listNotifications({ unreadOnly: true }).map((n) => n.id)).toEqual(['b']);
  });

  test('limit caps the result set', () => {
    store = openInMemory();
    for (let i = 0; i < 5; i++) {
      store.insertNotification(makeNotification({ id: `n${i}`, createdAt: NOW - i }));
    }
    expect(store.listNotifications({ limit: 2 })).toHaveLength(2);
  });

  test('notifications decay with the retention purge', () => {
    store = openInMemory();
    store.insertNotification(makeNotification({ id: 'old', createdAt: NOW - 100_000 }));
    store.insertNotification(makeNotification({ id: 'fresh', createdAt: NOW - 1000 }));
    store.purgeOlderThan(NOW - 50_000);
    expect(store.listNotifications().map((n) => n.id)).toEqual(['fresh']);
  });
});

describe('DashboardStore — operator audit log (Task 117.65)', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  function makeAudit(partial: Partial<AuditLogRecord> = {}): AuditLogRecord {
    return {
      id: partial.id ?? `aud-${Math.random().toString(36).slice(2)}`,
      timestamp: partial.timestamp ?? NOW,
      actor: partial.actor ?? 'operator-1',
      action: partial.action ?? 'config-change',
      ...partial,
    };
  }

  test('creates the audit_log table at the latest migration', () => {
    store = openInMemory();
    expect(store.selfCheck().tables).toContain('audit_log');
    expect(DEFAULT_MIGRATIONS.at(-1)?.name).toBe('audit_log');
  });

  test('record + list newest-first, round-tripping optional fields', () => {
    store = openInMemory();
    store.recordAuditLog(
      makeAudit({
        id: 'a1',
        timestamp: NOW - 2000,
        action: 'export',
        targetType: 'user',
        targetId: 'user-42',
        ip: '203.0.113.7',
        metadata: { sessions: 3, events: 120 },
      }),
    );
    store.recordAuditLog(makeAudit({ id: 'a2', timestamp: NOW - 1000, action: 'delete' }));
    const rows = store.listAuditLogs();
    expect(rows.map((r) => r.id)).toEqual(['a2', 'a1']);
    const a1 = rows.find((r) => r.id === 'a1');
    expect(a1?.targetType).toBe('user');
    expect(a1?.targetId).toBe('user-42');
    expect(a1?.ip).toBe('203.0.113.7');
    expect(a1?.metadata).toEqual({ sessions: 3, events: 120 });
  });

  test('record is idempotent on id (returns inserted=false on retry)', () => {
    store = openInMemory();
    const r1 = store.recordAuditLog(makeAudit({ id: 'dup' }));
    const r2 = store.recordAuditLog(makeAudit({ id: 'dup', action: 'delete' }));
    expect(r1.inserted).toBe(true);
    expect(r2.inserted).toBe(false);
    expect(store.listAuditLogs()).toHaveLength(1);
  });

  test('filters by action + actor + target + time range; counts match', () => {
    store = openInMemory();
    for (let i = 0; i < 10; i++) {
      store.recordAuditLog(
        makeAudit({
          id: `e${i}`,
          timestamp: NOW - i * 1000,
          actor: i < 5 ? 'alice' : 'bob',
          action: i % 2 === 0 ? 'export' : 'delete',
          targetType: 'user',
          targetId: i % 3 === 0 ? 'user-a' : 'user-b',
        }),
      );
    }
    expect(store.listAuditLogs({ actor: 'alice' })).toHaveLength(5);
    expect(store.listAuditLogs({ action: 'export' })).toHaveLength(5);
    expect(store.listAuditLogs({ action: ['export', 'delete'] })).toHaveLength(10);
    expect(store.listAuditLogs({ targetType: 'user', targetId: 'user-a' })).toHaveLength(4);
    // since cutoff at NOW-3500 → entries 0..3 survive
    expect(store.listAuditLogs({ since: NOW - 3500 })).toHaveLength(4);
    expect(store.countAuditLogs({ actor: 'bob' })).toBe(5);
  });

  test('pagination via limit + offset', () => {
    store = openInMemory();
    for (let i = 0; i < 5; i++) {
      store.recordAuditLog(makeAudit({ id: `p${i}`, timestamp: NOW - i }));
    }
    expect(store.listAuditLogs({ limit: 2 }).map((r) => r.id)).toEqual(['p0', 'p1']);
    expect(store.listAuditLogs({ limit: 2, offset: 2 }).map((r) => r.id)).toEqual(['p2', 'p3']);
  });

  test('audit rows decay with the retention purge', () => {
    store = openInMemory();
    store.recordAuditLog(makeAudit({ id: 'old', timestamp: NOW - 100_000 }));
    store.recordAuditLog(makeAudit({ id: 'fresh', timestamp: NOW - 1000 }));
    store.purgeOlderThan(NOW - 50_000);
    expect(store.listAuditLogs().map((r) => r.id)).toEqual(['fresh']);
  });

  test('resetAllUserData wipes the audit log too', () => {
    store = openInMemory();
    store.recordAuditLog(makeAudit({ id: 'x' }));
    expect(store.listAuditLogs()).toHaveLength(1);
    store.resetAllUserData();
    expect(store.listAuditLogs()).toHaveLength(0);
  });
});
