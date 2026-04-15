// @erne/monitor — Runtime Intelligence SDK for React Native & Expo

export { MonitorProvider } from './MonitorProvider';
export type { MonitorProviderProps } from './MonitorProvider';
export {
  createMonitorRuntime,
  startMonitorRuntime,
} from './core/createMonitorRuntime';
export type {
  MonitorRuntime,
  MonitorRuntimeDeps,
} from './core/createMonitorRuntime';
export { MonitorClient } from './core/MonitorClient';
export {
  defineMonitorConfig,
  resolveCollectorMode,
  DEFAULT_MONITOR_CONFIG,
} from './core/Config';
export { JSPlatformBridge } from './core/JSPlatformBridge';
export type { JSPlatformBridgeDeps } from './core/JSPlatformBridge';
export { SignalBus } from './core/SignalBus';
export type { MonitorEventHandler } from './core/SignalBus';
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
export { Enricher } from './processors/Enricher';
export type { EnrichedEvent, EnricherDeps } from './processors/Enricher';
export { Fingerprinter } from './processors/Fingerprinter';
export type { FingerprintedCrashData } from './processors/Fingerprinter';
export { AdaptiveSampler } from './processors/AdaptiveSampler';
export type {
  AdaptiveSamplerDeps,
  BatteryInfo,
} from './processors/AdaptiveSampler';
export { ConsentGate } from './processors/ConsentGate';
export type {
  ConsentCategory,
  ConsentState,
  ConsentStore,
  ConsentGateOptions,
} from './processors/ConsentGate';
export { TerminalReporter } from './integrations/TerminalReporter';
export type {
  TerminalReporterOptions,
  ConsoleLike,
} from './integrations/TerminalReporter';
export { DashboardBridge } from './integrations/DashboardBridge';
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
export { TouchBoundaryCollector } from './collectors/TouchBoundaryCollector';
export type {
  TouchEventData,
  TouchCollectorDeps,
} from './collectors/TouchBoundaryCollector';
export { FrustrationCollector } from './collectors/FrustrationCollector';
export type {
  FrustrationEventData,
  FrustrationSignal,
  FrustrationLevel,
  FrustrationCollectorDeps,
} from './collectors/FrustrationCollector';
export { StateCollector } from './collectors/StateCollector';
export type {
  StateEventData,
  StateCollectorDeps,
} from './collectors/StateCollector';
export { SuspenseCollector } from './collectors/SuspenseCollector';
export type {
  SuspenseEventData,
  SuspenseCollectorDeps,
} from './collectors/SuspenseCollector';
export { ActivityCollector } from './collectors/ActivityCollector';
export type {
  ActivityEventData,
  ActivityMode,
  ActivityCollectorDeps,
} from './collectors/ActivityCollector';
export { ImageCollector } from './collectors/ImageCollector';
export type {
  ImageEventData,
  ImageLoadInfo,
  ImageCacheResult,
  ImageCollectorDeps,
} from './collectors/ImageCollector';
export { A11yCollector } from './collectors/A11yCollector';
export type {
  A11yEventData,
  A11yElementInfo,
  A11yViolation,
  A11ySeverity,
  A11yCollectorDeps,
} from './collectors/A11yCollector';
export { StorageCollector } from './collectors/StorageCollector';
export type {
  StorageEventData,
  StorageBackend,
  StorageOp,
  AsyncStorageLike,
  StorageCollectorDeps,
} from './collectors/StorageCollector';
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
// Phase 2b — Integrations
export { ExpoDevToolsPlugin } from './integrations/ExpoDevToolsPlugin';
export type {
  DevToolsPluginClient,
  DevToolsPluginClientFactory,
  ExpoDevToolsPluginDeps,
} from './integrations/ExpoDevToolsPlugin';
export { BugReporter } from './integrations/BugReporter';
export type {
  BugReport,
  BugReportTrigger,
  BugReporterDeps,
  ReplayFrameSnapshot,
} from './integrations/BugReporter';
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
