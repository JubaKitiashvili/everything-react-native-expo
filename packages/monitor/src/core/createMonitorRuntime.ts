import type { MonitorConfig, MonitorConfigOverrides, MonitorEvent } from '../types';
import { MonitorClient } from './MonitorClient';
import { defineMonitorConfig } from './Config';
import { SignalBus } from './SignalBus';
import { SessionManager, type AppStateLike } from './SessionManager';
import {
  CrashLoopGuard,
  MemoryCrashLoopPersistence,
  type CrashLoopPersistence,
} from './CrashLoopGuard';
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
  BurstThrottle,
  defaultBurstKeyFor,
} from '../processors/BurstThrottle';
import {
  ConsentGate,
  type ConsentState,
  type ConsentStore,
} from '../processors/ConsentGate';
import {
  CcpaGate,
  type CcpaDisclosure,
  type CcpaStore,
} from '../processors/CcpaGate';
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
import {
  RSCCollector,
  detectRSCEnabled,
} from '../collectors/RSCCollector';
import { ImageCollector } from '../collectors/ImageCollector';
import { A11yCollector } from '../collectors/A11yCollector';
import { StorageCollector } from '../collectors/StorageCollector';
import {
  DeepLinkCollector,
  type LinkingLike,
} from '../collectors/DeepLinkCollector';
import {
  BackgroundFetchCollector,
  type BackgroundAppStateLike,
  type BackgroundTaskRegistration,
} from '../collectors/BackgroundFetchCollector';
import {
  CustomDimensions,
  type DimensionValue,
} from './CustomDimensions';
// Phase 2b native collectors
import { DualThreadFPSCollector } from '../collectors/native/DualThreadFPSCollector';
import { FabricCommitCollector } from '../collectors/native/FabricCommitCollector';
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
import {
  RemoteConfigClient,
  type RemoteConfigTimer,
} from '../remote-config/RemoteConfigClient';
import type { RemoteConfig } from '../remote-config/RemoteConfig';
import {
  RemoteSamplingGate,
  applyFeatureFlags,
  splitPiiRules,
  type FeatureToggle,
} from '../remote-config/RemoteConfigApplier';
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
  /** Task 117.27 — React Native `Linking` module for deep-link capture. */
  linking?: LinkingLike | null;
  /**
   * Task 117.28 — AppState source for the BackgroundFetchCollector. Falls
   * back to `deps.appState` (shared with SessionManager) when omitted.
   */
  backgroundAppState?: BackgroundAppStateLike | null;
  /** Task 117.28 — optional background-task registration hook. */
  backgroundTaskRegistration?: BackgroundTaskRegistration | null;
  /**
   * Task 69 — RSC monitoring gate. RSC is opt-in (Expo Router server
   * components/functions), so the RSCCollector is wired but self-gates:
   * its `record*` methods no-op unless RSC is detected. Provide
   * `isRSCEnabled` for bespoke detection, or `rscEnabled` to force the
   * gate directly (overrides detection). When neither is set, the
   * collector falls back to `detectRSCEnabled()` (conservative, off by
   * default). The collector is always registered so its lifecycle is
   * managed alongside the other collectors.
   */
  isRSCEnabled?: () => boolean;
  /** Task 69 — force the RSC gate on/off, bypassing detection. */
  rscEnabled?: boolean;
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
  /**
   * Task 117.56 — optional persistent store for the CCPA Do-Not-Sell signal.
   */
  ccpaStore?: CcpaStore;
  /**
   * Task 117.56 — initial Do-Not-Sell value. Overrides `config.consent.doNotSell`
   * when provided; otherwise defaults to that config field (false when unset).
   */
  initialDoNotSell?: boolean;
  /** Dashboard runtime endpoint. When set, enables DashboardBridge. */
  dashboardUrl?: string;
  /**
   * Optional ingest key for the DashboardBridge. When set, it is appended to
   * the dashboard WebSocket URL as a URL-encoded `?apiKey=<token>` query param
   * so the bridge can authenticate against a dashboard server with ingest-key
   * auth enabled. Omitted by default (no token → current behaviour).
   */
  dashboardApiKey?: string;
  /** Injectable WebSocket constructor for tests. */
  webSocketCtor?: WebSocketCtor | null;
  /** Battery info source for AdaptiveSampler. */
  getBattery?: () => BatteryInfo | null;
  /** CPU pressure hint for AdaptiveSampler. */
  isCpuHigh?: () => boolean;
  /** BurstThrottle config overrides. Defaults: windowMs=5000, maxPerWindow=3. */
  burstThrottle?: {
    windowMs?: number;
    maxPerWindow?: number;
    enabled?: boolean;
  };
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
  /**
   * Task 117.47 — crash loop guard config. When omitted, the guard
   * runs with an in-memory persistence (catches in-session loops,
   * resets on relaunch). Production apps inject a backend that
   * survives restarts (AsyncStorage / expo-file-system / native
   * shared-prefs).
   */
  crashLoopPersistence?: CrashLoopPersistence | null;
  crashLoop?: {
    threshold?: number;
    windowMs?: number;
    resetAfterMs?: number;
  };
  /**
   * Task 117.55 — opt-in remote config. OFF by default: existing behaviour is
   * unchanged unless `enabled: true`. When enabled, the runtime polls the
   * dashboard server's `GET /v1/config` and applies the fetched config:
   *   - `sampling` gates event emission per type (probabilistic, RNG-injected);
   *   - `featureFlags` toggle the collectors they map to (unknown flags ignored);
   *   - `piiRules` feed the Sanitizer's extra sensitive keys / patterns.
   *
   * The endpoint is derived from `url` if given, else from `dashboardUrl`
   * (its ws scheme is normalised to http(s)). `fetchImpl`, `timer`, and
   * `random` are injectable for deterministic tests.
   */
  remoteConfig?: {
    enabled: boolean;
    /** Explicit `/v1/config` URL. Falls back to `dashboardUrl` derivation. */
    url?: string;
    /** Poll cadence in ms. Defaults to 5 minutes. */
    intervalMs?: number;
    /** Injectable fetch for tests; defaults to globalThis.fetch. */
    fetchImpl?: typeof fetch;
    /** Injectable timer for tests; defaults to global setInterval. */
    timer?: RemoteConfigTimer;
    /** Injectable RNG for the sampling gate; defaults to Math.random. */
    random?: () => number;
    /** Optional diagnostics sink for fetch/parse errors (never throws). */
    onError?: (error: unknown) => void;
  };
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
  burstThrottle: BurstThrottle;
  consentGate: ConsentGate;
  ccpaGate: CcpaGate;
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
    deepLink: DeepLinkCollector;
    backgroundFetch: BackgroundFetchCollector;
    rsc: RSCCollector;
  };
  customDimensions: CustomDimensions;
  signalRouter: SignalRouter;
  terminalReporter: TerminalReporter;
  dashboardBridge: DashboardBridge | null;
  crashLoopGuard: CrashLoopGuard;
  native: ErneMonitorNative;
  nativeCrashGateway: NativeCrashGateway;
  anrGateway: ANRGateway;
  nativeMetricsPoller: NativeMetricsPoller;
  dualThreadFPS: DualThreadFPSCollector;
  fabricCommit: FabricCommitCollector;
  spanSnapshot: SpanSnapshot;
  /**
   * Task 117.55 — remote config poller. Non-null only when
   * `deps.remoteConfig?.enabled` is true. Exposes the current config and an
   * `onChange` subscription.
   */
  remoteConfigClient: RemoteConfigClient | null;
  trackEvent: (
    name: string,
    attributes?: Record<string, CustomAttributeValue>,
  ) => void;
  trackScreenView: (
    screen: string,
    params?: Record<string, unknown>,
  ) => void;
  /** Task 117.27 — manually record a deep link the SDK didn't auto-capture. */
  trackDeepLink: (url: string, coldStart?: boolean) => void;
  /** Task 117.30 — set a single slicing dimension attached to events. */
  setDimension: (key: string, value: DimensionValue) => boolean;
  /** Task 117.30 — bulk-set user properties; returns accepted count. */
  setUserProperties: (props: Record<string, DimensionValue>) => number;
  leaveBreadcrumb: (crumb: Omit<Breadcrumb, 'timestamp'>) => void;
  setConsent: (partial: Partial<ConsentState>) => Promise<void>;
  /**
   * Task 117.56 — set the California CCPA/CPRA "Do Not Sell My Personal
   * Information" signal. When true, every outbound event has its
   * cross-context identifiers (user id, device model/locale) and
   * profiling/tracking data (custom dimensions, custom event attributes)
   * stripped before it reaches the store / transport. Persisted via the
   * optional `ccpaStore`. Operational telemetry (crashes, performance,
   * network timings) continues to flow.
   */
  setDoNotSell: (value: boolean) => Promise<void>;
  /** Task 117.56 — read the current Do-Not-Sell signal. */
  getDoNotSell: () => boolean;
  /**
   * Task 117.56 — structured CA-specific disclosure (data categories,
   * purposes, "we do not sell" statement) for the host app to surface in
   * its privacy UI. Reflects the current Do-Not-Sell state.
   */
  getCcpaDisclosure: () => CcpaDisclosure;
  /**
   * Attaches an opaque user identifier to every subsequently-enriched
   * event. Pass `null` on logout to detach. Enables GDPR DSAR export /
   * deletion via `exportUserData(id)` / `deleteUserData(id)`.
   */
  setUserId: (userId: string | null) => void;
  getUserId: () => string | null;
  /**
   * GDPR export — returns a JSON-serializable dump of every stored event
   * tagged with the given userId. Non-destructive. Returns an empty
   * array when userId is empty or unknown.
   */
  exportUserData: (
    userId: string,
    options?: { limit?: number },
  ) => Promise<UserDataExport>;
  /**
   * GDPR delete — purges every stored event tagged with the given
   * userId, clears the local Enricher userId if it matches, and
   * returns the number of rows removed.
   */
  deleteUserData: (userId: string) => Promise<UserDataDeletionResult>;
  shutdown: () => Promise<void>;
}

/** Serializable output of `monitor.exportUserData(id)`. */
export interface UserDataExport {
  readonly userId: string;
  readonly exportedAt: number;
  readonly sdkVersion: string;
  readonly eventCount: number;
  readonly events: readonly unknown[];
}

/** Result of `monitor.deleteUserData(id)`. */
export interface UserDataDeletionResult {
  readonly userId: string;
  readonly deletedAt: number;
  readonly eventsDeleted: number;
  readonly currentUserCleared: boolean;
}

/**
 * Kept here (not package.json) so a JS-only test can assert the version
 * embedded in exports. Bumped alongside package.json on publish.
 */
const SDK_VERSION = '0.1.0';

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

  // Task 117.47 — crash loop guard. Hydrated BEFORE any collector runs
  // so a previously-tripped guard can short-circuit startup. Tests opt
  // out entirely by passing `crashLoopPersistence: null` so we don't
  // cross-contaminate state via a module-level singleton.
  const crashLoopPersistence =
    deps.crashLoopPersistence === null
      ? null
      : (deps.crashLoopPersistence ?? new MemoryCrashLoopPersistence());
  const crashLoopGuard = new CrashLoopGuard({
    persistence: crashLoopPersistence ?? new MemoryCrashLoopPersistence(),
    ...(deps.crashLoop?.threshold !== undefined
      ? { threshold: deps.crashLoop.threshold }
      : {}),
    ...(deps.crashLoop?.windowMs !== undefined
      ? { windowMs: deps.crashLoop.windowMs }
      : {}),
    ...(deps.crashLoop?.resetAfterMs !== undefined
      ? { resetAfterMs: deps.crashLoop.resetAfterMs }
      : {}),
  });
  await crashLoopGuard.hydrate();

  // Task 117.30 — custom dimensions store. Declared before the Enricher so
  // its getter is wired into the enrichment path.
  const customDimensions = new CustomDimensions();

  const sanitizer = new Sanitizer(deps.sanitizerOptions);
  const enricher = new Enricher({
    platformBridge,
    sessionManager: session,
    getDimensions: () => customDimensions.getDimensions(),
  });
  const fingerprinter = new Fingerprinter();
  const sampler = new AdaptiveSampler({
    config,
    isDev,
    getBattery: deps.getBattery,
    isCpuHigh: deps.isCpuHigh,
  });
  const burstThrottle = new BurstThrottle({
    windowMs: deps.burstThrottle?.windowMs ?? 5000,
    maxPerWindow: deps.burstThrottle?.maxPerWindow ?? 3,
    keyFor: deps.burstThrottle?.enabled === false
      ? () => null // disabled: pass everything
      : defaultBurstKeyFor,
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

  // Task 117.56 — CCPA "Do Not Sell" signal. Initialized from the explicit
  // dep, then config.consent.doNotSell (default-on opt-in), then false.
  // Hydrated from the optional store so a previously-set opt-out survives
  // relaunch.
  const ccpaGate = new CcpaGate({
    doNotSell: deps.initialDoNotSell ?? config.consent.doNotSell ?? false,
    store: deps.ccpaStore,
  });
  await ccpaGate.hydrate();

  // Current screen tracker — declared early so collectors that want to
  // attach screen context (FrameDropCollector, ANRGateway, future
  // BugReporter) can read it via a lazy getter. It's updated by the
  // navigation listener wired below.
  let currentScreen: string | null = null;

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
    remoteSampledDropped: 0,
    burstThrottled: 0,
    stored: 0,
    lastEvent: null as MonitorEvent | null,
  };

  // Task 117.55 — remote sampling gate. Constructed unconditionally (so the
  // pipeline branch is stable) but starts as a no-op: an empty config keeps
  // every event (rate defaults to 1). It only gains teeth once a remote config
  // with sampling rates is applied. Off entirely unless remoteConfig.enabled.
  const remoteSamplingEnabled = deps.remoteConfig?.enabled === true;
  const remoteSamplingGate = new RemoteSamplingGate({
    random: deps.remoteConfig?.random,
  });

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
    // Task 117.55 — operator-controlled remote sampling. Runs after the
    // adaptive sampler so it can only TIGHTEN, not loosen. Critical safety
    // types always bypass it. No-op until a remote config is applied and only
    // active when remoteConfig.enabled.
    //
    // ANRs bypass too, but they are NOT a top-level `type` — ANRGateway emits
    // them as `type:'custom'` with `data.name === 'native_anr'` (see
    // src/native/ANRGateway.ts). The old `event.type !== 'native_anr'` guard
    // never matched, so ANRs were being remote-sampled away. Detect the custom
    // shape explicitly so both crashes AND ANRs always skip remote sampling.
    const isAnr =
      event.type === 'custom' &&
      (event.data as { name?: string } | undefined)?.name === 'native_anr';
    if (
      remoteSamplingEnabled &&
      event.type !== 'crash' &&
      !isAnr &&
      !remoteSamplingGate.shouldKeep(event.type)
    ) {
      stats.remoteSampledDropped += 1;
      return;
    }
    if (!burstThrottle.accept(event)) {
      stats.burstThrottled += 1;
      return;
    }
    const fingerprinted =
      event.type === 'crash' ? fingerprinter.annotate(event) : event;
    const sanitized = sanitizer.sanitize(fingerprinted);
    const enrichedRaw: EnrichedEvent = enricher.enrich(sanitized);
    // Task 117.56 — CCPA Do-Not-Sell gate. Runs on the ENRICHED event so it
    // can strip the identifiers that the Enricher attaches in the context
    // envelope (userId, device model/locale) plus profiling dimensions and
    // custom-event attributes. No-op when the signal is off.
    const enriched: EnrichedEvent = ccpaGate.process(enrichedRaw);
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
  const frameDrop = new FrameDropCollector({
    signalBus: bus,
    getCurrentScreen: () => currentScreen,
  });
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
  // Task 117.27 — deep link instrumentation.
  const deepLink = new DeepLinkCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    linking: deps.linking ?? null,
  });
  // Task 117.28 — background fetch lifecycle capture. Reuses the same
  // AppState source as SessionManager when a dedicated one isn't given.
  const backgroundFetch = new BackgroundFetchCollector({
    signalBus: bus,
    eventStore: store,
    sessionManager: session,
    appState: deps.backgroundAppState ?? deps.appState ?? null,
    taskRegistration: deps.backgroundTaskRegistration ?? null,
  });
  // Task 69 — RSC monitoring. Always wired (lifecycle managed by the
  // client), but RSC-specific: it self-gates via `isRSCEnabled`, computed
  // in init(). Explicit `rscEnabled` wins; then a custom detector; then the
  // conservative default (off unless EXPO_PUBLIC_RSC / __ERNE_RSC_ENABLED__).
  const rsc = new RSCCollector({
    signalBus: bus,
    isRSCEnabled:
      deps.rscEnabled !== undefined
        ? () => deps.rscEnabled as boolean
        : (deps.isRSCEnabled ?? detectRSCEnabled),
  });

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
  client.registerCollector(deepLink);
  client.registerCollector(backgroundFetch);
  client.registerCollector(rsc);

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
        ...(deps.dashboardApiKey !== undefined
          ? { apiKey: deps.dashboardApiKey }
          : {}),
        // Enrich the hello frame so the dashboard can render a real
        // device card (Platform / OS / version) instead of an empty
        // "unknown" row. Safe to read inline — PlatformBridge is
        // already constructed at this point and all getters are sync.
        deviceInfo: (() => {
          const device = platformBridge.getDeviceInfo();
          const app = platformBridge.getAppInfo();
          const info: {
            platform?: 'ios' | 'android' | 'web';
            model?: string;
            osVersion?: string;
            appVersion?: string;
          } = {};
          if (
            device.platform === 'ios' ||
            device.platform === 'android' ||
            device.platform === 'web'
          ) {
            info.platform = device.platform;
          }
          if (device.model) info.model = device.model;
          if (device.osVersion) info.osVersion = device.osVersion;
          if (app.version) info.appVersion = app.version;
          return info;
        })(),
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

  // ---- Current screen tracker — subscriber installs here after the
  // main pipeline so it runs on every emitted navigation event. The
  // `currentScreen` binding was declared up top; collectors that need it
  // (FrameDropCollector, ANRGateway, etc.) read via lazy getter. ----
  bus.onAll((event) => {
    if (event.type === 'navigation') {
      const d = event.data as Record<string, unknown> | undefined;
      if (d && typeof d.to === 'string') currentScreen = d.to;
    }
  });

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
    getCurrentScreen: () => currentScreen,
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
  const fabricCommit = new FabricCommitCollector({
    native,
    signalBus: bus,
    sessionManager: session,
  });

  // ---- Task 117.55: Remote Config client + apply wiring ----
  //
  // Built only when opted in. The apply path is pure (RemoteConfigApplier):
  //   - sampling  → swap the gate's active map (gate already in the pipeline);
  //   - flags     → diff against last-applied, fire collector toggles;
  //   - piiRules  → split into sensitive keys / patterns, push to Sanitizer.
  //
  // Feature flags map to collectors with clean start()/stop() semantics. A
  // `true` flag enables the collector, `false` disables it. The keys are the
  // SDK's stable flag vocabulary; operators set any subset and unknown flags
  // are ignored.
  let remoteConfigClient: RemoteConfigClient | null = null;
  if (remoteSamplingEnabled) {
    const featureToggles: Readonly<Record<string, FeatureToggle>> = {
      network: { on: () => network.start(), off: () => network.stop() },
      navigation: { on: () => navigation.start(), off: () => navigation.stop() },
      render: { on: () => render.start(), off: () => render.stop() },
      frameDrop: { on: () => frameDrop.start(), off: () => frameDrop.stop() },
      memory: { on: () => memory.start(), off: () => memory.stop() },
      longTask: { on: () => longTask.start(), off: () => longTask.stop() },
      state: { on: () => state.start(), off: () => state.stop() },
      a11y: { on: () => a11y.start(), off: () => a11y.stop() },
      image: { on: () => image.start(), off: () => image.stop() },
      storage: { on: () => storage.start(), off: () => storage.stop() },
      frustration: { on: () => frustration.start(), off: () => frustration.stop() },
      // PII redaction can be opted into harder via a flag; tightening only.
      dashboardStreaming: {
        on: () => dashboardBridge?.start(),
        off: () => dashboardBridge?.stop(),
      },
    };
    // Last-applied flag values so we only toggle on transitions (idempotent
    // re-applies are free). Seeded empty: the first apply fires every
    // explicitly-configured flag once.
    const appliedFlags: Record<string, boolean> = {};
    // Track which extra PII rules have already reached the Sanitizer so a
    // re-poll with the same rules doesn't re-push duplicates (Sanitizer keys
    // de-dupe anyway, but patterns would accumulate).
    const appliedPiiRules = new Set<string>();

    const applyConfig = (cfg: RemoteConfig): void => {
      // 1. sampling — swap the gate's active map atomically.
      remoteSamplingGate.setConfig(cfg);

      // 2. featureFlags — diff + fire toggles for known flags.
      applyFeatureFlags(cfg.featureFlags, featureToggles, appliedFlags);
      for (const [name, value] of Object.entries(cfg.featureFlags)) {
        appliedFlags[name] = value;
      }

      // 3. piiRules — split new rules into keys / patterns, feed Sanitizer.
      const newRules = cfg.piiRules.filter((r) => !appliedPiiRules.has(r));
      if (newRules.length > 0) {
        const split = splitPiiRules(newRules);
        if (split.sensitiveKeys.length > 0) {
          sanitizer.addSensitiveKeys(split.sensitiveKeys);
        }
        if (split.patterns.length > 0) {
          sanitizer.addPatterns(split.patterns);
        }
        for (const r of newRules) appliedPiiRules.add(r);
      }
    };

    remoteConfigClient = new RemoteConfigClient({
      ...(deps.remoteConfig?.url ? { url: deps.remoteConfig.url } : {}),
      ...(deps.dashboardUrl ? { baseUrl: deps.dashboardUrl } : {}),
      ...(deps.remoteConfig?.intervalMs !== undefined
        ? { intervalMs: deps.remoteConfig.intervalMs }
        : {}),
      ...(deps.remoteConfig?.fetchImpl
        ? { fetchImpl: deps.remoteConfig.fetchImpl }
        : {}),
      ...(deps.remoteConfig?.timer ? { timer: deps.remoteConfig.timer } : {}),
      ...(deps.remoteConfig?.onError
        ? { onError: deps.remoteConfig.onError }
        : {}),
    });
    // Subscribe BEFORE start() so the immediate (default) config and every
    // fetched change flow through applyConfig.
    remoteConfigClient.onChange(applyConfig);
  }

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
    burstThrottle,
    consentGate,
    ccpaGate,
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
      deepLink,
      backgroundFetch,
      rsc,
    },
    customDimensions,
    signalRouter,
    terminalReporter,
    dashboardBridge,
    crashLoopGuard,
    native,
    nativeCrashGateway,
    anrGateway,
    nativeMetricsPoller,
    dualThreadFPS,
    fabricCommit,
    spanSnapshot,
    remoteConfigClient,
    trackEvent: (name, attributes) => custom.trackEvent(name, attributes),
    trackScreenView: (screen, params) =>
      navigation.trackScreenView(screen, params),
    trackDeepLink: (url, coldStart) => deepLink.trackDeepLink(url, coldStart),
    setDimension: (key, value) => customDimensions.setDimension(key, value),
    setUserProperties: (props) => customDimensions.setUserProperties(props),
    leaveBreadcrumb: (crumb) => breadcrumb.leave(crumb),
    setConsent: (partial) => consentGate.setConsent(partial),
    setDoNotSell: (value) => ccpaGate.setDoNotSell(value),
    getDoNotSell: () => ccpaGate.isDoNotSell(),
    getCcpaDisclosure: () => ccpaGate.disclosure(),
    setUserId: (userId) => enricher.setUserId(userId),
    getUserId: () => enricher.getUserId(),
    exportUserData: async (userId, options) => {
      const limit = options?.limit ?? 10_000;
      const events =
        userId && userId.length > 0
          ? await store.findByUserId(userId, limit)
          : [];
      return {
        userId,
        exportedAt: Date.now(),
        sdkVersion: SDK_VERSION,
        eventCount: events.length,
        events,
      };
    },
    deleteUserData: async (userId) => {
      if (!userId) {
        return {
          userId,
          deletedAt: Date.now(),
          eventsDeleted: 0,
          currentUserCleared: false,
        };
      }
      const eventsDeleted = await store.deleteByUserId(userId);
      let currentUserCleared = false;
      if (enricher.getUserId() === userId) {
        enricher.setUserId(null);
        currentUserCleared = true;
      }
      return {
        userId,
        deletedAt: Date.now(),
        eventsDeleted,
        currentUserCleared,
      };
    },
    shutdown: async () => {
      remoteConfigClient?.stop();
      terminalReporter.stop();
      dashboardBridge?.stop();
      nativeMetricsPoller.stop();
      dualThreadFPS.stop();
      fabricCommit.stop();
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
  // Task 117.47 — honor a tripped crash loop guard. If the previous
  // launches hit `threshold` crashes within `windowMs`, skip every
  // collector and just announce the trip. The developer sees the
  // `crash_loop_detected` event (via TerminalReporter + dashboard) and
  // knows why monitoring is off. `reset()` via admin UI or a fresh
  // install clears the trip.
  if (runtime.crashLoopGuard.isTripped()) {
    runtime.terminalReporter.start();
    runtime.dashboardBridge?.start();
    runtime.crashLoopGuard.announceTripped(
      runtime.bus,
      runtime.session.getCurrentSessionId(),
    );
    return;
  }

  // Keep the guard attached so a crash LATER in this session still
  // increments the counter and can trip on the NEXT launch.
  runtime.crashLoopGuard.attachToBus(runtime.bus);

  runtime.client.start();
  runtime.terminalReporter.start();
  runtime.dashboardBridge?.start();
  // Task 117.55 — begin polling remote config (no-op when not enabled). The
  // initial fetch is fire-and-forget so boot never blocks on the network.
  runtime.remoteConfigClient?.start();
  // Phase 2a: install native crash handler if the native module is
  // linked, then drain any reports from the previous session.
  runtime.native.startNativeMonitoring();
  runtime.nativeCrashGateway.start();
  runtime.anrGateway.start();
  runtime.nativeMetricsPoller.start();
  runtime.dualThreadFPS.start();
  runtime.fabricCommit.start();
  void runtime.nativeCrashGateway.replayPersistedCrashes().catch(() => {
    // intentional swallow — boot must never fail because of a stale crash
  });
  void runtime.spanSnapshot.replayInterrupted().catch(() => {
    // same — replay is best-effort
  });
}
