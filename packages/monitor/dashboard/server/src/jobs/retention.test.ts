// Task 117.71 — retention purge job tests.

import { afterEach, describe, expect, test, vi } from 'vitest';
import { DashboardStore } from '../storage/sqliteStore.js';
import {
  DEFAULT_PURGE_INTERVAL_MS,
  DEFAULT_RETENTION_DAYS,
  RetentionPurgeJob,
  type RetentionPurgeLogEntry,
} from './retention.js';
import type { EventRecord, SessionRecord } from '../storage/types.js';

const NOW = 1_770_000_000_000;
const DAY_MS = 24 * 60 * 60 * 1000;

function openInMemory(): DashboardStore {
  return new DashboardStore({ dbPath: ':memory:', skipProductionPragmas: true });
}

function makeSession(partial: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: partial.id ?? 'session-a',
    startedAt: partial.startedAt ?? NOW,
    eventCount: partial.eventCount ?? 0,
    crashCount: partial.crashCount ?? 0,
    ...partial,
  };
}

function makeEvent(partial: Partial<EventRecord> = {}): EventRecord {
  return {
    id: partial.id ?? `evt-${Math.random().toString(36).slice(2)}`,
    type: partial.type ?? 'custom',
    severity: partial.severity ?? 'info',
    sessionId: partial.sessionId ?? 'session-a',
    timestamp: partial.timestamp ?? NOW,
    receivedAt: partial.receivedAt ?? NOW,
    payload: partial.payload ?? { value: 1 },
    ...partial,
  };
}

describe('RetentionPurgeJob — runOnce', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('acceptance: 100 old + 100 new events, runs purge, 100 remain', () => {
    store = openInMemory();
    store.upsertSession(makeSession({ id: 'session-a', startedAt: NOW - 30 * DAY_MS }));
    const retentionDays = 14;
    const cutoff = NOW - retentionDays * DAY_MS;
    // 100 "old" — just before cutoff.
    for (let i = 0; i < 100; i++) {
      store.insertEvent(
        makeEvent({ id: `old-${i}`, timestamp: cutoff - 1_000 - i }),
      );
    }
    // 100 "new" — just after cutoff.
    for (let i = 0; i < 100; i++) {
      store.insertEvent(
        makeEvent({ id: `new-${i}`, timestamp: cutoff + 1_000 + i }),
      );
    }
    store.setSetting('retention_days', String(retentionDays));

    const job = new RetentionPurgeJob({ store, now: () => NOW });
    const result = job.runOnce();

    expect(result.deleted.events).toBe(100);
    expect(result.retentionDays).toBe(retentionDays);
    expect(result.cutoff).toBe(cutoff);
    expect(result.totalDeleted).toBeGreaterThanOrEqual(100);

    const remaining = store.listEvents({ limit: 1000 });
    expect(remaining).toHaveLength(100);
    expect(remaining.every((e) => e.id.startsWith('new-'))).toBe(true);
  });

  test('uses defaultRetentionDays when setting is missing', () => {
    store = openInMemory();
    const job = new RetentionPurgeJob({
      store,
      now: () => NOW,
      defaultRetentionDays: 30,
    });
    const result = job.runOnce();
    expect(result.retentionDays).toBe(30);
    expect(result.cutoff).toBe(NOW - 30 * DAY_MS);
  });

  test('falls back to DEFAULT_RETENTION_DAYS when setting is malformed', () => {
    store = openInMemory();
    store.setSetting('retention_days', 'not-a-number');
    const job = new RetentionPurgeJob({ store, now: () => NOW });
    const result = job.runOnce();
    expect(result.retentionDays).toBe(DEFAULT_RETENTION_DAYS);
  });

  test('respects the retention_days setting at call time (re-reads on every run)', () => {
    store = openInMemory();
    const job = new RetentionPurgeJob({ store, now: () => NOW });
    store.setSetting('retention_days', '7');
    expect(job.runOnce().retentionDays).toBe(7);
    store.setSetting('retention_days', '30');
    expect(job.runOnce().retentionDays).toBe(30);
  });

  test('lastResult() exposes the most recent purge outcome', () => {
    store = openInMemory();
    const job = new RetentionPurgeJob({ store, now: () => NOW });
    expect(job.lastResult()).toBeNull();
    const a = job.runOnce();
    expect(job.lastResult()).toBe(a);
    const b = job.runOnce();
    expect(job.lastResult()).toBe(b);
  });

  test('cascades to sessions, bug_reports, and alert_history', () => {
    store = openInMemory();
    const cutoff = NOW - 14 * DAY_MS;
    store.upsertSession(makeSession({ id: 'old-session', startedAt: cutoff - 100_000 }));
    store.insertEvent(makeEvent({ sessionId: 'old-session', timestamp: cutoff - 50_000 }));
    store.insertBugReport({
      id: 'old-bug',
      sessionId: 'old-session',
      submittedAt: cutoff - 50_000,
      status: 'new',
    });
    store.insertAlertFiring({
      id: 'old-fire',
      ruleId: 'rule-1',
      firedAt: cutoff - 50_000,
      metricValue: 1,
      severity: 'error',
    });

    const job = new RetentionPurgeJob({ store, now: () => NOW });
    const { deleted } = job.runOnce();

    expect(deleted.events).toBe(1);
    expect(deleted.sessions).toBe(1);
    expect(deleted.bugReports).toBe(1);
    expect(deleted.alertHistory).toBe(1);
  });

  test('retention_days setting clamped to 1..3650; out-of-range falls back to default', () => {
    store = openInMemory();
    store.setSetting('retention_days', '0');
    expect(new RetentionPurgeJob({ store, now: () => NOW }).runOnce().retentionDays).toBe(
      DEFAULT_RETENTION_DAYS,
    );
    store.setSetting('retention_days', '999999');
    expect(new RetentionPurgeJob({ store, now: () => NOW }).runOnce().retentionDays).toBe(
      DEFAULT_RETENTION_DAYS,
    );
    store.setSetting('retention_days', '365');
    expect(new RetentionPurgeJob({ store, now: () => NOW }).runOnce().retentionDays).toBe(365);
  });
});

describe('RetentionPurgeJob — scheduler', () => {
  let store: DashboardStore;
  afterEach(() => {
    vi.useRealTimers();
    store?.close();
  });

  test('start() triggers runs at intervalMs; stop() disarms the timer', () => {
    vi.useFakeTimers();
    store = openInMemory();
    const logger = vi.fn<(entry: RetentionPurgeLogEntry) => void>();
    const job = new RetentionPurgeJob({
      store,
      intervalMs: 1_000,
      logger,
      now: () => NOW,
    });
    job.start();
    expect(job.isRunning()).toBe(true);
    vi.advanceTimersByTime(3_500);
    expect(logger).toHaveBeenCalledTimes(3);
    expect(logger.mock.calls[0]?.[0].source).toBe('scheduled');
    job.stop();
    expect(job.isRunning()).toBe(false);
    vi.advanceTimersByTime(5_000);
    expect(logger).toHaveBeenCalledTimes(3);
  });

  test('start() is idempotent — second call does not double-arm', () => {
    vi.useFakeTimers();
    store = openInMemory();
    const logger = vi.fn<(entry: RetentionPurgeLogEntry) => void>();
    const job = new RetentionPurgeJob({
      store,
      intervalMs: 1_000,
      logger,
      now: () => NOW,
    });
    job.start();
    job.start();
    vi.advanceTimersByTime(1_000);
    expect(logger).toHaveBeenCalledTimes(1);
    job.stop();
  });

  test('scheduler swallows errors via onError hook so the timer survives', () => {
    vi.useFakeTimers();
    const throwingStore = {
      getSetting: () => null,
      purgeOlderThan: () => {
        throw new Error('db down');
      },
    };
    const onError = vi.fn<(err: Error) => void>();
    const job = new RetentionPurgeJob({
      // The constructor only sees the methods it actually calls on the
      // store — a shim with the two we touch is enough.
      store: throwingStore as unknown as DashboardStore,
      intervalMs: 1_000,
      onError,
      now: () => NOW,
    });
    job.start();
    vi.advanceTimersByTime(2_500);
    expect(onError).toHaveBeenCalledTimes(2);
    expect(onError.mock.calls[0]?.[0].message).toBe('db down');
    job.stop();
  });

  test('DEFAULT_PURGE_INTERVAL_MS is one hour', () => {
    expect(DEFAULT_PURGE_INTERVAL_MS).toBe(60 * 60 * 1000);
  });
});

describe('RetentionPurgeJob — timing metadata', () => {
  let store: DashboardStore;
  afterEach(() => store?.close());

  test('returns a non-negative durationMs and records ranAt from now()', () => {
    store = openInMemory();
    let t = NOW;
    const job = new RetentionPurgeJob({
      store,
      now: () => {
        const v = t;
        t += 5;
        return v;
      },
    });
    const result = job.runOnce();
    expect(result.ranAt).toBe(NOW);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
