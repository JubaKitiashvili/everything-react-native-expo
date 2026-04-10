import type { MonitorConfig, MonitorConfigOverrides } from '../types';
import { MonitorClient } from './MonitorClient';
import { defineMonitorConfig } from './Config';
import { SignalBus } from './SignalBus';
import { SessionManager, type AppStateLike } from './SessionManager';
import {
  EventStore,
  MemoryEventStoreBackend,
  type EventStoreBackend,
} from '../storage/EventStore';
import {
  JSPlatformBridge,
  type JSPlatformBridgeDeps,
} from './JSPlatformBridge';
import type { PlatformBridge } from '../types';
import { Sanitizer, type SanitizerOptions } from '../processors/Sanitizer';
import { Enricher, type EnrichedEvent } from '../processors/Enricher';
import {
  CrashCollector,
  type ErrorUtilsLike,
  type RejectionTrackerLike,
} from '../collectors/CrashCollector';
import { NetworkCollector } from '../collectors/NetworkCollector';
import {
  NavigationCollector,
  type NavigationAdapter,
} from '../collectors/NavigationCollector';
import {
  CustomEventCollector,
  type CustomAttributeValue,
} from '../collectors/CustomEventCollector';
import { TerminalReporter, type ConsoleLike } from '../integrations/TerminalReporter';

export interface MonitorRuntimeDeps {
  isDev?: boolean;
  platformBridge?: PlatformBridge;
  jsPlatformBridgeDeps?: JSPlatformBridgeDeps;
  eventStoreBackend?: EventStoreBackend;
  appState?: AppStateLike;
  errorUtils?: ErrorUtilsLike | null;
  rejectionTracker?: RejectionTrackerLike | null;
  navigationAdapter?: NavigationAdapter | null;
  networkTarget?: {
    fetch?: typeof fetch;
    XMLHttpRequest?: typeof XMLHttpRequest;
  };
  sanitizerOptions?: SanitizerOptions;
  console?: ConsoleLike;
  terminalRateLimitMs?: number;
  ignoreHosts?: readonly string[];
}

export interface MonitorRuntime {
  client: MonitorClient;
  bus: SignalBus;
  store: EventStore;
  session: SessionManager;
  platformBridge: PlatformBridge;
  sanitizer: Sanitizer;
  enricher: Enricher;
  collectors: {
    crash: CrashCollector;
    network: NetworkCollector;
    navigation: NavigationCollector;
    custom: CustomEventCollector;
  };
  terminalReporter: TerminalReporter;
  trackEvent: (
    name: string,
    attributes?: Record<string, CustomAttributeValue>,
  ) => void;
  trackScreenView: (
    screen: string,
    params?: Record<string, unknown>,
  ) => void;
  shutdown: () => Promise<void>;
}

function detectIsDev(): boolean {
  const g = globalThis as { __DEV__?: unknown };
  if (typeof g.__DEV__ === 'boolean') return g.__DEV__;
  if (typeof process !== 'undefined' && process.env?.NODE_ENV) {
    return process.env.NODE_ENV !== 'production';
  }
  return false;
}

/**
 * Builds a fully-wired monitor runtime: every Phase 1a collector, processor,
 * and integration connected to a SignalBus, EventStore, and SessionManager.
 * Returns a handle with lifecycle helpers plus convenience methods for the
 * public API. Pipeline order:
 *
 *   collector.emit → SignalBus
 *   SignalBus onAll → Sanitizer → Enricher → EventStore (async) + TerminalReporter
 *
 * createMonitorRuntime does NOT call start() on the returned client; the
 * caller (MonitorProvider or a plain JS host) decides when to boot.
 */
export async function createMonitorRuntime(
  overrides: MonitorConfigOverrides = {},
  deps: MonitorRuntimeDeps = {},
): Promise<MonitorRuntime> {
  const config: MonitorConfig = defineMonitorConfig(overrides);
  const isDev = deps.isDev ?? detectIsDev();
  const bus = new SignalBus();

  const store = new EventStore({
    backend: deps.eventStoreBackend ?? new MemoryEventStoreBackend(),
  });
  await store.init();

  const platformBridge: PlatformBridge =
    deps.platformBridge ??
    new JSPlatformBridge(deps.jsPlatformBridgeDeps ?? {});

  const session = new SessionManager({
    appState: deps.appState,
  });

  const sanitizer = new Sanitizer(deps.sanitizerOptions);
  const enricher = new Enricher({
    platformBridge,
    sessionManager: session,
  });

  // Processor pipeline: every raw event from a collector goes through
  // Sanitizer → Enricher before landing in the canonical store. The
  // collectors themselves already wrote a raw copy to the store in Phase
  // 1a to keep the implementation linear; in Phase 1b we'll route their
  // inserts through the pipeline.
  bus.onAll((event) => {
    const sanitized = sanitizer.sanitize(event);
    const enriched: EnrichedEvent = enricher.enrich(sanitized);
    void store.insert(enriched, 'normal').catch(() => {
      // swallow — the originating collector already wrote a raw copy
    });
  });

  const crash = new CrashCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    errorUtils: deps.errorUtils ?? null,
    rejectionTracker: deps.rejectionTracker ?? null,
  });
  const network = new NetworkCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    target: deps.networkTarget,
    ignoreHosts: deps.ignoreHosts,
  });
  const navigation = new NavigationCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    adapter: deps.navigationAdapter ?? null,
  });
  const custom = new CustomEventCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
  });

  const client = MonitorClient.init(config);
  client.registerCollector(crash);
  client.registerCollector(network);
  client.registerCollector(navigation);
  client.registerCollector(custom);

  const terminalReporter = new TerminalReporter({
    signalBus: bus,
    isDev,
    console: deps.console,
    rateLimitMs: deps.terminalRateLimitMs,
  });

  const runtime: MonitorRuntime = {
    client,
    bus,
    store,
    session,
    platformBridge,
    sanitizer,
    enricher,
    collectors: { crash, network, navigation, custom },
    terminalReporter,
    trackEvent: (name, attributes) => custom.trackEvent(name, attributes),
    trackScreenView: (screen, params) =>
      navigation.trackScreenView(screen, params),
    shutdown: async () => {
      terminalReporter.stop();
      if (client.isRunning()) client.stop();
      session.dispose();
      await store.close();
      MonitorClient.__resetForTesting();
    },
  };

  return runtime;
}

export function startMonitorRuntime(runtime: MonitorRuntime): void {
  runtime.client.start();
  runtime.terminalReporter.start();
}
