// Task 117.71 — retention purge automation.
//
// Background job that periodically deletes telemetry older than the
// operator-configured retention window. The job reads `retention_days`
// from `server_settings` on every tick so runtime changes in the
// dashboard's Settings panel take effect without restarting the server.
//
// The job is deliberately tiny: one `setInterval`, one store call, no
// external deps, no cron library. `runOnce()` is exposed so tests can
// trigger a deterministic run without touching timers, and so operators
// can manually trigger a purge (future `/api/jobs/retention/run-now`)
// without waiting for the scheduler.

import type { IMonitorStore } from '../storage/IMonitorStore.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Default retention window when the `retention_days` setting is unset or
 * invalid. Matches the value `server.ts` advertises via `/api/settings`
 * so the job and the UI agree on what "the default" means.
 */
export const DEFAULT_RETENTION_DAYS = 14;

/**
 * Minimum interval between forced purges. Exposed so tests can replace
 * it with a much shorter value via `intervalMs`. Production defaults to
 * one hour — purging is cheap once the indices are warm, so running it
 * every hour keeps the DB honest without noticeable cost.
 */
export const DEFAULT_PURGE_INTERVAL_MS = ONE_HOUR_MS;

export interface RetentionPurgeJobOptions {
  store: IMonitorStore;
  /**
   * Interval between automatic runs in milliseconds. Defaults to 1 hour.
   * Tests typically pass a short value + fake timers.
   */
  intervalMs?: number;
  /**
   * Retention window used when the `retention_days` server setting is
   * absent or malformed. Defaults to 14. Must be a positive integer.
   */
  defaultRetentionDays?: number;
  /**
   * Clock injection for deterministic tests. Defaults to `Date.now`.
   */
  now?: () => number;
  /**
   * Structured logger for run completions. Called on every successful
   * `runOnce()` (including the scheduled runs).
   */
  logger?: (entry: RetentionPurgeLogEntry) => void;
  /**
   * Error hook. Called when a run throws — never rethrown into the
   * interval callback so a flaky DB can't kill the scheduler.
   */
  onError?: (err: Error) => void;
}

export interface RetentionPurgeResult {
  /** Wall-clock timestamp the run started. */
  ranAt: number;
  /** Cutoff threshold applied: rows with `time < cutoff` were deleted. */
  cutoff: number;
  /** Resolved retention window in days (after setting + default fallback). */
  retentionDays: number;
  /** Per-table delete counts from the store. */
  deleted: {
    events: number;
    sessions: number;
    bugReports: number;
    alertHistory: number;
    aiActions: number;
  };
  /** Total rows removed — sum of `deleted`. */
  totalDeleted: number;
  /** Wall-clock duration of the purge in milliseconds. */
  durationMs: number;
}

export interface RetentionPurgeLogEntry extends RetentionPurgeResult {
  source: 'scheduled' | 'manual';
}

/**
 * Coerce the `retention_days` setting into a usable positive integer.
 * Returns `null` when the value is missing, non-numeric, <1, or >3650
 * (10 years). The caller falls back to `defaultRetentionDays` when this
 * returns `null`.
 */
function coerceRetentionDays(raw: string | null): number | null {
  if (raw === null) return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  if (n < 1 || n > 3650) return null;
  return Math.round(n);
}

export class RetentionPurgeJob {
  private readonly store: IMonitorStore;
  private readonly intervalMs: number;
  private readonly defaultRetentionDays: number;
  private readonly now: () => number;
  private readonly logger?: (entry: RetentionPurgeLogEntry) => void;
  private readonly onError?: (err: Error) => void;

  private timer: NodeJS.Timeout | null = null;
  private lastResultValue: RetentionPurgeResult | null = null;

  constructor(options: RetentionPurgeJobOptions) {
    this.store = options.store;
    this.intervalMs = options.intervalMs ?? DEFAULT_PURGE_INTERVAL_MS;
    this.defaultRetentionDays = options.defaultRetentionDays ?? DEFAULT_RETENTION_DAYS;
    this.now = options.now ?? Date.now;
    if (options.logger) this.logger = options.logger;
    if (options.onError) this.onError = options.onError;
  }

  /**
   * Begin the scheduled interval. Idempotent: calling `start()` twice
   * without an intervening `stop()` is a no-op. The timer is `unref()`'d
   * so it doesn't keep the Node process alive on its own — the server's
   * HTTP socket controls liveness, not this job.
   */
  start(): void {
    if (this.timer !== null) return;
    this.timer = setInterval(() => {
      try {
        const result = this.runOnce();
        this.logger?.({ ...result, source: 'scheduled' });
      } catch (err) {
        this.onError?.(err as Error);
      }
    }, this.intervalMs);
    // `unref` lets the process exit if nothing else keeps it alive.
    this.timer.unref?.();
  }

  /** Stop the scheduler. Idempotent. */
  stop(): void {
    if (this.timer === null) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  /**
   * Execute a purge immediately. Synchronous — the store interface is
   * synchronous by design (see IMonitorStore doc). Returns the result so
   * callers (manual admin endpoints, tests) can inspect what happened.
   */
  runOnce(): RetentionPurgeResult {
    const ranAt = this.now();
    const retentionDays =
      coerceRetentionDays(this.store.getSetting('retention_days')) ?? this.defaultRetentionDays;
    const cutoff = ranAt - retentionDays * ONE_DAY_MS;
    const started = ranAt;
    const deleted = this.store.purgeOlderThan(cutoff);
    const durationMs = this.now() - started;
    const totalDeleted =
      deleted.events +
      deleted.sessions +
      deleted.bugReports +
      deleted.alertHistory +
      deleted.aiActions;
    const result: RetentionPurgeResult = {
      ranAt,
      cutoff,
      retentionDays,
      deleted,
      totalDeleted,
      durationMs,
    };
    this.lastResultValue = result;
    return result;
  }

  /** Last result (scheduled or manual). `null` until the first run. */
  lastResult(): RetentionPurgeResult | null {
    return this.lastResultValue;
  }

  /** True while the interval is armed. Exposed for health checks. */
  isRunning(): boolean {
    return this.timer !== null;
  }
}
