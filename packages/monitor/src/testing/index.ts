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

// Task 117.76 — custom Jest matchers for asserting on captured ERNE events.
export {
  registerMatchers,
  erneMatchers,
  toHaveEmittedEvent,
  toHaveCrashWithFingerprint,
  toHaveNoUnhandledRejections,
} from './matchers';
export type { CapturedEventLike } from './matchers';
