import type { Collector, MonitorConfig, MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';
import type { EventStore } from '../storage/EventStore';
import type { SessionManager } from '../core/SessionManager';

export interface NavigationEventData {
  screen: string;
  previousScreen: string | null;
  source: 'expo-router' | 'react-navigation' | 'manual';
  durationMs: number;
  params?: Record<string, unknown>;
}

/**
 * Abstract adapter so the collector can auto-detect the host app's
 * navigator without importing expo-router or @react-navigation/native
 * directly. Each integration exposes a subscribe(listener) + getCurrent()
 * pair and returns an unsubscribe closure.
 */
export interface NavigationAdapter {
  readonly source: 'expo-router' | 'react-navigation';
  subscribe(
    listener: (screen: string, params?: Record<string, unknown>) => void,
  ): () => void;
  getCurrent(): { screen: string; params?: Record<string, unknown> } | null;
}

export interface NavigationCollectorDeps {
  signalBus: SignalBus;
  eventStore: EventStore;
  sessionManager: SessionManager;
  /**
   * Optional adapter. If absent the collector operates in manual-only
   * mode and expects the host app to call trackScreenView().
   */
  adapter?: NavigationAdapter | null;
  now?: () => number;
  wallNow?: () => number;
}

export class NavigationCollector implements Collector {
  readonly name = 'navigation';
  readonly priority = 20;

  private readonly deps: NavigationCollectorDeps;
  private readonly now: () => number;
  private readonly wallNow: () => number;
  private unsubscribe: (() => void) | null = null;
  private running = false;
  private previousScreen: string | null = null;
  private lastTransitionAt: number = 0;

  constructor(deps: NavigationCollectorDeps) {
    this.deps = deps;
    this.now =
      deps.now ??
      (() =>
        typeof performance !== 'undefined' &&
        typeof performance.now === 'function'
          ? performance.now()
          : Date.now());
    this.wallNow = deps.wallNow ?? Date.now;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  init(_config: MonitorConfig): void {
    // no config work yet
  }

  start(): void {
    if (this.running) return;
    this.lastTransitionAt = this.now();

    const adapter = this.deps.adapter;
    if (adapter) {
      const current = adapter.getCurrent();
      if (current) {
        this.previousScreen = null;
        this.recordTransition(current.screen, current.params, adapter.source);
      }
      this.unsubscribe = adapter.subscribe((screen, params) => {
        this.recordTransition(screen, params, adapter.source);
      });
    }
    this.running = true;
  }

  stop(): void {
    if (!this.running) return;
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.running = false;
  }

  dispose(): void {
    this.stop();
  }

  /**
   * Manual screen tracking fallback. Used by host apps whose navigator
   * the adapters don't support, or for screens that live outside the
   * navigator tree (modals, custom overlays).
   */
  trackScreenView(screen: string, params?: Record<string, unknown>): void {
    this.recordTransition(screen, params, 'manual');
  }

  isRunning(): boolean {
    return this.running;
  }

  private recordTransition(
    screen: string,
    params: Record<string, unknown> | undefined,
    source: NavigationEventData['source'],
  ): void {
    const now = this.now();
    const durationMs = Math.max(0, now - this.lastTransitionAt);
    const data: NavigationEventData = {
      screen,
      previousScreen: this.previousScreen,
      source,
      durationMs,
      ...(params !== undefined ? { params } : {}),
    };
    const event: MonitorEvent = {
      type: 'navigation',
      timestamp: now,
      wallTime: this.wallNow(),
      sessionId: this.deps.sessionManager.getCurrentSessionId(),
      data,
    };
    this.deps.signalBus.emit(event);
    void this.deps.eventStore.insert(event, 'normal').catch(() => {
      // swallow — bus has it
    });
    this.previousScreen = screen;
    this.lastTransitionAt = now;
  }
}
