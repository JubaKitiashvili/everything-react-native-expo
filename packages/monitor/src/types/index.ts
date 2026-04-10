// Types shared across @erne/monitor. The full MonitorConfig lives here so
// collectors, processors, and transports can all import a single canonical
// definition. See src/core/Config.ts for defaults and the builder.

export type CollectorMode = boolean | 'dev' | 'prod';

export type AutoFixMode = 'suggest' | 'apply' | 'off';

export interface MonitorConfig {
  readonly collectors: Readonly<Record<string, CollectorMode>>;
  readonly sampling: {
    readonly dev: number;
    readonly prod: number;
  };
  readonly consent: {
    readonly crashes: boolean;
    readonly analytics: boolean;
    readonly replay: boolean;
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
  readonly sampling?: Partial<MonitorConfig['sampling']>;
  readonly consent?: Partial<MonitorConfig['consent']>;
  readonly ai?: Partial<MonitorConfig['ai']>;
  readonly transport?: Partial<MonitorConfig['transport']>;
};

export type MonitorEventType =
  | 'crash'
  | 'network'
  | 'navigation'
  | 'render'
  | 'custom';

export interface MonitorEvent {
  type: MonitorEventType;
  timestamp: number;
  wallTime: number;
  sessionId: string;
  data: unknown;
}

export interface Collector {
  readonly name: string;
  readonly priority: number;
  init(config: MonitorConfig): void;
  start(): void;
  stop(): void;
  dispose(): void;
}
