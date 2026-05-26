/**
 * `@erne/monitor/testing` — helpers for tests, dashboard fixtures,
 * alert-rule validation, and pipeline load testing. Tree-shakeable out
 * of real app bundles: nothing here is referenced by the runtime.
 */

export {
  generateSyntheticEvent,
  generateSyntheticEventBatch,
  isSyntheticEvent,
  SYNTHETIC_MARKER,
} from '../testing/generateSyntheticEvent';
export type {
  SyntheticEventType,
  SyntheticEventOptions,
  BatchOptions,
} from '../testing/generateSyntheticEvent';

export { CrashInjector } from '../testing/CrashInjector';
export type {
  CrashInjectorDeps,
  CrashLoopOptions,
} from '../testing/CrashInjector';

export { NetworkDegrader } from '../testing/NetworkDegrader';
export type {
  NetworkDegraderDeps,
  DegradationMode,
  FetchLike,
} from '../testing/NetworkDegrader';

// Task 117.76 — custom Jest matchers for asserting on captured ERNE events.
export {
  registerMatchers,
  erneMatchers,
  toHaveEmittedEvent,
  toHaveCrashWithFingerprint,
  toHaveNoUnhandledRejections,
} from '../testing/matchers';
export type { CapturedEventLike } from '../testing/matchers';
