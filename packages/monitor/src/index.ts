// @erne/monitor — Runtime Intelligence SDK for React Native & Expo

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
export { CrashCollector } from './collectors/CrashCollector';
export { NetworkCollector } from './collectors/NetworkCollector';
export { NavigationCollector } from './collectors/NavigationCollector';
export {
  CustomEventCollector,
  CUSTOM_EVENT_LIMITS,
} from './collectors/CustomEventCollector';
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
