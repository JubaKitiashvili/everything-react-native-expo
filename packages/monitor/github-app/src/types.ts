// Task 117.75 — GitHub App handler types.
//
// All side effects flow through two INJECTED client interfaces so that
// every handler is a pure function of (payload, deps). Tests pass mocks
// (vi.fn()) for both; production code wires real implementations that
// talk to the GitHub REST API and the @erne/monitor dashboard API.
//
// We deliberately avoid an octokit dependency. The GitHubClient surface
// is tiny (two methods) and easy to implement against `fetch`; webhook
// signature verification uses node:crypto directly (see verify.ts).

/** Commit status state, matching the GitHub Statuses API. */
export type CommitStatusState = 'success' | 'failure' | 'pending' | 'error';

/** Arguments for creating a commit status on a SHA. */
export interface CreateCommitStatusArgs {
  owner: string;
  repo: string;
  /** Head commit SHA the status is attached to. */
  sha: string;
  state: CommitStatusState;
  /** Short human-readable summary shown in the PR checks list. */
  description: string;
  /** Status context label, e.g. 'erne/crash-regression'. */
  context: string;
}

/** Arguments for commenting on an issue (or PR — PRs are issues to GitHub). */
export interface CreateIssueCommentArgs {
  owner: string;
  repo: string;
  issueNumber: number;
  body: string;
}

/**
 * The slice of the GitHub REST API this App needs. Implemented for real
 * with an installation token; mocked in tests.
 */
export interface GitHubClient {
  createCommitStatus(args: CreateCommitStatusArgs): Promise<void>;
  createIssueComment(args: CreateIssueCommentArgs): Promise<void>;
}

/** A deploy marker recorded against a version + commit. */
export interface DeployMarkerArgs {
  /** App version string (e.g. '1.4.0'), if resolvable from the event. */
  version: string | null;
  /** Deployed commit SHA. */
  sha: string;
  /** Target environment (e.g. 'production', 'staging'). */
  environment: string;
  /** Epoch milliseconds the deploy happened/was recorded. */
  at: number;
}

/** Arguments for linking a GitHub issue to a crash fingerprint. */
export interface LinkIssueToCrashArgs {
  issueNumber: number;
  fingerprint: string;
}

/**
 * The slice of the @erne/monitor dashboard API this App needs.
 * Implemented for real against the dashboard's HTTP API; mocked in tests.
 */
export interface MonitorClient {
  /** Record a deploy marker so the dashboard can annotate timelines. */
  recordDeployMarker(args: DeployMarkerArgs): Promise<void>;
  /**
   * Crash-free session rate for a version, as a fraction in [0, 1].
   * Returns null when there is no data for that version yet.
   */
  getCrashFreeRate(args: { version: string }): Promise<number | null>;
  /** Link an issue to a crash group identified by fingerprint. */
  linkIssueToCrash(args: LinkIssueToCrashArgs): Promise<void>;
}

/** Dependency bundle passed to every handler. */
export interface HandlerDeps {
  github: GitHubClient;
  monitor: MonitorClient;
}

/** Decision returned by the crash-regression check handler. */
export interface CrashRegressionDecision {
  state: CommitStatusState;
  description: string;
  context: string;
  /** Head version that was evaluated, if resolvable. */
  headVersion: string | null;
  /** Base version compared against, if resolvable. */
  baseVersion: string | null;
  /** Head crash-free rate fraction, or null when unavailable. */
  headRate: number | null;
  /** Base crash-free rate fraction, or null when unavailable. */
  baseRate: number | null;
}

/** Result of routing a webhook through {@link handleWebhook}. */
export interface WebhookResult {
  ok: boolean;
  /** HTTP status the caller should respond with. */
  status: number;
  /** True when the event type was recognised but intentionally not acted on. */
  ignored?: boolean;
  /** The event name that was routed. */
  event?: string;
  /** Optional structured handler output (shape depends on the handler). */
  result?: unknown;
  /** Set when ok is false. */
  error?: string;
}
