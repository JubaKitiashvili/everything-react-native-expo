// Task 117.6 — AI Fix PR orchestrator.
//
// One method, `propose(fingerprint)`. Fetches context from the
// dashboard, asks Claude for a candidate fix, gates the candidate on
// effective confidence, opens a PR via the GitHub adapter, and bumps
// the proposal counter on the confidence store.
//
// Composition over inheritance: every collaborator (dashboard
// client, LLM, GitHub, confidence store) is injected. That keeps
// tests cheap and makes it easy to swap implementations later
// (e.g., a different LLM provider, or an in-process mock for
// continuous integration smoke tests).

import { randomUUID } from 'node:crypto';
import { buildFixContext, type FixContext } from './context.js';
import type { LLM, FixCandidate } from './llm.js';
import type { GitHubAdapter, OpenPRResult } from './github.js';
import type { ConfidenceStore } from './confidence.js';
import {
  validateFileEdits,
  type ValidatePathsOptions,
  type ValidationFailure,
} from './validate.js';
import type {
  AiActionRecord,
  DashboardClient,
} from '@erne/monitor-mcp/client';

export interface AIFixPROptions {
  dashboardClient: DashboardClient;
  llm: LLM;
  github: GitHubAdapter;
  confidence: ConfidenceStore;
  /**
   * Public dashboard URL (e.g. `https://monitor.example.com`). Used in
   * the PR body so reviewers can click straight into the crash group.
   */
  dashboardUrl: string;
  /**
   * Hard confidence floor in [0,100]. Candidates with effective
   * confidence below this never become PRs. Default 50 — i.e. the
   * historical-success-weighted score must equal or beat 50 before we
   * spend a reviewer's attention.
   */
  minConfidence?: number;
  /**
   * Maximum file edits per PR. A 12-file edit is a smell; the
   * orchestrator refuses anything over this threshold so a confused
   * model can't open a sweeping rewrite PR. Default 5.
   */
  maxFiles?: number;
  /** Clock injection for branch-name uniqueness in tests. */
  now?: () => number;
  /**
   * Labels to add to opened PRs. Default
   * `['erne:auto-fix', 'erne:needs-review']`.
   */
  labels?: string[];
  /**
   * Path / size validation tuning forwarded to {@link validateFileEdits}.
   * Repository-specific denylist patterns plug in here.
   */
  validation?: ValidatePathsOptions;
  /**
   * Audit-fix follow-up: observability hook for failed audit writes.
   * The agent treats audit emission as best-effort — primary work
   * (opening the PR) finishes regardless. Without this hook
   * operators see "no audit row" and can't tell whether the action
   * never ran or whether the audit endpoint just returned 5xx. The
   * default still swallows; pass a logger to surface failures to
   * Sentry / Slack / stdout.
   */
  onAuditError?: (err: Error, record: AiActionRecord) => void;
}

export type ProposeResult =
  | {
      status: 'proposed';
      pr: OpenPRResult;
      candidate: FixCandidate;
      effectiveConfidence: number;
    }
  | SkipResult;

export type SkipReason =
  | 'context-not-found'
  | 'llm-abstain'
  | 'no-files'
  | 'too-many-files'
  | 'confidence-too-low'
  | 'unsupported-mode'
  | 'invalid-paths';

export interface SkipResult {
  status: 'skipped';
  reason: SkipReason;
  detail?: string;
  candidate?: FixCandidate;
  effectiveConfidence?: number;
  /**
   * Populated when `reason === 'invalid-paths'`: the structured list
   * of failures from `validateFileEdits`. Lets operators see exactly
   * which path was rejected and why.
   */
  validationFailures?: ValidationFailure[];
}

const DEFAULT_LABELS = ['erne:auto-fix', 'erne:needs-review'];
const DEFAULT_MIN_CONFIDENCE = 50;
const DEFAULT_MAX_FILES = 5;

export class AIFixPR {
  private readonly opts: AIFixPROptions;
  private readonly minConfidence: number;
  private readonly maxFiles: number;
  private readonly labels: string[];
  private readonly now: () => number;
  private readonly validation: ValidatePathsOptions;

  constructor(opts: AIFixPROptions) {
    this.opts = opts;
    this.minConfidence = opts.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
    this.maxFiles = opts.maxFiles ?? DEFAULT_MAX_FILES;
    this.labels = opts.labels ?? DEFAULT_LABELS;
    this.now = opts.now ?? Date.now;
    this.validation = opts.validation ?? {};
  }

  /** Owner of the target repo — sourced from the GitHub adapter. */
  get repoOwner(): string {
    return this.opts.github.owner;
  }

  /** Name of the target repo — sourced from the GitHub adapter. */
  get repoName(): string {
    return this.opts.github.repo;
  }

  async propose(fingerprint: string): Promise<ProposeResult> {
    const result = await this.proposeInner(fingerprint);
    // Best-effort audit emission. A failed write must NOT change the
    // caller's view of `result` — the agent's primary job is to open
    // PRs; audit is observational. Failures route through
    // `onAuditError` (when configured) so operators can surface them
    // to Sentry / their log aggregator.
    await this.emitAudit(fingerprint, result);
    return result;
  }

  private async proposeInner(fingerprint: string): Promise<ProposeResult> {
    const context = await buildFixContext(this.opts.dashboardClient, fingerprint);
    if (!context) {
      return { status: 'skipped', reason: 'context-not-found', detail: fingerprint };
    }

    const candidate = await this.opts.llm.generateFix(context);

    if (candidate.abstain) {
      return {
        status: 'skipped',
        reason: 'llm-abstain',
        ...(candidate.abstainReason ? { detail: candidate.abstainReason } : {}),
        candidate,
      };
    }

    if (candidate.files.length === 0) {
      return { status: 'skipped', reason: 'no-files', candidate };
    }
    if (candidate.files.length > this.maxFiles) {
      return {
        status: 'skipped',
        reason: 'too-many-files',
        detail: `${candidate.files.length} > ${this.maxFiles}`,
        candidate,
      };
    }
    const unsupported = candidate.files.find((f) => f.mode !== 'replace');
    if (unsupported) {
      return {
        status: 'skipped',
        reason: 'unsupported-mode',
        detail: `mode=${unsupported.mode}`,
        candidate,
      };
    }

    // Path + size validation. Audit follow-up — without this, the LLM
    // could land a workflow rewrite, dotfile overwrite, or oversize
    // payload before any human reviewed the diff.
    const failures = validateFileEdits(candidate.files, this.validation);
    if (failures.length > 0) {
      return {
        status: 'skipped',
        reason: 'invalid-paths',
        detail: failures
          .slice(0, 3)
          .map((f) => `${f.code}:${f.path}${f.detail ? ` (${f.detail})` : ''}`)
          .join('; '),
        candidate,
        validationFailures: failures,
      };
    }

    await this.opts.confidence.hydrate();
    const effective = this.opts.confidence.effectiveConfidence(
      candidate.classification,
      candidate.confidence,
    );
    if (effective < this.minConfidence) {
      return {
        status: 'skipped',
        reason: 'confidence-too-low',
        detail: `${effective} < ${this.minConfidence}`,
        candidate,
        effectiveConfidence: effective,
      };
    }

    const branch = this.makeBranchName(fingerprint);
    const body = this.renderPRBody(candidate, context, effective);
    const pr = await this.opts.github.openPR({
      branch,
      commitMessage: `${candidate.title}\n\nFingerprint: ${fingerprint}`,
      title: candidate.title,
      body,
      files: candidate.files,
      labels: this.labels,
    });

    await this.opts.confidence.recordProposal(candidate.classification);

    return {
      status: 'proposed',
      pr,
      candidate,
      effectiveConfidence: effective,
    };
  }

  /**
   * Branch name shape: `erne/fix/<short-fp>-<ts>`. Short fingerprint is
   * the first 8 chars of the crash group fingerprint — long enough to
   * avoid practical collisions, short enough to read.
   */
  private makeBranchName(fingerprint: string): string {
    const shortFp = fingerprint.slice(0, 8).replace(/[^a-zA-Z0-9_-]/g, '-');
    const ts = this.now();
    return `erne/fix/${shortFp}-${ts}`;
  }

  /**
   * Render the PR body. Includes a backlink to the dashboard's crash
   * detail page so reviewers can click through to the full timeline.
   */
  private renderPRBody(
    candidate: FixCandidate,
    context: FixContext,
    effectiveConfidence: number,
  ): string {
    const dash = this.opts.dashboardUrl.replace(/\/+$/, '');
    return [
      candidate.summary,
      '',
      '---',
      '',
      `**Crash group:** \`${context.fingerprint}\``,
      `**Events affected:** ${context.eventCount} across ${context.sessionCount} sessions`,
      `**Self-reported confidence:** ${candidate.confidence}/100`,
      `**Effective confidence (× class trust):** ${effectiveConfidence}/100`,
      `**Classification:** \`${candidate.classification}\``,
      '',
      `[Open in dashboard →](${dash}/crashes/${encodeURIComponent(context.fingerprint)})`,
      '',
      '<sub>Generated by `@erne/monitor-ai-fix-pr` (Task 117.6). Confidence decays automatically based on your merge / close decisions.</sub>',
    ].join('\n');
  }

  /**
   * Task 117.81 — emit one audit row per propose() invocation. Best-
   * effort: every error is swallowed by the caller so the audit
   * trail can never block the agent's primary job. Records carry
   * enough metadata to reconstruct *why* a candidate was skipped /
   * proposed without re-running the agent.
   */
  private async emitAudit(
    fingerprint: string,
    result: ProposeResult,
  ): Promise<void> {
    const id = randomUUID();
    const baseRecord: AiActionRecord = {
      id,
      timestamp: this.now(),
      agent: 'ai-fix-pr',
      action: 'propose-fix',
      fingerprint,
      outcome: result.status === 'proposed' ? 'proposed' : `skipped:${result.reason}`,
    };
    if (result.status === 'proposed') {
      baseRecord.confidence = result.candidate.confidence;
      baseRecord.effectiveConfidence = result.effectiveConfidence;
      baseRecord.classification = result.candidate.classification;
      baseRecord.prUrl = result.pr.url;
      baseRecord.filesConsidered = result.candidate.files.map((f) => f.path);
      baseRecord.toolsCalled = ['list_crash_groups', 'list_events', 'open_pr'];
    } else {
      if (result.candidate) {
        baseRecord.confidence = result.candidate.confidence;
        baseRecord.classification = result.candidate.classification;
        baseRecord.filesConsidered = result.candidate.files.map((f) => f.path);
      }
      if (typeof result.effectiveConfidence === 'number') {
        baseRecord.effectiveConfidence = result.effectiveConfidence;
      }
      const metadata: Record<string, unknown> = { reason: result.reason };
      if (result.detail) metadata.detail = result.detail;
      if (result.validationFailures) {
        metadata.validationFailures = result.validationFailures;
      }
      baseRecord.metadata = metadata;
      baseRecord.toolsCalled = ['list_crash_groups', 'list_events'];
    }
    try {
      await this.opts.dashboardClient.recordAiAction(baseRecord);
    } catch (err) {
      this.opts.onAuditError?.(
        err instanceof Error ? err : new Error(String(err)),
        baseRecord,
      );
    }
  }
}
