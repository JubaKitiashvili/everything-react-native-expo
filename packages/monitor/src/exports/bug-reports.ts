/**
 * `@erne/monitor/bug-reports` — the SDK side of bidirectional bug reports
 * (Task 117.20). Opt-in production integration: create reports, post the app
 * user's replies, and poll operator replies for in-app display. Kept on its
 * own subpath so apps that don't use it pay no bundle cost.
 */

export { BugReportChannel } from '../integrations/BugReportChannel';
export type {
  BugReportChannelOptions,
  OperatorReply,
  SubmitReportInput,
} from '../integrations/BugReportChannel';

// Task 117.21 — shake-to-report: feed an accelerometer in, get shake events
// out, wire to BugReporter.onShakeDetected.
export { ShakeDetector } from '../integrations/ShakeDetector';
export type {
  AccelerometerSample,
  AccelerometerSource,
  AccelerometerSubscription,
  ShakeDetectorOptions,
} from '../integrations/ShakeDetector';
