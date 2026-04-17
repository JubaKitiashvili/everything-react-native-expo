/**
 * `@erne/monitor/dev` — developer-experience-only surface: Expo Dev
 * Tools plugin, shake-to-report BugReporter, terminal reporter for
 * Metro, and dev-only diagnostic surface for integration tests.
 *
 * Imports from this subpath should never ship in a production bundle —
 * consumers typically guard behind `if (__DEV__) { ... }`.
 */

export { TerminalReporter } from '../integrations/TerminalReporter';
export type {
  TerminalReporterOptions,
  ConsoleLike,
} from '../integrations/TerminalReporter';

export { ExpoDevToolsPlugin } from '../integrations/ExpoDevToolsPlugin';
export type {
  ExpoDevToolsPluginDeps,
  DevToolsPluginClient,
  DevToolsPluginClientFactory,
} from '../integrations/ExpoDevToolsPlugin';

export { BugReporter } from '../integrations/BugReporter';
export type {
  BugReport,
  BugReportTrigger,
  BugReporterDeps,
  ReplayFrameSnapshot,
} from '../integrations/BugReporter';

export { DashboardBridge } from '../integrations/DashboardBridge';
export type {
  DashboardBridgeOptions,
  WebSocketCtor,
  WebSocketLike,
} from '../integrations/DashboardBridge';
