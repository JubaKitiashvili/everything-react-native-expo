/**
 * `@erne/monitor/testing` — helpers for tests, dashboard fixtures,
 * alert-rule validation, and pipeline load testing. Nothing here is
 * imported by the production runtime — this subpath is tree-shakeable
 * out of real app bundles.
 */

export {
  generateSyntheticEvent,
  generateSyntheticEventBatch,
  isSyntheticEvent,
  SYNTHETIC_MARKER,
} from './generateSyntheticEvent';
export type {
  SyntheticEventType,
  SyntheticEventOptions,
  BatchOptions,
} from './generateSyntheticEvent';

export { CrashInjector } from './CrashInjector';
export type {
  CrashInjectorDeps,
  CrashLoopOptions,
} from './CrashInjector';

export { NetworkDegrader } from './NetworkDegrader';
export type {
  NetworkDegraderDeps,
  DegradationMode,
  FetchLike,
} from './NetworkDegrader';
