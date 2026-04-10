// Phase 1a Task 1 types. Task 2 will replace MonitorConfig with the full schema.

export interface MonitorConfig {
  [key: string]: unknown;
}

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
