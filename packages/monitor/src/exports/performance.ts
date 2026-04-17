/**
 * `@erne/monitor/performance` — performance-related collectors and
 * processors only. Consumers who only care about FPS / memory / render
 * timing / layout latency can import from this subpath to keep the rest
 * of the SDK (crash, network, AI router, replay) out of their bundle.
 */

export { RenderCollector } from '../collectors/RenderCollector';
export type {
  RenderEventData,
  RenderEventReason,
  RenderSampleHints,
  RenderCollectorDeps,
} from '../collectors/RenderCollector';

export { FrameDropCollector } from '../collectors/FrameDropCollector';
export type {
  FrameDropEventData,
  FrameDropCollectorDeps,
} from '../collectors/FrameDropCollector';

export { StartupCollector } from '../collectors/StartupCollector';
export type {
  StartupEventData,
  StartupKind,
  StartupCollectorDeps,
} from '../collectors/StartupCollector';

export { MemoryCollector } from '../collectors/MemoryCollector';
export type {
  MemoryEventData,
  MemoryCollectorDeps,
} from '../collectors/MemoryCollector';

export { LongTaskCollector } from '../collectors/LongTaskCollector';
export type {
  LongTaskEventData,
  LongTaskCollectorDeps,
  PerformanceObserverLike,
  PerformanceObserverCtor,
} from '../collectors/LongTaskCollector';

export { ActivityCollector } from '../collectors/ActivityCollector';
export type {
  ActivityEventData,
  ActivityCollectorDeps,
} from '../collectors/ActivityCollector';

export { SuspenseCollector } from '../collectors/SuspenseCollector';
export type {
  SuspenseEventData,
  SuspenseCollectorDeps,
} from '../collectors/SuspenseCollector';

// Native performance collectors
export { DualThreadFPSCollector } from '../collectors/native/DualThreadFPSCollector';
export type { DualThreadFPSCollectorDeps } from '../collectors/native/DualThreadFPSCollector';

export { FabricCommitCollector } from '../collectors/native/FabricCommitCollector';
export type { FabricCommitCollectorDeps } from '../collectors/native/FabricCommitCollector';

export { HermesProfilerCollector } from '../collectors/native/HermesProfilerCollector';
export type { HermesProfilerCollectorDeps } from '../collectors/native/HermesProfilerCollector';
