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
// Phase 1c advanced collectors
import { TouchBoundaryCollector } from '../collectors/TouchBoundaryCollector';
import { FrustrationCollector } from '../collectors/FrustrationCollector';
import { StateCollector } from '../collectors/StateCollector';
import { SuspenseCollector } from '../collectors/SuspenseCollector';
import { ActivityCollector } from '../collectors/ActivityCollector';
import { ImageCollector } from '../collectors/ImageCollector';
import { A11yCollector } from '../collectors/A11yCollector';
import { StorageCollector } from '../collectors/StorageCollector';
// Phase 2b native collectors
import { DualThreadFPSCollector } from '../collectors/native/DualThreadFPSCollector';
// Phase 1c SignalRouter
import { SignalRouter } from '../signal-router/SignalRouter';
import type { DispatchedSignal } from '../signal-router/DispatchEngine';
import { TerminalReporter, type ConsoleLike } from '../integrations/TerminalReporter';
import {
  DashboardBridge,
  type WebSocketCtor,
} from '../integrations/DashboardBridge';
import {
  ErneMonitorNative,
  LazyNativeModuleLoader,
  createDefaultNativeModuleLoader,
  NativeCrashGateway,
} from '../native';
import { ANRGateway } from '../native/ANRGateway';
import { NativeMetricsPoller } from '../native/NativeMetricsPoller';
import { SpanSnapshot } from '../native/SpanSnapshot';
import type {
  ActiveSpanInfo,
  InterruptedSpan,
} from '../native/SpanSnapshot';
import type { NativeModuleLoader } from '../native';

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
  /**
   * Optional override for the Phase 2a native module loader. Tests
   * inject a fake; production uses createDefaultNativeModuleLoader().
   * Pass `null` to opt out entirely (useful for snapshots).
   */
  nativeModuleLoader?: NativeModuleLoader | null;
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
    touchBoundary: TouchBoundaryCollector;
    frustration: FrustrationCollector;
    state: StateCollector;
    suspense: SuspenseCollector;
    activity: ActivityCollector;
    image: ImageCollector;
    a11y: A11yCollector;
    storage: StorageCollector;
  };
  signalRouter: SignalRouter;
  terminalReporter: TerminalReporter;
  dashboardBridge: DashboardBridge | null;
  native: ErneMonitorNative;
  nativeCrashGateway: NativeCrashGateway;
  anrGateway: ANRGateway;
  nativeMetricsPoller: NativeMetricsPoller;
  dualThreadFPS: DualThreadFPSCollector;
  spanSnapshot: SpanSnapshot;
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

  // Forward reference — SignalRouter is instantiated after all the
  // collectors because it needs to wire dispatch outputs that reference
  // session/bus/store. The pipeline below captures it through a
  // mutable holder so the closure sees the eventually-assigned router.
  const routerHolder: { current: SignalRouter | null } = { current: null };

  // Main processing pipeline: Breadcrumb-attach → ConsentGate →
  // AdaptiveSampler → Fingerprinter → Sanitizer → Enricher → EventStore
  // → SignalRouter (intelligence).
  //
  // We mutate the raw event to attach the breadcrumb trail BEFORE the
  // sanitizer clones it, so the stored copy carries the trail. The
  // BreadcrumbCollector's own onAll subscriber independently updates the
  // ring buffer from non-crash events.
  bus.onAll((event) => {
    // Guard against re-entrance: SignalRouter dashboard output re-emits
    // dispatched signals on the bus as a synthetic MonitorEvent so the
    // DashboardBridge can stream them. We must not feed those back into
    // the router or we get an infinite loop.
    const passthrough = (event.data as { __erneSignalPassthrough?: boolean })
      .__erneSignalPassthrough;
    if (passthrough) return;

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

    // Feed the enriched event through the intelligence layer. The
    // router handles dedup, correlation, scoring, context, and
    // dispatch. Safe to call even when no pattern matches — it will
    // score low and drop.
    try {
      routerHolder.current?.process(enriched);
    } catch {
      // swallow — router must never break the main bus
    }
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

  // Phase 1c advanced collectors
  const touchBoundary = new TouchBoundaryCollector({ signalBus: bus });
  const frustration = new FrustrationCollector({ signalBus: bus });
  const state = new StateCollector({ signalBus: bus });
  const suspense = new SuspenseCollector({ signalBus: bus });
  const activity = new ActivityCollector({ signalBus: bus });
  const image = new ImageCollector({ signalBus: bus });
  const a11y = new A11yCollector({ signalBus: bus });
  const storage = new StorageCollector({ signalBus: bus });

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
  client.registerCollector(touchBoundary);
  client.registerCollector(frustration);
  client.registerCollector(state);
  client.registerCollector(suspense);
  client.registerCollector(activity);
  client.registerCollector(image);
  client.registerCollector(a11y);
  client.registerCollector(storage);

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

  // SignalRouter intelligence layer — processes enriched events from
  // inside the pipeline's onAll subscriber below. Dispatched signals
  // flow to three output channels:
  //   terminal — a separate console.log line tagged [monitor:signal]
  //   dashboard — re-emitted as a synthetic MonitorEvent on the bus so
  //               DashboardBridge streams it to the runtime tab
  //   store    — persisted alongside raw events for replay
  const signalConsole = deps.console ?? (globalThis.console as ConsoleLike);
  const signalRouter = new SignalRouter({
    getBreadcrumbs: (limit) => breadcrumb.getTrail().slice(-limit),
    getCurrentScreen: () => null,
    ratePerMinute: 30,
    outputs: [
      {
        name: 'terminal',
        deliver: (signal: DispatchedSignal) => {
          if (!isDev) return;
          try {
            signalConsole.log(
              `🛎️ [monitor:signal] ${signal.context.summary} (score=${signal.score})`,
            );
          } catch {
            // never fail dispatch
          }
        },
      },
      {
        name: 'dashboard',
        deliver: (signal: DispatchedSignal) => {
          // Re-emit as a custom MonitorEvent so DashboardBridge picks it up.
          // Uses a sentinel to avoid re-processing by SignalRouter.
          const wrapped: MonitorEvent = {
            type: 'custom',
            timestamp: signal.ts,
            wallTime: Date.now(),
            sessionId: session.getCurrentSessionId(),
            data: {
              name: 'monitor_signal',
              attributes: {
                id: signal.id,
                score: signal.score,
                summary: signal.context.summary,
                channels: signal.channels,
                dedupCount: signal.context.dedupCount,
              },
              __erneSignalPassthrough: true,
            },
          };
          try {
            bus.emit(wrapped);
          } catch {
            // swallow
          }
        },
      },
      {
        name: 'store',
        deliver: (signal: DispatchedSignal) => {
          const stored: MonitorEvent = {
            type: 'custom',
            timestamp: signal.ts,
            wallTime: Date.now(),
            sessionId: session.getCurrentSessionId(),
            data: {
              name: 'monitor_signal',
              attributes: {
                id: signal.id,
                score: signal.score,
                summary: signal.context.summary,
                channels: signal.channels,
                dedupCount: signal.context.dedupCount,
                screen: signal.context.screen,
                breadcrumbCount: signal.context.breadcrumbs.length,
              },
            },
          };
          void store.insert(stored, 'high').catch(() => {});
        },
      },
    ],
    now: () => Date.now(),
  });
  // Plug the router into the pipeline's forward reference so the
  // bus.onAll callback starts routing events through it.
  routerHolder.current = signalRouter;

  // ---- Phase 2a: native module bridge + crash gateway ----
  const nativeLoader: NativeModuleLoader =
    deps.nativeModuleLoader === null
      ? new LazyNativeModuleLoader(() => null)
      : (deps.nativeModuleLoader ?? createDefaultNativeModuleLoader());
  const native = new ErneMonitorNative(nativeLoader);
  const nativeCrashGateway = new NativeCrashGateway({
    native,
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    drainPersistedCrashes: () =>
      native.drainPersistedCrashes() as Promise<
        readonly import('../native').PersistedCrash[]
      >,
    acknowledgePersistedCrash: (id) => native.acknowledgePersistedCrash(id),
  });
  const anrGateway = new ANRGateway({
    native,
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
  });
  const nativeMetricsPoller = new NativeMetricsPoller({
    native,
    signalBus: bus,
    sessionManager: session,
    intervalMs: 30_000,
  });
  const spanSnapshot = new SpanSnapshot({
    native,
    signalBus: bus,
    sessionManager: session,
    startSpanImpl: (info: ActiveSpanInfo) =>
      native.startSpan(info.id, info.name, info.kind, info.parentId, info.startedAt),
    updateSpanImpl: (id, attributes) => {
      for (const [k, v] of Object.entries(attributes)) {
        native.updateSpan(id, k, typeof v === 'string' ? v : JSON.stringify(v));
      }
    },
    endSpanImpl: (id) => native.endSpan(id, Date.now()),
    drainInterruptedImpl: async () => {
      const raw = await native.drainInterruptedSpans();
      const out: InterruptedSpan[] = [];
      for (const r of raw) {
        const id = typeof r.id === 'string' ? r.id : '';
        const name = typeof r.name === 'string' ? r.name : '';
        const kind = typeof r.kind === 'string' ? r.kind : 'internal';
        const parentId = typeof r.parentId === 'string' ? r.parentId : null;
        const startedAt = typeof r.startedAt === 'number' ? r.startedAt : 0;
        const lastSeenAt = typeof r.lastSeenAt === 'number' ? r.lastSeenAt : startedAt;
        const durationMs = typeof r.durationMs === 'number' ? r.durationMs : 0;
        if (id && name) {
          out.push({ id, name, parentId, kind, startedAt, lastSeenAt, durationMs });
        }
      }
      return out;
    },
  });
  const dualThreadFPS = new DualThreadFPSCollector({
    native,
    signalBus: bus,
    sessionManager: session,
  });

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
      touchBoundary,
      frustration,
      state,
      suspense,
      activity,
      image,
      a11y,
      storage,
    },
    signalRouter,
    terminalReporter,
    dashboardBridge,
    native,
    nativeCrashGateway,
    anrGateway,
    nativeMetricsPoller,
    dualThreadFPS,
    spanSnapshot,
    trackEvent: (name, attributes) => custom.trackEvent(name, attributes),
    trackScreenView: (screen, params) =>
      navigation.trackScreenView(screen, params),
    leaveBreadcrumb: (crumb) => breadcrumb.leave(crumb),
    setConsent: (partial) => consentGate.setConsent(partial),
    shutdown: async () => {
      terminalReporter.stop();
      dashboardBridge?.stop();
      nativeMetricsPoller.stop();
      dualThreadFPS.stop();
      anrGateway.stop();
      nativeCrashGateway.stop();
      native.stopNativeMonitoring();
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
    g.__ERNE_MONITOR__ = { runtime, stats, native };
  }

  return runtime;
}

export function startMonitorRuntime(runtime: MonitorRuntime): void {
  runtime.client.start();
  runtime.terminalReporter.start();
  runtime.dashboardBridge?.start();
  // Phase 2a: install native crash handler if the native module is
  // linked, then drain any reports from the previous session.
  runtime.native.startNativeMonitoring();
  runtime.nativeCrashGateway.start();
  runtime.anrGateway.start();
  runtime.nativeMetricsPoller.start();
  runtime.dualThreadFPS.start();
  void runtime.nativeCrashGateway.replayPersistedCrashes().catch(() => {
    // intentional swallow — boot must never fail because of a stale crash
  });
  void runtime.spanSnapshot.replayInterrupted().catch(() => {
    // same — replay is best-effort
  });
}
