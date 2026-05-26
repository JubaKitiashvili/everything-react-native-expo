// Types shared across @erne/monitor. The full MonitorConfig lives here so
// collectors, processors, and transports can all import a single canonical
// definition. See src/core/Config.ts for defaults and the builder.

export type CollectorMode = boolean | 'dev' | 'prod';

export type AutoFixMode = 'suggest' | 'apply' | 'off';

export interface PerTypeSamplingRate {
  readonly dev?: number;
  readonly prod?: number;
}

export interface MonitorConfig {
  readonly collectors: Readonly<Record<string, CollectorMode>>;
  readonly sampling: {
    readonly dev: number;
    readonly prod: number;
    /**
     * Optional per-type sampling rates. When an event type has an entry here
     * the matching dev/prod rate is used instead of the global one. Unknown
     * types fall back to the global rate. The 'crash' type is always kept
     * regardless of this map.
     */
    readonly byType: Readonly<Record<string, PerTypeSamplingRate>>;
  };
  readonly consent: {
    readonly crashes: boolean;
    readonly analytics: boolean;
    readonly replay: boolean;
    /**
     * Task 117.56 — California CCPA/CPRA "Do Not Sell My Personal
     * Information" signal. When true, the SDK strips cross-context
     * identifiers and profiling/tracking data from outbound events. Optional
     * and absent by default (treated as false / collect-as-normal); set it
     * here to opt a deployment into default-on.
     */
    readonly doNotSell?: boolean;
  };
  readonly ai: {
    readonly crashExplainer: boolean;
    readonly autoFix: AutoFixMode;
    readonly maxFilesPerFix: number;
  };
  readonly transport: {
    readonly endpoint: string | null;
    readonly batchInterval: number;
    readonly maxBatchSize: number;
  };
}

export type MonitorConfigOverrides = {
  readonly collectors?: Record<string, CollectorMode>;
  readonly sampling?: {
    readonly dev?: number;
    readonly prod?: number;
    readonly byType?: Record<string, PerTypeSamplingRate>;
  };
  readonly consent?: Partial<MonitorConfig['consent']>;
  readonly ai?: Partial<MonitorConfig['ai']>;
  readonly transport?: Partial<MonitorConfig['transport']>;
};

/**
 * Declared event types. Kept narrow for codegen + sampler byType defaults,
 * but `string` is accepted at runtime for custom collectors — see the
 * escape hatch union member below.
 */
export type MonitorEventType =
  | 'crash'
  | 'network'
  | 'navigation'
  | 'render'
  | 'custom'
  | 'frame_drop'
  // Preserve autocomplete for the canonical types above while still
  // letting third-party collectors emit arbitrary strings.
  | (string & {});

export interface MonitorEvent {
  type: MonitorEventType;
  timestamp: number;
  wallTime: number;
  sessionId: string;
  data: unknown;
}

export type PlatformName = 'ios' | 'android' | 'web' | 'unknown';

export interface DeviceInfo {
  readonly platform: PlatformName;
  readonly osVersion: string;
  readonly model: string;
  readonly isEmulator: boolean;
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly locale: string;
}

export interface AppInfo {
  readonly version: string;
  readonly buildNumber: string;
  readonly bundleId: string;
}

export interface MemoryInfo {
  readonly usedBytes: number;
  readonly totalBytes: number;
}

export type ConnectionType = 'wifi' | 'cellular' | 'offline' | 'unknown';

export interface PlatformBridge {
  getDeviceInfo(): DeviceInfo;
  getAppInfo(): AppInfo;
  getMemoryUsage(): MemoryInfo | null;
  getConnectionType(): ConnectionType;
  persistCrashData(data: Uint8Array): void;
}

export interface Collector {
  readonly name: string;
  readonly priority: number;
  init(config: MonitorConfig): void;
  start(): void;
  stop(): void;
  dispose(): void;
}
