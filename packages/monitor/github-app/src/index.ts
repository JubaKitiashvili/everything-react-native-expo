// Task 117.75 — public barrel for @erne/monitor-github-app.

export { verifySignature } from './verify.js';

export {
  CRASH_REGRESSION_CONTEXT,
  DEFAULT_REGRESSION_THRESHOLD,
  extractFingerprint,
  handleCrashRegressionCheck,
  handleDeployment,
  handleIssueCrashLink,
} from './handlers.js';
export type {
  DeploymentHandlerResult,
  IssueCrashLinkResult,
} from './handlers.js';

export { handleWebhook } from './webhook.js';
export type { HandleWebhookArgs } from './webhook.js';

export type {
  CommitStatusState,
  CreateCommitStatusArgs,
  CreateIssueCommentArgs,
  CrashRegressionDecision,
  DeployMarkerArgs,
  GitHubClient,
  HandlerDeps,
  LinkIssueToCrashArgs,
  MonitorClient,
  WebhookResult,
} from './types.js';
