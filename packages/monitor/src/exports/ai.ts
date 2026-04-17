/**
 * `@erne/monitor/ai` — intelligence layer: SignalRouter pipeline
 * (dedup → correlate → score → context → dispatch → feedback), built-in
 * pattern library, anomaly detector, and pattern sync/OTA updater.
 *
 * Heavy: pulls the full 20-pattern RN library + anomaly rules + sync
 * state. Consumers who only want to forward events somewhere else
 * (OTel, custom transport) can skip this subpath.
 */

export { SignalRouter } from '../signal-router/SignalRouter';
export { DedupEngine } from '../signal-router/DedupEngine';
export type {
  DedupEntry,
  DedupEngineOptions,
} from '../signal-router/DedupEngine';
export { CorrelationEngine } from '../signal-router/CorrelationEngine';
export { ConfidenceScorer } from '../signal-router/ConfidenceScorer';
export { ContextBuilder } from '../signal-router/ContextBuilder';
export { DispatchEngine } from '../signal-router/DispatchEngine';
export type { DispatchedSignal } from '../signal-router/DispatchEngine';
export { FeedbackTracker } from '../signal-router/FeedbackTracker';
export { PatternLibrary } from '../signal-router/PatternLibrary';

// Intelligence (Phase 4)
export { AnomalyDetector } from '../intelligence/AnomalyDetector';
export { ModelLoader } from '../intelligence/ModelLoader';
export { OTAUpdater } from '../intelligence/OTAUpdater';
export { PatternSync } from '../intelligence/PatternSync';
