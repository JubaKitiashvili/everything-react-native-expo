import type { MonitorConfig, MonitorConfigOverrides, MonitorEvent } from '../types';
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
import { Fingerprinter } from '../processors/Fingerprinter';
import {
  AdaptiveSampler,
  type BatteryInfo,
} from '../processors/AdaptiveSampler';
import {
  ConsentGate,
  type ConsentState,
  type ConsentStore,
} from '../processors/ConsentGate';
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
import {
  BreadcrumbCollector,
  type Breadcrumb,
} from '../collectors/BreadcrumbCollector';
import { RenderCollector } from '../collectors/RenderCollector';
import { FrameDropCollector } from '../collectors/FrameDropCollector';
import { StartupCollector } from '../collectors/StartupCollector';
import { MemoryCollector } from '../collectors/MemoryCollector';
import { LongTaskCollector } from '../collectors/LongTaskCollector';
import { TerminalReporter, type ConsoleLike } from '../integrations/TerminalReporter';
import {
  DashboardBridge,
  type WebSocketCtor,
} from '../integrations/DashboardBridge';

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
  /** Optional consent store (persistence). */
  consentStore?: ConsentStore;
  /** Initial consent state; defaults to config.consent. */
  initialConsent?: ConsentState;
  /** Dashboard runtime endpoint. When set, enables DashboardBridge. */
  dashboardUrl?: string;
  /** Injectable WebSocket constructor for tests. */
  webSocketCtor?: WebSocketCtor | null;
  /** Battery info source for AdaptiveSampler. */
  getBattery?: () => BatteryInfo | null;
  /** CPU pressure hint for AdaptiveSampler. */
  isCpuHigh?: () => boolean;
  /**
   * When true, exposes the runtime on globalThis.__ERNE_MONITOR__ so
   * you can inspect it from the JS debugger or via execute_in_app. Off
   * by default in prod.
   */
  exposeGlobal?: boolean;
}

export interface MonitorRuntime {
  client: MonitorClient;
  bus: SignalBus;
  store: EventStore;
  session: SessionManager;
  platformBridge: PlatformBridge;
  sanitizer: Sanitizer;
  enricher: Enricher;
  fingerprinter: Fingerprinter;
  sampler: AdaptiveSampler;
  consentGate: ConsentGate;
  collectors: {
    crash: CrashCollector;
    network: NetworkCollector;
    navigation: NavigationCollector;
    custom: CustomEventCollector;
    breadcrumb: BreadcrumbCollector;
    render: RenderCollector;
    frameDrop: FrameDropCollector;
    startup: StartupCollector;
    memory: MemoryCollector;
    longTask: LongTaskCollector;
  };
  terminalReporter: TerminalReporter;
  dashboardBridge: DashboardBridge | null;
  trackEvent: (
    name: string,
    attributes?: Record<string, CustomAttributeValue>,
  ) => void;
  trackScreenView: (
    screen: string,
    params?: Record<string, unknown>,
  ) => void;
  leaveBreadcrumb: (crumb: Omit<Breadcrumb, 'timestamp'>) => void;
  setConsent: (partial: Partial<ConsentState>) => Promise<void>;
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
 * Builds a fully-wired monitor runtime: every Phase 1a + 1b collector,
 * processor, and integration connected to a SignalBus, EventStore, and
 * SessionManager.
 *
 * Pipeline (runs on every emitted event via onAll):
 *   collector → SignalBus
 *     → ConsentGate (may buffer/drop)
 *     → AdaptiveSampler (may drop by rate)
 *     → Fingerprinter (annotates crash events)
 *     → Sanitizer (PII scrub)
 *     → Enricher (attach context envelope)
 *     → EventStore (persist)
 *
 * BreadcrumbCollector subscribes to the bus directly (upstream of the
 * main pipeline) so that crash events get a breadcrumb trail before
 * they're enriched.
 *
 * TerminalReporter also subscribes via onAll for dev console output.
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
  const fingerprinter = new Fingerprinter();
  const sampler = new AdaptiveSampler({
    config,
    isDev,
    getBattery: deps.getBattery,
    isCpuHigh: deps.isCpuHigh,
  });
  const consentGate = new ConsentGate({
    initial: deps.initialConsent ?? {
      crashes: config.consent.crashes,
      analytics: config.consent.analytics,
      replay: config.consent.replay,
    },
    store: deps.consentStore,
  });
  await consentGate.hydrate();

  // BreadcrumbCollector has its own SignalBus subscription — it captures
  // every non-crash event into a ring buffer and mutates crash events to
  // attach the trail. It must subscribe BEFORE the main pipeline so the
  // crash handler sees the fully-populated trail.
  const breadcrumb = new BreadcrumbCollector({ signalBus: bus });

  // Stats counters for diagnostics — incremented inside the pipeline so
  // tests and the dashboard can verify drops / passes.
  const stats = {
    total: 0,
    consentDropped: 0,
    sampledDropped: 0,
    stored: 0,
    lastEvent: null as MonitorEvent | null,
  };

  // Main processing pipeline: Breadcrumb-attach → ConsentGate →
  // AdaptiveSampler → Fingerprinter → Sanitizer → Enricher → EventStore.
  //
  // We mutate the raw event to attach the breadcrumb trail BEFORE the
  // sanitizer clones it, so the stored copy carries the trail. The
  // BreadcrumbCollector's own onAll subscriber independently updates the
  // ring buffer from non-crash events.
  bus.onAll((event) => {
    stats.total += 1;
    if (event.type === 'crash') {
      (event.data as { breadcrumbs?: Breadcrumb[] }).breadcrumbs =
        breadcrumb.getTrail();
    }
    if (!consentGate.process(event)) {
      stats.consentDropped += 1;
      return;
    }
    if (!sampler.shouldKeep(event)) {
      stats.sampledDropped += 1;
      return;
    }
    const fingerprinted =
      event.type === 'crash' ? fingerprinter.annotate(event) : event;
    const sanitized = sanitizer.sanitize(fingerprinted);
    const enriched: EnrichedEvent = enricher.enrich(sanitized);
    stats.lastEvent = enriched;
    void store
      .insert(enriched, event.type === 'crash' ? 'critical' : 'normal')
      .then(() => {
        stats.stored += 1;
      })
      .catch(() => {
        // swallow — originating collector already wrote a raw copy
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
  const render = new RenderCollector({ signalBus: bus });
  const frameDrop = new FrameDropCollector({ signalBus: bus });
  const startup = new StartupCollector({ signalBus: bus });
  const memory = new MemoryCollector({
    signalBus: bus,
    platformBridge,
  });
  const longTask = new LongTaskCollector({ signalBus: bus });

  const client = MonitorClient.init(config);
  client.registerCollector(crash);
  client.registerCollector(breadcrumb);
  client.registerCollector(network);
  client.registerCollector(navigation);
  client.registerCollector(custom);
  client.registerCollector(render);
  client.registerCollector(frameDrop);
  client.registerCollector(startup);
  client.registerCollector(memory);
  client.registerCollector(longTask);

  const terminalReporter = new TerminalReporter({
    signalBus: bus,
    isDev,
    console: deps.console,
    rateLimitMs: deps.terminalRateLimitMs,
  });

  const dashboardBridge = deps.dashboardUrl
    ? new DashboardBridge({
        signalBus: bus,
        url: deps.dashboardUrl,
        isDev,
        WebSocket: deps.webSocketCtor,
      })
    : null;

  const runtime: MonitorRuntime = {
    client,
    bus,
    store,
    session,
    platformBridge,
    sanitizer,
    enricher,
    fingerprinter,
    sampler,
    consentGate,
    collectors: {
      crash,
      network,
      navigation,
      custom,
      breadcrumb,
      render,
      frameDrop,
      startup,
      memory,
      longTask,
    },
    terminalReporter,
    dashboardBridge,
    trackEvent: (name, attributes) => custom.trackEvent(name, attributes),
    trackScreenView: (screen, params) =>
      navigation.trackScreenView(screen, params),
    leaveBreadcrumb: (crumb) => breadcrumb.leave(crumb),
    setConsent: (partial) => consentGate.setConsent(partial),
    shutdown: async () => {
      terminalReporter.stop();
      dashboardBridge?.stop();
      if (client.isRunning()) client.stop();
      session.dispose();
      await store.close();
      if (deps.exposeGlobal) {
        const g = globalThis as { __ERNE_MONITOR__?: unknown };
        delete g.__ERNE_MONITOR__;
      }
      MonitorClient.__resetForTesting();
    },
  };

  if (deps.exposeGlobal) {
    const g = globalThis as {
      __ERNE_MONITOR__?: unknown;
    };
    g.__ERNE_MONITOR__ = { runtime, stats };
  }

  return runtime;
}

export function startMonitorRuntime(runtime: MonitorRuntime): void {
  runtime.client.start();
  runtime.terminalReporter.start();
  runtime.dashboardBridge?.start();
}
