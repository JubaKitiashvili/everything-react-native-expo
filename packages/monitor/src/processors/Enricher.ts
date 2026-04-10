import type {
  AppInfo,
  ConnectionType,
  DeviceInfo,
  MemoryInfo,
  MonitorEvent,
  PlatformBridge,
} from '../types';
import type { SessionManager } from '../core/SessionManager';

export interface EnrichedEvent extends MonitorEvent {
  context: {
    device: DeviceInfo;
    app: AppInfo;
    session: {
      id: string;
      durationMs: number;
    };
    connectionType: ConnectionType;
    memory: MemoryInfo | null;
  };
}

export interface EnricherDeps {
  platformBridge: PlatformBridge;
  sessionManager: SessionManager;
}

/**
 * Enricher attaches ambient context (device, app, session, connectivity,
 * memory) to every event. Static device/app metadata is read once and
 * cached; dynamic fields (connection type, memory) refresh on each call
 * so time-series data reflects reality.
 *
 * Runs after Sanitizer in the pipeline so sanitization can operate on
 * raw user data without having to know about the context envelope.
 */
export class Enricher {
  private readonly deps: EnricherDeps;
  private cachedDevice: DeviceInfo | null = null;
  private cachedApp: AppInfo | null = null;

  constructor(deps: EnricherDeps) {
    this.deps = deps;
  }

  enrich(event: MonitorEvent): EnrichedEvent {
    if (this.cachedDevice === null) {
      this.cachedDevice = this.deps.platformBridge.getDeviceInfo();
    }
    if (this.cachedApp === null) {
      this.cachedApp = this.deps.platformBridge.getAppInfo();
    }
    return {
      ...event,
      context: {
        device: this.cachedDevice,
        app: this.cachedApp,
        session: {
          id: this.deps.sessionManager.getCurrentSessionId(),
          durationMs: this.deps.sessionManager.getSessionDuration(),
        },
        connectionType: this.deps.platformBridge.getConnectionType(),
        memory: this.deps.platformBridge.getMemoryUsage(),
      },
    };
  }

  /** Clears the cached device/app info — e.g. after a locale change. */
  invalidateCache(): void {
    this.cachedDevice = null;
    this.cachedApp = null;
  }
}
