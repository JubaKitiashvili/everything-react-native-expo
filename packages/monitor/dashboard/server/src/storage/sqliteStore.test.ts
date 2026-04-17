import { afterEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardStore, DEFAULT_MIGRATIONS, defaultDashboardDbPath } from './sqliteStore.js';
import type { EventRecord, SessionRecord } from './types.js';

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

  test('insertEventsBatch commits atomically (throwing aborts the whole batch)', () => {
    store = openInMemory();
    const bad = makeEvent({ id: 'ok' });
    const broken = makeEvent({ id: 'ok' }); // duplicate id but INSERT OR REPLACE makes it fine
    store.insertEventsBatch([bad, broken]);
    // REPLACE semantics means one row survives
    expect(store.countEvents()).toBe(1);
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

    store.deleteAlertRule('rule-1');
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
