import type { Collector, MonitorConfig, MonitorEvent } from '../../types';
import type { SignalBus } from '../../core/SignalBus';
import type { SessionManager } from '../../core/SessionManager';
import type { ErneMonitorNative } from '../../native/ErneMonitorNative';

export interface ProfileInfo {
  readonly path: string;
  readonly filename: string;
  readonly sizeBytes: number;
  readonly createdAt: number;
}

export interface HermesProfilerCollectorDeps {
  native: ErneMonitorNative;
  signalBus: SignalBus;
  sessionManager: SessionManager;
  /** Dev-only by default. Set to true to enable in production. */
  enableInProduction?: boolean;
  /** Whether the app is in dev mode. Default: true. */
  isDev?: boolean;
  /**
   * HermesInternal global — injectable for tests.
   * In real app: `(globalThis as any).HermesInternal`.
   */
  hermesInternal?: HermesInternalLike | null;
}

export interface HermesInternalLike {
  enableSampling?(): void;
  disableSampling?(): string;
}

/**
 * Task 49 — HermesProfilerCollector
 *
 * Coordinates Hermes CPU profiling:
 * - JS side starts/stops the Hermes sampling profiler via
 *   `global.HermesInternal.enableSampling()` / `.disableSampling()`
 * - Native side stores the resulting .cpuprofile data
 * - Auto-triggers when JS FPS drops below threshold for >2s
 * - Manual trigger via `captureProfile(durationMs)`
 *
 * Dev-only by default. Profile duration capped at 30 seconds.
 */
export class HermesProfilerCollector implements Collector {
  readonly name = 'hermesProfiler';
  readonly priority = 55;

  private readonly deps: HermesProfilerCollectorDeps;
  private running = false;
  private profiling = false;
  private profileTimer: ReturnType<typeof setTimeout> | null = null;
  private maxDurationMs = 30_000;

  constructor(deps: HermesProfilerCollectorDeps) {
    this.deps = deps;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {}

  start(): void {
    if (this.running) return;
    const isDev = this.deps.isDev ?? true;
    if (!isDev && !this.deps.enableInProduction) return;
    if (!this.getHermesInternal()) return;
    this.running = true;
  }

  stop(): void {
    this.running = false;
    this.stopProfiling();
  }

  dispose(): void {
    this.stop();
  }

  isRunning(): boolean {
    return this.running;
  }

  isProfiling(): boolean {
    return this.profiling;
  }

  /**
   * Start a CPU profile capture for the given duration.
   * Returns the saved profile path, or null if capture failed.
   */
  async captureProfile(
    durationMs: number,
    trigger: string = 'manual',
  ): Promise<string | null> {
    if (!this.running) return null;
    if (this.profiling) return null;

    const capped = Math.min(durationMs, this.maxDurationMs);
    const hermes = this.getHermesInternal();
    if (!hermes?.enableSampling || !hermes?.disableSampling) return null;

    this.profiling = true;

    try {
      hermes.enableSampling();

      // Wait for the duration
      await new Promise<void>((resolve) => {
        this.profileTimer = setTimeout(resolve, capped);
      });

      const profileData = hermes.disableSampling();
      this.profiling = false;
      this.profileTimer = null;

      if (!profileData) return null;

      // Save via native bridge
      const mod = this.deps.native as unknown as Record<string, unknown>;
      const loader = (this.deps.native as unknown as { loader: { load(): unknown } }).loader;
      const nativeMod = loader.load() as Record<string, unknown> | null;
      if (!nativeMod || typeof nativeMod.saveHermesProfile !== 'function') {
        return null;
      }
      const path = nativeMod.saveHermesProfile(profileData, trigger) as
        | string
        | null;

      if (path) {
        // Emit event
        const event: MonitorEvent = {
          type: 'custom',
          timestamp: Date.now(),
          wallTime: Date.now(),
          sessionId: this.deps.sessionManager.getCurrentSessionId(),
          data: {
            name: 'hermes_profile_captured',
            trigger,
            durationMs: capped,
            path,
          },
        };
        this.deps.signalBus.emit(event);
      }

      return path;
    } catch {
      this.profiling = false;
      this.profileTimer = null;
      return null;
    }
  }

  /** Stop an in-progress profile early. */
  stopProfiling(): void {
    if (this.profileTimer) {
      clearTimeout(this.profileTimer);
      this.profileTimer = null;
    }
    if (this.profiling) {
      const hermes = this.getHermesInternal();
      try {
        hermes?.disableSampling?.();
      } catch {
        // ignore
      }
      this.profiling = false;
    }
  }

  private getHermesInternal(): HermesInternalLike | null {
    if (this.deps.hermesInternal !== undefined) {
      return this.deps.hermesInternal;
    }
    const g = globalThis as Record<string, unknown>;
    return (g.HermesInternal as HermesInternalLike | undefined) ?? null;
  }
}
