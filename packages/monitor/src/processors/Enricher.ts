import type {
  AppInfo,
  ConnectionType,
  DeviceInfo,
  MemoryInfo,
  MonitorEvent,
  PlatformBridge,
} from '../types';
import type { SessionManager } from '../core/SessionManager';
import type { DimensionValue } from '../core/CustomDimensions';

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
    /**
     * Opaque user identifier set by the host app via
     * `monitor.setUserId(id)`. Null when no user is attached (anonymous
     * session). Used by the DSAR APIs (exportUserData / deleteUserData)
     * to scope a user's data for GDPR export / deletion.
     */
    userId: string | null;
  };
  /**
   * Task 117.30 — user-defined slicing dimensions attached at enrich time.
   * Present only when the host has set at least one dimension via
   * `monitor.setDimension()` / `monitor.setUserProperties()`.
   */
  dimensions?: Record<string, DimensionValue>;
}

export interface EnricherDeps {
  platformBridge: PlatformBridge;
  sessionManager: SessionManager;
  /**
   * Task 117.30 — supplies the current custom dimensions. Returns an
   * empty object when none are set; in that case no `dimensions` field is
   * attached. Injected so the Enricher stays decoupled from the store.
   */
  getDimensions?: () => Record<string, DimensionValue>;
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
  private userId: string | null = null;

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
    const enriched: EnrichedEvent = {
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
        userId: this.userId,
      },
    };
    const dimensions = this.deps.getDimensions?.();
    if (dimensions && Object.keys(dimensions).length > 0) {
      enriched.dimensions = dimensions;
    }
    return enriched;
  }

  /** Clears the cached device/app info — e.g. after a locale change. */
  invalidateCache(): void {
    this.cachedDevice = null;
    this.cachedApp = null;
  }

  /**
   * Attaches an opaque user identifier to every subsequently-enriched
   * event. Pass `null` on logout to detach. The value is never hashed
   * or interpreted by the SDK — it's whatever the host app considers a
   * stable user identifier (backend user id, session id, etc.).
   *
   * GDPR: stored alongside events so `exportUserData(id)` and
   * `deleteUserData(id)` can find everything tagged with this id.
   */
  setUserId(userId: string | null): void {
    this.userId = userId;
  }

  getUserId(): string | null {
    return this.userId;
  }
}
