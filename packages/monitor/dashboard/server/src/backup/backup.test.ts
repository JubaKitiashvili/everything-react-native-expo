import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DashboardStore } from '../storage/sqliteStore.js';
import type { EventRecord, SessionRecord } from '../storage/types.js';
import { backupStore, parseBackupFile, restoreStore, runBackupCli } from './backup.js';

const NOW = 1_770_000_000_000;

function openInMemory(): DashboardStore {
  return new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
}

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

/** Populate a store with a representative row in each backup table. */
function seed(store: DashboardStore): void {
  store.upsertSession(makeSession({ id: 'session-a', userId: 'u1', platform: 'ios' }));
  store.upsertSession(makeSession({ id: 'session-b' }));
  store.insertEvent(makeEvent({ id: 'e1', sessionId: 'session-a', fingerprint: 'fp1' }));
  store.insertEvent(makeEvent({ id: 'e2', sessionId: 'session-a', type: 'crash' }));
  store.insertEvent(makeEvent({ id: 'e3', sessionId: 'session-b' }));
  store.upsertCrashGroup({
    fingerprint: 'fp1',
    message: 'boom',
    firstSeen: NOW,
    lastSeen: NOW,
    eventCount: 1,
    sessionCount: 1,
    status: 'new',
    topScreen: 'Home',
    aiSuggestion: { fix: 'add null check' },
  });
  store.insertBugReport({
    id: 'bug1',
    sessionId: 'session-a',
    submittedAt: NOW,
    title: 'shake',
    status: 'new',
    eventIds: ['e1'],
  });
  store.saveAlertRule({
    id: 'rule1',
    name: 'crash spike',
    metric: 'crash_count',
    threshold: 5,
    windowSeconds: 300,
    channels: ['slack'],
    cooldownSeconds: 300,
    enabled: true,
    createdAt: NOW,
    updatedAt: NOW,
  });
  store.insertAlertFiring({
    id: 'fire1',
    ruleId: 'rule1',
    firedAt: NOW,
    metricValue: 7,
    severity: 'critical',
    payload: { x: 1 },
  });
  store.saveSymbolFile({
    id: 'sym1',
    platform: 'android',
    bundleId: 'com.app',
    version: '1.0.0',
    filename: 'mapping.txt',
    sizeBytes: 100,
    uploadedAt: NOW,
    entryCount: 3,
    uuid: null,
    mappingText: 'a.b.c -> d',
  });
  store.insertAiAction({
    id: 'ai1',
    timestamp: NOW,
    agent: 'ai-fix-pr',
    action: 'propose-fix',
    outcome: 'proposed',
    fingerprint: 'fp1',
    confidence: 80,
    toolsCalled: ['read_file'],
  });
  store.setSetting('retention_days', '30');
}

/** Snapshot all backup-table row counts. */
function counts(store: DashboardStore): Record<string, number> {
  const tables = store.exportAllTables();
  const out: Record<string, number> = {};
  for (const [name, rows] of Object.entries(tables)) out[name] = rows.length;
  return out;
}

describe('backupStore / restoreStore', () => {
  let dir: string;
  let store: DashboardStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'erne-backup-'));
    store = openInMemory();
  });

  afterEach(() => {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('backup writes a versioned file with all tables', () => {
    seed(store);
    const out = join(dir, 'backup.json');
    const result = backupStore(store, out);

    expect(result.path).toBe(out);
    // 2 sessions + 3 events + 1 crash group + 1 bug + 1 rule + 1 firing
    // + 1 symbol + 1 ai action + 1 setting = 12.
    expect(result.rowCount).toBe(12);
    expect(result.tables.events).toBe(3);
    expect(result.tables.sessions).toBe(2);
    expect(result.tables.server_settings).toBe(1);

    const parsed = parseBackupFile(
      // re-read off disk via restoreStore's parse path
      JSON.stringify({ version: 1, createdAt: 0, tables: store.exportAllTables() }),
    );
    expect(parsed.version).toBe(1);
    expect(Object.keys(parsed.tables)).toContain('ai_actions');
  });

  test('round-trip backup → restore (replace) preserves row counts', () => {
    seed(store);
    const before = counts(store);

    const out = join(dir, 'backup.json');
    backupStore(store, out);

    const fresh = openInMemory();
    try {
      const result = restoreStore(fresh, out, { mode: 'replace' });
      expect(result.mode).toBe('replace');
      expect(counts(fresh)).toEqual(before);
      expect(result.rowsWritten).toBe(
        Object.values(before).reduce((a, b) => a + b, 0),
      );
      // Spot-check round-trip fidelity of a JSON-bearing row.
      const groups = fresh.listCrashGroups();
      expect(groups[0]?.aiSuggestion).toEqual({ fix: 'add null check' });
      const events = fresh.listEvents({ fingerprint: 'fp1' });
      expect(events[0]?.id).toBe('e1');
    } finally {
      fresh.close();
    }
  });

  test('replace wipes pre-existing data before inserting', () => {
    seed(store);
    const out = join(dir, 'backup.json');
    backupStore(store, out);

    const target = openInMemory();
    try {
      // Pre-populate target with unrelated data that should be gone after replace.
      target.upsertSession(makeSession({ id: 'old-session' }));
      target.insertEvent(makeEvent({ id: 'old-event', sessionId: 'old-session' }));

      const result = restoreStore(target, out, { mode: 'replace' });
      expect(result.deleted).toBeDefined();
      expect(target.getSession('old-session')).toBeNull();
      expect(target.getSession('session-a')).not.toBeNull();
      expect(counts(target)).toEqual(counts(store));
    } finally {
      target.close();
    }
  });

  test('merge is idempotent — re-running adds nothing', () => {
    seed(store);
    const out = join(dir, 'backup.json');
    backupStore(store, out);

    const target = openInMemory();
    try {
      const first = restoreStore(target, out, { mode: 'merge' });
      expect(first.rowsWritten).toBeGreaterThan(0);
      const afterFirst = counts(target);

      const second = restoreStore(target, out, { mode: 'merge' });
      expect(second.rowsWritten).toBe(0); // every id already present
      expect(counts(target)).toEqual(afterFirst);
      expect(second.deleted).toBeUndefined();
    } finally {
      target.close();
    }
  });

  test('merge preserves existing rows, adds only new ids', () => {
    seed(store);
    const out = join(dir, 'backup.json');
    backupStore(store, out);

    const target = openInMemory();
    try {
      // Existing row with same id but different payload — merge must NOT overwrite.
      target.insertEvent(
        makeEvent({ id: 'e1', sessionId: 'session-a', payload: { local: true } }),
      );
      restoreStore(target, out, { mode: 'merge' });

      const e1 = target.listEvents({ sessionId: 'session-a' }).find((e) => e.id === 'e1');
      expect(e1?.payload).toEqual({ local: true }); // untouched
      // New ids from the backup still arrived.
      expect(target.listEvents({ sessionId: 'session-b' }).map((e) => e.id)).toContain('e3');
    } finally {
      target.close();
    }
  });

  test('default mode is merge', () => {
    seed(store);
    const out = join(dir, 'backup.json');
    backupStore(store, out);
    const target = openInMemory();
    try {
      const result = restoreStore(target, out);
      expect(result.mode).toBe('merge');
    } finally {
      target.close();
    }
  });

  test('empty store backs up and restores cleanly', () => {
    const out = join(dir, 'empty.json');
    const result = backupStore(store, out);
    expect(result.rowCount).toBe(0);

    const target = openInMemory();
    try {
      const restored = restoreStore(target, out, { mode: 'replace' });
      expect(restored.rowsWritten).toBe(0);
      expect(counts(target)).toEqual(counts(store));
    } finally {
      target.close();
    }
  });
});

describe('parseBackupFile validation', () => {
  test('rejects non-JSON', () => {
    expect(() => parseBackupFile('not json{')).toThrow(/invalid JSON/);
  });

  test('rejects missing version', () => {
    expect(() => parseBackupFile(JSON.stringify({ tables: {} }))).toThrow(/version/);
  });

  test('rejects future version', () => {
    expect(() =>
      parseBackupFile(JSON.stringify({ version: 999, tables: {} })),
    ).toThrow(/newer than supported/);
  });

  test('rejects missing tables', () => {
    expect(() => parseBackupFile(JSON.stringify({ version: 1 }))).toThrow(/tables/);
  });
});

describe('runBackupCli', () => {
  let dir: string;
  let store: DashboardStore;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'erne-backup-cli-'));
    store = openInMemory();
    seed(store);
  });

  afterEach(() => {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  });

  test('backup command writes a file', () => {
    const out = join(dir, 'cli.json');
    const result = runBackupCli(store, ['backup', out]);
    expect(result.ok).toBe(true);
    expect(result.command).toBe('backup');
    expect(result.backup?.path).toBe(out);
  });

  test('restore command (--replace) round-trips through CLI', () => {
    const out = join(dir, 'cli.json');
    runBackupCli(store, ['backup', out]);

    const target = openInMemory();
    try {
      const result = runBackupCli(target, ['restore', out, '--replace']);
      expect(result.ok).toBe(true);
      expect(result.restore?.mode).toBe('replace');
      expect(counts(target)).toEqual(counts(store));
    } finally {
      target.close();
    }
  });

  test('restore defaults to merge', () => {
    const out = join(dir, 'cli.json');
    runBackupCli(store, ['backup', out]);
    const target = openInMemory();
    try {
      const result = runBackupCli(target, ['restore', out]);
      expect(result.restore?.mode).toBe('merge');
    } finally {
      target.close();
    }
  });

  test('missing path reports usage error', () => {
    expect(runBackupCli(store, ['backup']).ok).toBe(false);
    expect(runBackupCli(store, ['restore']).ok).toBe(false);
  });

  test('unknown command reports error', () => {
    const result = runBackupCli(store, ['frobnicate']);
    expect(result.ok).toBe(false);
    expect(result.message).toMatch(/unknown command/);
  });
});
