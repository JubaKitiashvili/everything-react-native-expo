/**
 * Task 51 — ExpoDevToolsPlugin
 *
 * Registers @erne/monitor as an Expo DevTools plugin, enabling the
 * Expo DevTools UI to display health grid data, recent events, and
 * send commands back to the monitor runtime.
 *
 * Dev-only: the plugin checks `__DEV__` and is a no-op in production.
 *
 * The DevToolsPluginClient interface is injectable for testing. In
 * production the real expo-dev-tools client is passed in.
 */
import type { MonitorEvent } from '../types';
import type { SignalBus } from '../core/SignalBus';

/**
 * Minimal interface that mirrors the Expo DevTools plugin client API.
 * Injectable so tests can provide a fake without depending on
 * expo-dev-tools.
 */
export interface DevToolsPluginClient {
  sendMessage(method: string, params: Record<string, unknown>): void;
  addMessageListener(
    method: string,
    listener: (params: Record<string, unknown>) => void,
  ): { remove(): void };
}

export interface DevToolsPluginClientFactory {
  createClient(pluginName: string): Promise<DevToolsPluginClient>;
}

export interface ExpoDevToolsPluginDeps {
  signalBus: SignalBus;
  /** Factory to create the DevTools plugin client. */
  clientFactory: DevToolsPluginClientFactory;
  /** Whether we are in dev mode. Default: checks global __DEV__. */
  isDev?: boolean;
  /** Max number of recent events to keep for the DevTools UI. Default 50. */
  maxRecentEvents?: number;
  /** Handler for 'captureProfile' command. */
  onCaptureProfile?: () => void;
  /** Handler for 'layoutSnapshot' command. */
  onLayoutSnapshot?: () => Promise<Record<string, unknown> | null>;
}

const PLUGIN_NAME = 'ErneMonitor';

/**
 * Bridges the @erne/monitor runtime to Expo DevTools. Sends health
 * data and recent events; receives commands for profiling and layout
 * capture.
 */
export class ExpoDevToolsPlugin {
  private readonly deps: ExpoDevToolsPluginDeps;
  private readonly isDev: boolean;
  private readonly maxRecentEvents: number;
  private client: DevToolsPluginClient | null = null;
  private unsubscribe: (() => void) | null = null;
  private commandListeners: Array<{ remove(): void }> = [];
  private recentEvents: MonitorEvent[] = [];
  private connected = false;

  constructor(deps: ExpoDevToolsPluginDeps) {
    this.deps = deps;
    this.isDev = deps.isDev ?? (typeof (globalThis as Record<string, unknown>).__DEV__ !== 'undefined' && !!(globalThis as Record<string, unknown>).__DEV__);
    this.maxRecentEvents = deps.maxRecentEvents ?? 50;
  }

  async connect(): Promise<void> {
    if (!this.isDev) return;
    if (this.connected) return;

    try {
      this.client = await this.deps.clientFactory.createClient(PLUGIN_NAME);
    } catch {
      // DevTools not available — silent no-op
      return;
    }

    this.connected = true;

    // Subscribe to all events from the SignalBus
    this.unsubscribe = this.deps.signalBus.onAll((event) => {
      this.handleEvent(event);
    });

    // Register command listeners
    this.registerCommands();

    // Send initial state
    this.sendHealthGrid();
    this.sendRecentEvents();
  }

  disconnect(): void {
    this.connected = false;
    this.unsubscribe?.();
    this.unsubscribe = null;
    for (const listener of this.commandListeners) {
      listener.remove();
    }
    this.commandListeners = [];
    this.client = null;
    this.recentEvents = [];
  }

  isConnected(): boolean {
    return this.connected;
  }

  /** Test hook: number of recent events buffered. */
  recentEventCount(): number {
    return this.recentEvents.length;
  }

  private handleEvent(event: MonitorEvent): void {
    // Add to recent events buffer
    this.recentEvents.push(event);
    while (this.recentEvents.length > this.maxRecentEvents) {
      this.recentEvents.shift();
    }

    // Forward to DevTools UI
    this.client?.sendMessage('monitor:event', {
      event: {
        type: event.type,
        timestamp: event.timestamp,
        wallTime: event.wallTime,
        sessionId: event.sessionId,
        data: event.data,
      },
    });
  }

  private sendHealthGrid(): void {
    if (!this.client) return;
    const eventCounts: Record<string, number> = {};
    for (const event of this.recentEvents) {
      eventCounts[event.type] = (eventCounts[event.type] ?? 0) + 1;
    }
    this.client.sendMessage('monitor:healthGrid', {
      eventCounts,
      totalEvents: this.recentEvents.length,
      timestamp: Date.now(),
    });
  }

  private sendRecentEvents(): void {
    if (!this.client) return;
    this.client.sendMessage('monitor:recentEvents', {
      events: this.recentEvents.map((e) => ({
        type: e.type,
        timestamp: e.timestamp,
        wallTime: e.wallTime,
        sessionId: e.sessionId,
        data: e.data,
      })),
    });
  }

  private registerCommands(): void {
    if (!this.client) return;

    // captureProfile command
    const profileListener = this.client.addMessageListener(
      'monitor:captureProfile',
      () => {
        this.deps.onCaptureProfile?.();
      },
    );
    this.commandListeners.push(profileListener);

    // layoutSnapshot command
    const layoutListener = this.client.addMessageListener(
      'monitor:layoutSnapshot',
      async () => {
        const snapshot = await this.deps.onLayoutSnapshot?.();
        this.client?.sendMessage('monitor:layoutSnapshotResult', {
          snapshot: snapshot ?? null,
          timestamp: Date.now(),
        });
      },
    );
    this.commandListeners.push(layoutListener);

    // requestHealthGrid command
    const healthListener = this.client.addMessageListener(
      'monitor:requestHealthGrid',
      () => {
        this.sendHealthGrid();
      },
    );
    this.commandListeners.push(healthListener);

    // requestRecentEvents command
    const eventsListener = this.client.addMessageListener(
      'monitor:requestRecentEvents',
      () => {
        this.sendRecentEvents();
      },
    );
    this.commandListeners.push(eventsListener);
  }
}
