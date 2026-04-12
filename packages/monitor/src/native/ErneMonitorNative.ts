import type {
  ErneMonitorNativeModule,
  NativeANRReport,
  NativeCrashReport,
  NativeEventMap,
  NativeEventName,
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
export class ErneMonitorNative {
  private state: NativeMonitorState = 'idle';

  constructor(private readonly loader: NativeModuleLoader) {}

  isAvailable(): boolean {
    return this.loader.load() !== null;
  }

  getState(): NativeMonitorState {
    return this.state;
  }

  startNativeMonitoring(): void {
    const mod = this.loader.load();
    if (mod === null) {
      this.state = 'idle';
      return;
    }
    try {
      mod.startNativeMonitoring();
      this.state = 'running';
    } catch {
      this.state = 'idle';
    }
  }

  stopNativeMonitoring(): void {
    const mod = this.loader.load();
    if (mod === null) {
      this.state = 'idle';
      return;
    }
    try {
      mod.stopNativeMonitoring();
    } catch {
      // fall through — still mark as stopped so the SDK can re-enter later
    }
    this.state = 'stopped';
  }

  getNativeMetrics(): NativeMetricsSnapshot {
    const mod = this.loader.load();
    if (mod === null) return UNKNOWN_NATIVE_METRICS;
    try {
      return mod.getNativeMetrics();
    } catch {
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

  /**
   * Drains any crash reports persisted by the native module during the
   * previous session. Returns an empty array if the native module is
   * absent or does not implement the optional drain hook (Phase 1
   * fallback).
   */
  async drainPersistedCrashes(): Promise<readonly PersistedCrashRecord[]> {
    const mod = this.loader.load();
    if (mod === null) return [];
    if (typeof mod.drainPersistedCrashes !== 'function') return [];
    try {
      return await mod.drainPersistedCrashes();
    } catch {
      return [];
    }
  }

  /**
   * Tells the native module that a persisted crash has been delivered
   * through the JS pipeline so its on-disk file can be deleted.
   * Silently no-ops when the module is absent or the hook is missing.
   */
  acknowledgePersistedCrash(id: string): void {
    const mod = this.loader.load();
    if (mod === null) return;
    if (typeof mod.acknowledgePersistedCrash !== 'function') return;
    try {
      mod.acknowledgePersistedCrash(id);
    } catch {
      // ignore — failure to delete is non-fatal, we just retry next launch
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
    const mod = this.loader.load();
    if (mod === null || typeof mod.startSpan !== 'function') return;
    try {
      mod.startSpan(id, name, kind, parentId, startedAtMs);
    } catch {
      // ignore
    }
  }

  endSpan(id: string, endedAtMs: number): void {
    const mod = this.loader.load();
    if (mod === null || typeof mod.endSpan !== 'function') return;
    try {
      mod.endSpan(id, endedAtMs);
    } catch {
      // ignore
    }
  }

  updateSpan(id: string, attribute: string, value: string): void {
    const mod = this.loader.load();
    if (mod === null || typeof mod.updateSpan !== 'function') return;
    try {
      mod.updateSpan(id, attribute, value);
    } catch {
      // ignore
    }
  }

  async drainInterruptedSpans(): Promise<readonly Record<string, unknown>[]> {
    const mod = this.loader.load();
    if (mod === null || typeof mod.drainInterruptedSpans !== 'function') {
      return [];
    }
    try {
      return await mod.drainInterruptedSpans();
    } catch {
      return [];
    }
  }

  private subscribe<E extends NativeEventName>(
    eventName: E,
    listener: (payload: NativeEventMap[E]) => void,
  ): NativeSubscription {
    const mod = this.loader.load();
    if (mod === null) return NOOP_NATIVE_SUBSCRIPTION;
    try {
      return mod.addListener(eventName, listener);
    } catch {
      return NOOP_NATIVE_SUBSCRIPTION;
    }
  }
}
