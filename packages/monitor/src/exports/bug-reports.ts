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
