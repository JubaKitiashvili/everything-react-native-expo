/**
 * Native module type surface — the contract between the JS SDK and the
 * platform-native `ErneMonitor` module exposed through Expo Modules API.
 *
 * These types are the source of truth for Task 38 (module shell) and are
 * consumed by Tasks 40–43 (CrashHandler, ANRDetector, NativeMetrics,
 * SpanSnapshot). They deliberately mirror the shape of the generated
 * Swift/Kotlin structs emitted by the schema codegen (Task 35/39).
 *
 * Keep this file import-free: it runs under plain ts-jest without a
 * React Native preset. Any runtime dependency on `expo-modules-core` lives
 * in `defaultLoader.ts`, which is only pulled in at SDK boot time.
 */

export type ThermalState =
  | 'nominal'
  | 'fair'
  | 'serious'
  | 'critical'
  | 'unknown';

export type NativeMonitorState = 'idle' | 'running' | 'stopped';

export interface NativeMetricsSnapshot {
  /** Per-process CPU percentage (0-100), null if unsupported on the platform. */
  readonly cpuUsagePercent: number | null;
  /** Resident set size in bytes, null if unavailable. */
  readonly memoryUsedBytes: number | null;
  /** Available memory in bytes (device-wide), null if unavailable. */
  readonly memoryAvailableBytes: number | null;
  /** Total physical memory in bytes, null if unavailable. */
  readonly memoryTotalBytes: number | null;
  /** Thermal state, 'unknown' if the platform cannot report it. */
  readonly thermalState: ThermalState;
  /** Battery level in [0,1], null if unavailable or charging state unknown. */
  readonly batteryLevel: number | null;
  /** True if the device is plugged in, null if unknown. */
  readonly batteryCharging: boolean | null;
  /** Available free space in the app sandbox, bytes. null if unavailable. */
  readonly diskAvailableBytes: number | null;
  /** Total disk size, bytes. null if unavailable. */
  readonly diskTotalBytes: number | null;
  /** Monotonic wall-clock sample time in ms since the unix epoch. */
  readonly sampledAt: number;
}

export interface NativeCrashReport {
  readonly signal: string;
  readonly signalCode: number | null;
  readonly faultAddress: string | null;
  readonly backtrace: readonly string[];
  readonly threadName: string | null;
  readonly timestamp: number;
  readonly appVersion: string | null;
  readonly osVersion: string | null;
  readonly deviceModel: string | null;
  readonly breadcrumbs: readonly unknown[];
}

export interface NativeANRReport {
  readonly durationMs: number;
  readonly mainThreadStack: readonly string[];
  readonly screen: string | null;
  readonly timestamp: number;
}

export interface NativeThermalEvent {
  readonly state: ThermalState;
  readonly timestamp: number;
}

export interface NativeDualThreadFPSReport {
  readonly uiFPS: number;
  readonly jsFPS: number;
  readonly timestamp: number;
}

export interface NativeFabricCommitReport {
  readonly commitCount: number;
  readonly avgCommitDuration: number;
  readonly maxCommitDuration: number;
  readonly yogaLayoutTime: number;
  readonly isLayoutThrashing: boolean;
  readonly timestamp: number;
}

export interface NativeReplayFrame {
  readonly frameBase64: string;
  readonly touchEvents: readonly {
    readonly x: number;
    readonly y: number;
    readonly phase: string;
    readonly timestamp: number;
  }[];
  readonly timestamp: number;
}

export type NativeEventMap = {
  onNativeCrash: NativeCrashReport;
  onANRDetected: NativeANRReport;
  onThermalStateChange: NativeThermalEvent;
  onDualThreadFPS: NativeDualThreadFPSReport;
  onFabricCommit: NativeFabricCommitReport;
  onReplayFrame: NativeReplayFrame;
};

export type NativeEventName = keyof NativeEventMap;

export interface NativeSubscription {
  remove(): void;
}

/**
 * The shape the native module returns when JS asks for crash reports
 * persisted during the previous session. Each entry pairs the report
 * itself with the on-disk file identifier so the JS gateway can
 * acknowledge (delete) the file once dispatch succeeds.
 */
export interface PersistedCrashRecord {
  readonly id: string;
  readonly report: NativeCrashReport;
}

/**
 * The minimal interface the underlying Expo Modules API module must satisfy.
 * Tests supply a fake; the real one comes from `requireNativeModule`.
 */
export interface ErneMonitorNativeModule {
  startNativeMonitoring(): void;
  stopNativeMonitoring(): void;
  getNativeMetrics(): NativeMetricsSnapshot;
  addListener<E extends NativeEventName>(
    eventName: E,
    listener: (payload: NativeEventMap[E]) => void,
  ): NativeSubscription;
  /**
   * Optional — present once Task 40 CrashHandler is wired. Returns
   * any crash reports written to disk by the previous session.
   */
  drainPersistedCrashes?(): Promise<readonly PersistedCrashRecord[]>;
  /**
   * Optional — deletes a persisted crash file once the JS gateway has
   * delivered it through the SDK pipeline.
   */
  acknowledgePersistedCrash?(id: string): void;
  /**
   * Optional — Task 43 SpanSnapshot. Persists span lifecycle events
   * to a memory-mapped append-only log so spans interrupted by a
   * crash can be replayed on the next session.
   */
  startSpan?(
    id: string,
    name: string,
    kind: string,
    parentId: string | null,
    startedAtMs: number,
  ): void;
  endSpan?(id: string, endedAtMs: number): void;
  updateSpan?(id: string, attribute: string, value: string): void;
  drainInterruptedSpans?(): Promise<readonly Record<string, unknown>[]>;
  /**
   * Dev-only diagnostics — trigger a native crash (SIGSEGV) to verify
   * the crash handler persists the report and the next launch drains it.
   */
  /** Task 49: Hermes CPU profiler — save profile data to file. */
  saveHermesProfile?(data: string, trigger: string): string | null;
  listHermesProfiles?(): readonly Record<string, unknown>[];
  deleteHermesProfile?(path: string): boolean;
  getHermesProfilerMaxDurationMs?(): number;
  /** Task 48: capture the native view hierarchy as a serializable tree. */
  captureLayoutSnapshot?(maxDepth: number): Promise<Record<string, unknown> | null>;
  /** Task 47: start replay capture at given interval with PII mask regions. */
  startReplayCapture?(
    intervalMs: number,
    maskRegions: readonly Record<string, unknown>[],
  ): void;
  stopReplayCapture?(): void;
  updateReplayMaskRegions?(
    regions: readonly Record<string, unknown>[],
  ): void;
  recordReplayTouch?(x: number, y: number, phase: string): void;
  triggerTestCrash?(): void;
  /**
   * Dev-only diagnostics — block the main thread for `durationSeconds`
   * to trigger the ANR watchdog (fires when ≥5s).
   */
  triggerTestANR?(durationSeconds: number): void;
  /**
   * Dev-only diagnostics — start a named span then crash (SIGABRT).
   * On next launch, `drainInterruptedSpans` should return this span.
   */
  triggerTestSpanCrash?(spanName: string): void;
}

/**
 * Factory contract — the wrapper asks a loader for the native module.
 * Returning null means the module is not linked (Expo Go, unit tests,
 * dev client built before Phase 2a). The wrapper then turns every call
 * into a safe no-op.
 */
export interface NativeModuleLoader {
  load(): ErneMonitorNativeModule | null;
}

export const NOOP_NATIVE_SUBSCRIPTION: NativeSubscription = Object.freeze({
  remove(): void {
    /* no-op */
  },
});

export const UNKNOWN_NATIVE_METRICS: NativeMetricsSnapshot = Object.freeze({
  cpuUsagePercent: null,
  memoryUsedBytes: null,
  memoryAvailableBytes: null,
  memoryTotalBytes: null,
  thermalState: 'unknown' as const,
  batteryLevel: null,
  batteryCharging: null,
  diskAvailableBytes: null,
  diskTotalBytes: null,
  sampledAt: 0,
});
