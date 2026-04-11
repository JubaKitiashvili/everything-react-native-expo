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
