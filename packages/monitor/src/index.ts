// @erne/monitor — Runtime Intelligence SDK for React Native & Expo

export { MonitorProvider, useMonitor } from './MonitorProvider';
export type { MonitorProviderProps } from './MonitorProvider';
export {
  createMonitorRuntime,
  startMonitorRuntime,
} from './core/createMonitorRuntime';
export type {
  MonitorRuntime,
  MonitorRuntimeDeps,
  UserDataExport,
  UserDataDeletionResult,
} from './core/createMonitorRuntime';
export { MonitorClient } from './core/MonitorClient';
export {
  defineMonitorConfig,
  resolveCollectorMode,
  DEFAULT_MONITOR_CONFIG,
  DEFAULT_SAMPLING_BY_TYPE,
} from './core/Config';
export type { PerTypeSamplingRate } from './types';
export { JSPlatformBridge } from './core/JSPlatformBridge';
export type { JSPlatformBridgeDeps } from './core/JSPlatformBridge';
export { SignalBus } from './core/SignalBus';
export type { MonitorEventHandler } from './core/SignalBus';
export { CrashLoopGuard, MemoryCrashLoopPersistence } from './core/CrashLoopGuard';
export type {
  CrashLoopState,
  CrashLoopPersistence,
  CrashLoopGuardOptions,
} from './core/CrashLoopGuard';
export {
  EventStore,
  MemoryEventStoreBackend,
} from './storage/EventStore';
export { SqliteEventStoreBackend } from './storage/SqliteEventStoreBackend';
export type {
  SqliteEventStoreBackendOptions,
  ExpoSqliteLike,
  ExpoSqliteDatabase,
} from './storage/SqliteEventStoreBackend';
export { Sanitizer } from './processors/Sanitizer';
export type { SanitizerOptions } from './processors/Sanitizer';
// Task 117.55 — SDK Remote Config (poll /v1/config + apply).
export {
  DEFAULT_REMOTE_CONFIG,
  validateRemoteConfig,
  remoteConfigEquals,
} from './remote-config/RemoteConfig';
export type { RemoteConfig } from './remote-config/RemoteConfig';
export {
  RemoteConfigClient,
  deriveConfigUrl,
  DEFAULT_POLL_INTERVAL_MS,
} from './remote-config/RemoteConfigClient';
export type {
  RemoteConfigClientDeps,
  RemoteConfigListener,
  RemoteConfigTimer,
} from './remote-config/RemoteConfigClient';
export {
  RemoteSamplingGate,
  applyFeatureFlags,
  splitPiiRules,
  DEFAULT_SAMPLING_KEY,
} from './remote-config/RemoteConfigApplier';
export type {
  RemoteSamplingGateDeps,
  FeatureToggle,
  ApplyFeatureFlagsResult,
  PiiRuleSplit,
} from './remote-config/RemoteConfigApplier';
export { Enricher } from './processors/Enricher';
export type { EnrichedEvent, EnricherDeps } from './processors/Enricher';
export { Fingerprinter } from './processors/Fingerprinter';
export type { FingerprintedCrashData } from './processors/Fingerprinter';
export { AdaptiveSampler } from './processors/AdaptiveSampler';
export type {
  AdaptiveSamplerDeps,
  BatteryInfo,
} from './processors/AdaptiveSampler';
export {
  BurstThrottle,
  defaultBurstKeyFor,
} from './processors/BurstThrottle';
export type { BurstThrottleOptions } from './processors/BurstThrottle';
export { ConsentGate } from './processors/ConsentGate';
export type {
  ConsentCategory,
  ConsentState,
  ConsentStore,
  ConsentGateOptions,
} from './processors/ConsentGate';
// Task 117.56 — CCPA Do-Not-Sell signal + CA disclosure
export { CcpaGate, applyDoNotSell } from './processors/CcpaGate';
export type {
  CcpaState,
  CcpaStore,
  CcpaGateOptions,
  CcpaDataCategory,
  CcpaDisclosure,
} from './processors/CcpaGate';
// Task 117.107 — the TerminalReporter + DashboardBridge *values* are dev-only
// (dev-gated, never started in production) and are now lazy-loaded by
// `createMonitorRuntime` via dynamic `import()`. Re-exporting them as values
// here would pin their bytes into the production `main` bundle's static graph,
// defeating the lazy split. They remain publicly importable from the
// `@erne/monitor/dev` subpath. Types stay re-exported here (erased at build →
// zero bundle cost) so callers can still name them.
export type {
  TerminalReporterOptions,
  ConsoleLike,
} from './integrations/TerminalReporter';
export type {
  DashboardBridgeOptions,
  WebSocketCtor,
  WebSocketLike,
} from './integrations/DashboardBridge';
export { CrashCollector } from './collectors/CrashCollector';
export { NetworkCollector } from './collectors/NetworkCollector';
export { NavigationCollector } from './collectors/NavigationCollector';
export {
  CustomEventCollector,
  CUSTOM_EVENT_LIMITS,
} from './collectors/CustomEventCollector';
export { BreadcrumbCollector } from './collectors/BreadcrumbCollector';
export type {
  Breadcrumb,
  BreadcrumbCategory,
  BreadcrumbCollectorDeps,
} from './collectors/BreadcrumbCollector';
export { RenderCollector } from './collectors/RenderCollector';
export type {
  RenderEventData,
  RenderEventReason,
  RenderSampleHints,
  RenderCollectorDeps,
} from './collectors/RenderCollector';
export { FrameDropCollector } from './collectors/FrameDropCollector';
export type {
  FrameDropEventData,
  FrameDropCollectorDeps,
} from './collectors/FrameDropCollector';
export { StartupCollector } from './collectors/StartupCollector';
export type {
  StartupEventData,
  StartupKind,
  StartupCollectorDeps,
} from './collectors/StartupCollector';
export { MemoryCollector } from './collectors/MemoryCollector';
export type {
  MemoryEventData,
  MemoryCollectorDeps,
} from './collectors/MemoryCollector';
export { LongTaskCollector } from './collectors/LongTaskCollector';
export type {
  LongTaskEventData,
  LongTaskCollectorDeps,
  PerformanceObserverLike,
  PerformanceObserverCtor,
} from './collectors/LongTaskCollector';
// Phase 1c advanced collectors
//
// Task 117.107 — these optional instrumentation collectors are lazy-loaded by
// `createMonitorRuntime` via dynamic `import()` so their implementation bytes
// no longer live in `main`'s static bundle graph. Re-exporting them as values
// here would re-anchor them into `main`, so only their TYPES are re-exported
// (erased at build → zero bundle cost). `ActivityCollector` and
// `SuspenseCollector` also remain importable as values from the
// `@erne/monitor/performance` subpath for consumers who wire them by hand.
export type {
  TouchEventData,
  TouchCollectorDeps,
} from './collectors/TouchBoundaryCollector';
export type {
  FrustrationEventData,
  FrustrationSignal,
  FrustrationLevel,
  FrustrationCollectorDeps,
} from './collectors/FrustrationCollector';
export type {
  StateEventData,
  StateCollectorDeps,
} from './collectors/StateCollector';
export type {
  SuspenseEventData,
  SuspenseCollectorDeps,
} from './collectors/SuspenseCollector';
export type {
  ActivityEventData,
  ActivityMode,
  ActivityCollectorDeps,
} from './collectors/ActivityCollector';
export type {
  ImageEventData,
  ImageLoadInfo,
  ImageCacheResult,
  ImageCollectorDeps,
} from './collectors/ImageCollector';
export type {
  A11yEventData,
  A11yElementInfo,
  A11yViolation,
  A11ySeverity,
  A11yCollectorDeps,
} from './collectors/A11yCollector';
export type {
  StorageEventData,
  StorageBackend,
  StorageOp,
  AsyncStorageLike,
  StorageCollectorDeps,
} from './collectors/StorageCollector';
// Task 117.27 — Deep link instrumentation
export type {
  DeepLinkEventData,
  LinkingLike,
  DeepLinkCollectorDeps,
} from './collectors/DeepLinkCollector';
// Task 117.28 — Background fetch lifecycle capture
export type {
  BackgroundTransitionEventData,
  BackgroundTaskEventData,
  BackgroundTaskResult,
  BackgroundAppStateLike,
  BackgroundTaskRegistration,
  BackgroundFetchCollectorDeps,
} from './collectors/BackgroundFetchCollector';
// Phase 1c SignalRouter core
export { SignalRouter } from './signal-router/SignalRouter';
export type {
  SignalRouterDeps,
  SignalRouterStats,
} from './signal-router/SignalRouter';
export { DedupEngine } from './signal-router/DedupEngine';
export type {
  DedupEntry,
  DedupEngineOptions,
} from './signal-router/DedupEngine';
export { CorrelationEngine } from './signal-router/CorrelationEngine';
export type {
  CorrelationGroup,
  CorrelationEngineOptions,
} from './signal-router/CorrelationEngine';
export { ConfidenceScorer } from './signal-router/ConfidenceScorer';
export type {
  ConfidenceInput,
  ConfidenceScorerOptions,
} from './signal-router/ConfidenceScorer';
export { ContextBuilder } from './signal-router/ContextBuilder';
export type {
  BuiltContext,
  SourceLocation,
  ContextBuilderDeps,
} from './signal-router/ContextBuilder';
export { DispatchEngine } from './signal-router/DispatchEngine';
export type {
  DispatchChannel,
  DispatchedSignal,
  DispatchOutput,
  DispatchEngineOptions,
} from './signal-router/DispatchEngine';
export { FeedbackTracker } from './signal-router/FeedbackTracker';
export type {
  FeedbackRating,
  FeedbackEntry,
  FeedbackStore,
  FeedbackTrackerOptions,
} from './signal-router/FeedbackTracker';
export { PatternLibrary } from './signal-router/PatternLibrary';
export type { Pattern, PatternMatch } from './signal-router/PatternLibrary';
export type {
  CustomEventCollectorDeps,
  CustomEventData,
  CustomAttributeValue,
} from './collectors/CustomEventCollector';
export type {
  NavigationCollectorDeps,
  NavigationAdapter,
  NavigationEventData,
} from './collectors/NavigationCollector';
export type {
  NetworkCollectorDeps,
  NetworkEventData,
} from './collectors/NetworkCollector';
export type {
  CrashCollectorDeps,
  CrashEventData,
  ErrorUtilsLike,
  ErrorUtilsHandler,
  RejectionTrackerLike,
} from './collectors/CrashCollector';
export type {
  EventPriority,
  EventStoreBackend,
  EventStoreOptions,
  StoredEventRow,
} from './storage/EventStore';
export { SessionManager } from './core/SessionManager';
export type {
  SessionManagerDeps,
  SessionChangeListener,
  AppStateLike,
  AppStateStatus,
} from './core/SessionManager';
// Task 117.30 — Custom dimensions / user properties
export {
  CustomDimensions,
  CUSTOM_DIMENSION_LIMITS,
} from './core/CustomDimensions';
export type {
  DimensionValue,
  CustomDimensionsOptions,
} from './core/CustomDimensions';
// Task 117.31 — Offline event queue with resumable uploads
export {
  OfflineQueue,
  MemoryOfflineStorage,
  OFFLINE_QUEUE_DEFAULTS,
} from './core/OfflineQueue';
export type {
  OfflineStorage,
  OfflineQueueStats,
  OfflineQueueOptions,
  OfflineSend,
} from './core/OfflineQueue';
// Task 117.32 — JS + native temporal correlation timeline
export {
  buildTimeline,
  correlate,
  TEMPORAL_CORRELATION_DEFAULTS,
} from './core/TemporalCorrelation';
export type {
  TimelineOrigin,
  TemporalEvent,
  TimelineEntry,
  CorrelationLink,
} from './core/TemporalCorrelation';
// Task 117.77 — EAS Update / OTA version tagging
export { getOtaContext, withOtaContext } from './core/ota';
export type { OtaContext, ExpoUpdatesLike } from './core/ota';
// Task 117.72 — SDK version telemetry + upgrade nag
export {
  SDK_VERSION,
  compareVersions,
  getVersionContext,
  checkForUpgrade,
  withVersionContext,
} from './core/versionTelemetry';
export type {
  UpgradeSeverity,
  VersionContext,
  UpgradeCheck,
} from './core/versionTelemetry';
// Task 117.24 — React 19 Actions instrumentation
export { ActionsCollector } from './collectors/ActionsCollector';
export type {
  ActionStatus,
  ActionEventData,
  AnyAction,
  WrapActionOptions,
  ActionsCollectorDeps,
} from './collectors/ActionsCollector';
// Phase 2b — Native advanced collectors
export { DualThreadFPSCollector } from './collectors/native/DualThreadFPSCollector';
export type {
  DualThreadFPSEventData,
  DualThreadFPSCollectorDeps,
} from './collectors/native/DualThreadFPSCollector';
export { FabricCommitCollector } from './collectors/native/FabricCommitCollector';
export { ReplayCollector } from './collectors/native/ReplayCollector';
export type {
  ReplayFrame,
  ReplayCollectorDeps,
} from './collectors/native/ReplayCollector';
export { ReplayMasker } from './processors/ReplayMasker';
export type {
  ReplayMaskRegion,
  ReplayMaskerOptions,
  ViewInfo,
} from './processors/ReplayMasker';
export type {
  FabricCommitEventData,
  FabricCommitCollectorDeps,
} from './collectors/native/FabricCommitCollector';
export { LayoutSnapshotCollector } from './collectors/native/LayoutSnapshotCollector';
export type {
  LayoutSnapshotNode,
  LayoutSnapshotCollectorDeps,
} from './collectors/native/LayoutSnapshotCollector';
export { HermesProfilerCollector } from './collectors/native/HermesProfilerCollector';
export type {
  ProfileInfo,
  HermesProfilerCollectorDeps,
  HermesInternalLike,
} from './collectors/native/HermesProfilerCollector';
export { VisualReproCollector } from './collectors/native/VisualReproCollector';
export type {
  VisualReproScreenshot,
  VisualReproCollectorDeps,
} from './collectors/native/VisualReproCollector';
// Phase 3 — Transport
export { BatchTransport } from './transport/BatchTransport';
export type {
  TransportHealth,
  NetInfoLike,
  BatchTransportDeps,
} from './transport/BatchTransport';
export { RetryQueue, MemoryRetryQueueStorage } from './transport/RetryQueue';
export type {
  RetryEntry,
  RetryQueueStorage,
  RetryQueueOptions,
} from './transport/RetryQueue';
export { OTelExporter } from './transport/OTelExporter';
export type { OTelExporterDeps, OTelResource } from './transport/OTelExporter';
export { mapNavigationToSpan } from './transport/otel/TraceMapper';
export type { OTelSpan, OTelAttribute } from './transport/otel/TraceMapper';
export { mapEventToMetrics } from './transport/otel/MetricMapper';
export type { OTelMetric, OTelMetricDataPoint } from './transport/otel/MetricMapper';
export { mapEventToLogRecord } from './transport/otel/LogMapper';
export type { OTelLogRecord } from './transport/otel/LogMapper';
// Phase 2b — Integrations.
// NOTE: the ExpoDevToolsPlugin + BugReporter *values* are dev-only and are
// exported from the `@erne/monitor/dev` subpath, NOT here — re-exporting them
// from the main entry pulled ~2.3KB gzip of dev code into every production
// bundle (the `/dev` barrel explicitly states it must never ship to prod).
// Types stay re-exported here (erased at build, zero bundle cost) so callers
// can still name them. Import the values from `@erne/monitor/dev`.
export type {
  DevToolsPluginClient,
  DevToolsPluginClientFactory,
  ExpoDevToolsPluginDeps,
} from './integrations/ExpoDevToolsPlugin';
export type {
  BugReport,
  BugReportTrigger,
  BugReporterDeps,
  ReplayFrameSnapshot,
} from './integrations/BugReporter';
// Task 117.20 — bidirectional bug-report channel. The VALUE lives on the
// `@erne/monitor/bug-reports` subpath (opt-in, kept out of the main bundle);
// types are re-exported here (erased at build) so callers can name them.
export type {
  BugReportChannelOptions,
  OperatorReply,
  SubmitReportInput,
} from './integrations/BugReportChannel';
// Phase 2a — Native module bridge
export {
  ErneMonitorNative,
  LazyNativeModuleLoader,
  createDefaultNativeModuleLoader,
  NativeCrashGateway,
  NOOP_NATIVE_SUBSCRIPTION,
  UNKNOWN_NATIVE_METRICS,
} from './native';
export type {
  ErneMonitorNativeModule,
  NativeANRReport,
  NativeCrashGatewayDeps,
  NativeCrashReport,
  NativeDualThreadFPSReport,
  NativeEventMap,
  NativeEventName,
  NativeFabricCommitReport,
  NativeMetricsSnapshot,
  NativeModuleLoader,
  NativeMonitorState,
  NativeSubscription,
  NativeThermalEvent,
  PersistedCrash,
  PersistedCrashRecord,
  ThermalState,
} from './native';
export type {
  MonitorConfig,
  MonitorConfigOverrides,
  Collector,
  CollectorMode,
  AutoFixMode,
  MonitorEvent,
  MonitorEventType,
  PlatformBridge,
  PlatformName,
  DeviceInfo,
  AppInfo,
  MemoryInfo,
  ConnectionType,
} from './types';
// Phase 4 — Intelligence
export { PatternSync } from './intelligence/PatternSync';
export type {
  CachedPattern,
  PatternSyncTransport,
  PatternSyncDeps,
} from './intelligence/PatternSync';
export { AnomalyDetector } from './intelligence/AnomalyDetector';
export type {
  AnomalyType,
  AnomalyResult,
  AnomalyInput,
  AnomalyModel,
  AnomalyDetectorDeps,
} from './intelligence/AnomalyDetector';
export { ModelLoader } from './intelligence/ModelLoader';
export type {
  ModelStatus,
  ModelLoadProgress,
  ModelSource,
  ModelFactory,
} from './intelligence/ModelLoader';
export { OTAUpdater } from './intelligence/OTAUpdater';
export type {
  OTAManifest,
  OTAVersionInfo,
  OTAStorage,
  OTAUpdaterDeps,
  OTAUpdateStatus,
  OTAUpdateResult,
} from './intelligence/OTAUpdater';
// Phase 4 — Plugins
export { PluginRegistry, validatePlugin } from './plugins/PluginRegistry';
export type {
  PluginType,
  MonitorPlugin,
  PluginRegistration,
  PluginRegistryDeps,
} from './plugins/PluginRegistry';
export { PluginLoader } from './plugins/PluginLoader';
export type {
  PluginResolver,
  PluginConfig,
  PluginLoadResult,
} from './plugins/PluginLoader';
export {
  withMetroInstrumentation,
  shouldInstrument,
  buildTransformSpec,
} from './plugins/withMetroInstrumentation';
export type {
  MetroInstrumentationConfig,
  MetroConfig,
  BabelTransformSpec,
} from './plugins/withMetroInstrumentation';
// Phase 4 — RSC Collector
// Task 117.107 — RSC monitoring is opt-in (Expo Router server components) and
// self-gates; the collector is lazy-loaded by `createMonitorRuntime`. Only its
// types are re-exported here to keep the value out of `main`'s static graph.
export type {
  RSCEventData,
  RSCCollectorDeps,
} from './collectors/RSCCollector';
