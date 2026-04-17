import type {
  ErneMonitorNativeModule,
  NativeANRReport,
  NativeCrashReport,
  NativeDualThreadFPSReport,
  NativeErrorRecord,
  NativeEventMap,
  NativeEventName,
  NativeFabricCommitReport,
  NativeMetricsSnapshot,
  NativeModuleLoader,
  NativeMonitorState,
  NativeSubscription,
  NativeThermalEvent,
  PersistedCrashRecord,
} from './types';
import { NOOP_NATIVE_SUBSCRIPTION, UNKNOWN_NATIVE_METRICS } from './types';

/**
 * Lazy loader — calls its impl once, caches the result (including null),
 * and swallows any exception the impl throws. The SDK uses this to defer
 * `requireNativeModule` until the first time native monitoring is needed,
 * which lets Expo Go / unit tests / dev-only bundles boot without the
 * native module being linked.
 */
export class LazyNativeModuleLoader implements NativeModuleLoader {
  private cached: ErneMonitorNativeModule | null | undefined = undefined;

  constructor(
    private readonly impl: () => ErneMonitorNativeModule | null | undefined,
  ) {}

  load(): ErneMonitorNativeModule | null {
    if (this.cached !== undefined) return this.cached;
    try {
      const result = this.impl();
      this.cached = result ?? null;
    } catch {
      this.cached = null;
    }
    return this.cached;
  }

  /** Test helper: forget the cached resolution so the next load re-runs impl. */
  __reset(): void {
    this.cached = undefined;
  }
}

/**
 * Safe wrapper around the native module.
 *
 * Every public method guarantees:
 *   - If the loader returns null (module not linked) → silent no-op / default.
 *   - If the native call throws → the error is swallowed and a default is
 *     returned. The JS SDK never crashes because the native side misbehaved.
 *
 * Phase 1 behavior must continue to work when this wrapper is hollow —
 * that's why the defaults are explicit (UNKNOWN_NATIVE_METRICS,
 * NOOP_NATIVE_SUBSCRIPTION) and why we expose isAvailable() so Phase 2+
 * collectors can skip work cheaply.
 */
export interface ErneMonitorNativeOptions {
  /** Max number of recent error records kept in the ring buffer. Default 20. */
  errorHistorySize?: number;
  /** Optional hook invoked every time a native call fails. */
  onError?: (record: NativeErrorRecord) => void;
  /**
   * After this many consecutive failures, the wrapper flips into
   * `'disabled'` state and short-circuits every subsequent call to a
   * safe default. Default 5 — protects against native modules that panic
   * on every call (prevents the SDK from eating CPU in a retry storm).
   */
  disableAfterErrors?: number;
}

export class ErneMonitorNative {
  private state: NativeMonitorState = 'idle';
  private disabledReason: string | null = null;
  private consecutiveErrors = 0;
  private readonly errorHistory: NativeErrorRecord[] = [];
  private readonly errorHistorySize: number;
  private readonly disableAfterErrors: number;
  private readonly onError?: (record: NativeErrorRecord) => void;

  constructor(
    private readonly loader: NativeModuleLoader,
    options: ErneMonitorNativeOptions = {},
  ) {
    this.errorHistorySize = options.errorHistorySize ?? 20;
    this.disableAfterErrors = options.disableAfterErrors ?? 5;
    this.onError = options.onError;
  }

  isAvailable(): boolean {
    if (this.state === 'disabled') return false;
    return this.loader.load() !== null;
  }

  getState(): NativeMonitorState {
    return this.state;
  }

  /** Reason the SDK was disabled, if any. */
  getDisabledReason(): string | null {
    return this.disabledReason;
  }

  /** Most recent native errors (oldest first). For support dumps. */
  getRecentErrors(): readonly NativeErrorRecord[] {
    return this.errorHistory;
  }

  /**
   * Re-enables the wrapper after it circuit-broke. Clears the error
   * history and flips state back to `'idle'` so the next call will
   * re-dispatch to native. Use this when the consumer knows the native
   * issue has been resolved (e.g. after a fresh launch).
   */
  resetFromDisabled(): void {
    if (this.state === 'disabled') {
      this.state = 'idle';
      this.disabledReason = null;
      this.consecutiveErrors = 0;
      this.errorHistory.length = 0;
    }
  }

  startNativeMonitoring(): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null) {
      this.state = 'idle';
      return;
    }
    try {
      mod.startNativeMonitoring();
      this.state = 'running';
      this.consecutiveErrors = 0;
    } catch (err) {
      this.recordError('startNativeMonitoring', err);
      this.state = 'idle';
    }
  }

  stopNativeMonitoring(): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null) {
      this.state = 'idle';
      return;
    }
    try {
      mod.stopNativeMonitoring();
    } catch (err) {
      this.recordError('stopNativeMonitoring', err);
      // fall through — still mark as stopped so the SDK can re-enter later
    }
    this.state = 'stopped';
  }

  getNativeMetrics(): NativeMetricsSnapshot {
    if (this.state === 'disabled') return UNKNOWN_NATIVE_METRICS;
    const mod = this.loader.load();
    if (mod === null) return UNKNOWN_NATIVE_METRICS;
    try {
      return mod.getNativeMetrics();
    } catch (err) {
      this.recordError('getNativeMetrics', err);
      return UNKNOWN_NATIVE_METRICS;
    }
  }

  onNativeCrash(
    listener: (report: NativeCrashReport) => void,
  ): NativeSubscription {
    return this.subscribe('onNativeCrash', listener);
  }

  onANRDetected(
    listener: (report: NativeANRReport) => void,
  ): NativeSubscription {
    return this.subscribe('onANRDetected', listener);
  }

  onThermalStateChange(
    listener: (event: NativeThermalEvent) => void,
  ): NativeSubscription {
    return this.subscribe('onThermalStateChange', listener);
  }

  onDualThreadFPS(
    listener: (report: NativeDualThreadFPSReport) => void,
  ): NativeSubscription {
    return this.subscribe('onDualThreadFPS', listener);
  }

  saveHermesProfile(data: string, trigger: string): string | null {
    const mod = this.loader.load();
    if (mod === null || typeof mod.saveHermesProfile !== 'function') {
      return null;
    }
    try {
      return mod.saveHermesProfile(data, trigger);
    } catch (err) {
      this.recordError('saveHermesProfile', err);
      return null;
    }
  }

  async captureLayoutSnapshot(
    maxDepth: number = 50,
  ): Promise<Record<string, unknown> | null> {
    const mod = this.loader.load();
    if (mod === null || typeof mod.captureLayoutSnapshot !== 'function') {
      return null;
    }
    try {
      return await mod.captureLayoutSnapshot(maxDepth);
    } catch (err) {
      this.recordError('captureLayoutSnapshot', err);
      return null;
    }
  }

  onReplayFrame(
    listener: (frame: import('./types').NativeReplayFrame) => void,
  ): NativeSubscription {
    return this.subscribe('onReplayFrame', listener);
  }

  startReplayCapture(
    intervalMs: number,
    maskRegions: readonly Record<string, unknown>[],
  ): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.startReplayCapture !== 'function') return;
    try {
      mod.startReplayCapture(intervalMs, maskRegions);
    } catch (err) {
      this.recordError('startReplayCapture', err);
    }
  }

  stopReplayCapture(): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.stopReplayCapture !== 'function') return;
    try {
      mod.stopReplayCapture();
    } catch (err) {
      this.recordError('stopReplayCapture', err);
    }
  }

  updateReplayMaskRegions(
    regions: readonly Record<string, unknown>[],
  ): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.updateReplayMaskRegions !== 'function') return;
    try {
      mod.updateReplayMaskRegions(regions);
    } catch (err) {
      this.recordError('updateReplayMaskRegions', err);
    }
  }

  recordReplayTouch(x: number, y: number, phase: string): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.recordReplayTouch !== 'function') return;
    try {
      mod.recordReplayTouch(x, y, phase);
    } catch (err) {
      this.recordError('recordReplayTouch', err);
    }
  }

  onFabricCommit(
    listener: (report: NativeFabricCommitReport) => void,
  ): NativeSubscription {
    return this.subscribe('onFabricCommit', listener);
  }

  /**
   * Drains any crash reports persisted by the native module during the
   * previous session. Returns an empty array if the native module is
   * absent or does not implement the optional drain hook (Phase 1
   * fallback).
   */
  async drainPersistedCrashes(): Promise<readonly PersistedCrashRecord[]> {
    if (this.state === 'disabled') return [];
    const mod = this.loader.load();
    if (mod === null) return [];
    if (typeof mod.drainPersistedCrashes !== 'function') return [];
    try {
      return await mod.drainPersistedCrashes();
    } catch (err) {
      this.recordError('drainPersistedCrashes', err);
      return [];
    }
  }

  /**
   * Tells the native module that a persisted crash has been delivered
   * through the JS pipeline so its on-disk file can be deleted.
   * Silently no-ops when the module is absent or the hook is missing.
   */
  acknowledgePersistedCrash(id: string): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null) return;
    if (typeof mod.acknowledgePersistedCrash !== 'function') return;
    try {
      mod.acknowledgePersistedCrash(id);
    } catch (err) {
      this.recordError('acknowledgePersistedCrash', err);
      // failure to delete is non-fatal, we just retry next launch
    }
  }

  // ---- Task 43: span persistence ----

  startSpan(
    id: string,
    name: string,
    kind: string,
    parentId: string | null,
    startedAtMs: number,
  ): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.startSpan !== 'function') return;
    try {
      mod.startSpan(id, name, kind, parentId, startedAtMs);
    } catch (err) {
      this.recordError('startSpan', err);
    }
  }

  endSpan(id: string, endedAtMs: number): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.endSpan !== 'function') return;
    try {
      mod.endSpan(id, endedAtMs);
    } catch (err) {
      this.recordError('endSpan', err);
    }
  }

  updateSpan(id: string, attribute: string, value: string): void {
    if (this.state === 'disabled') return;
    const mod = this.loader.load();
    if (mod === null || typeof mod.updateSpan !== 'function') return;
    try {
      mod.updateSpan(id, attribute, value);
    } catch (err) {
      this.recordError('updateSpan', err);
    }
  }

  async drainInterruptedSpans(): Promise<readonly Record<string, unknown>[]> {
    if (this.state === 'disabled') return [];
    const mod = this.loader.load();
    if (mod === null || typeof mod.drainInterruptedSpans !== 'function') {
      return [];
    }
    try {
      return await mod.drainInterruptedSpans();
    } catch (err) {
      this.recordError('drainInterruptedSpans', err);
      return [];
    }
  }

  // ── Diagnostics (dev-only) ──────────────────────────────────
  // Standard SDK integration-test surface. Callers should guard
  // with `__DEV__` — native side also gates on DEBUG builds.

  /**
   * Triggers a native crash (SIGSEGV) to verify the crash handler
   * persists the report. The app will terminate — on next launch,
   * `drainPersistedCrashes()` should return the crash.
   *
   * Dev-only — no-ops in release builds.
   */
  triggerTestCrash(): void {
    const mod = this.loader.load();
    if (mod === null || typeof mod.triggerTestCrash !== 'function') return;
    try {
      mod.triggerTestCrash();
    } catch {
      // ignore — the crash itself may prevent this from returning
    }
  }

  /**
   * Blocks the main thread for `durationSeconds` to trigger the
   * ANR watchdog (1s ping / 5s threshold). Use ≥6s to guarantee
   * detection.
   *
   * Dev-only — throws in release builds.
   */
  triggerTestANR(durationSeconds: number = 6): void {
    const mod = this.loader.load();
    if (mod === null || typeof mod.triggerTestANR !== 'function') return;
    try {
      mod.triggerTestANR(durationSeconds);
    } catch {
      // ignore
    }
  }

  /**
   * Starts a named span then crashes (SIGABRT). On next launch,
   * `drainInterruptedSpans()` should return this span as interrupted.
   *
   * Dev-only — throws in release builds.
   */
  triggerTestSpanCrash(spanName: string = 'test-span'): void {
    const mod = this.loader.load();
    if (mod === null || typeof mod.triggerTestSpanCrash !== 'function') return;
    try {
      mod.triggerTestSpanCrash(spanName);
    } catch {
      // ignore — the crash itself may prevent this from returning
    }
  }

  private subscribe<E extends NativeEventName>(
    eventName: E,
    listener: (payload: NativeEventMap[E]) => void,
  ): NativeSubscription {
    if (this.state === 'disabled') return NOOP_NATIVE_SUBSCRIPTION;
    const mod = this.loader.load();
    if (mod === null) return NOOP_NATIVE_SUBSCRIPTION;
    try {
      return mod.addListener(eventName, listener);
    } catch (err) {
      this.recordError(`addListener(${String(eventName)})`, err);
      return NOOP_NATIVE_SUBSCRIPTION;
    }
  }

  /**
   * Captures a native-side failure. Pushes into the ring buffer (evicting
   * oldest), calls the user-supplied hook if any, and — if we've crossed
   * `disableAfterErrors` consecutive failures — flips the SDK into the
   * `'disabled'` terminal state so every subsequent call short-circuits.
   */
  private recordError(method: string, err: unknown): void {
    const message =
      err instanceof Error ? err.message : String(err ?? 'unknown');
    const record: NativeErrorRecord = {
      method,
      message,
      timestamp: Date.now(),
    };
    this.errorHistory.push(record);
    if (this.errorHistory.length > this.errorHistorySize) {
      this.errorHistory.shift();
    }
    try {
      this.onError?.(record);
    } catch {
      // onError itself must never break the wrapper
    }
    this.consecutiveErrors += 1;
    if (this.consecutiveErrors >= this.disableAfterErrors) {
      this.state = 'disabled';
      this.disabledReason = `native_errors_${this.consecutiveErrors}: ${message}`;
    }
  }
}
