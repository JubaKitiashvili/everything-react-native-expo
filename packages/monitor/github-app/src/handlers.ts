// Task 117.75 — pure GitHub App event handlers.
//
// Each handler takes the parsed webhook payload plus injected deps and
// performs exactly one of the App's three features:
//
//   1. handleDeployment           — record a deploy marker on `deployment`
//   2. handleCrashRegressionCheck — post a crash-regression commit status
//                                    on `check_suite` / `pull_request`
//   3. handleIssueCrashLink       — link an issue to a crash fingerprint
//                                    on `issues` (opened/edited)
//
// Handlers are deliberately tolerant of partial payloads: GitHub's
// shapes are large and we only read a handful of fields. Missing data
// is treated as "nothing to do" rather than an error.

import type {
  CrashRegressionDecision,
  DeployMarkerArgs,
  HandlerDeps,
} from './types.js';

export const CRASH_REGRESSION_CONTEXT = 'erne/crash-regression';

/**
 * Minimum absolute drop in crash-free rate (as a fraction) before we mark
 * the check as failing. 0.01 = a 1 percentage-point drop (e.g. 99.5% -> 98.4%).
 * Kept conservative so normal noise doesn't block PRs.
 */
export const DEFAULT_REGRESSION_THRESHOLD = 0.01;

// ---------------------------------------------------------------------------
// Small payload helpers (no `any`; everything goes through unknown + guards).
// ---------------------------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** Format a [0,1] fraction as a percentage string, e.g. 0.9842 -> "98.42%". */
function pct(rate: number): string {
  return `${(rate * 100).toFixed(2)}%`;
}

// ---------------------------------------------------------------------------
// 1. Deployment marker
// ---------------------------------------------------------------------------

export interface DeploymentHandlerResult {
  recorded: boolean;
  marker?: DeployMarkerArgs;
}

/**
 * On a GitHub `deployment` event, record a deploy marker.
 *
 * GitHub payload shape (relevant fields):
 *   payload.deployment.sha
 *   payload.deployment.environment
 *   payload.deployment.ref               (often the version tag/branch)
 *   payload.deployment.payload.version   (optional app-provided version)
 *
 * Version resolution order: deployment.payload.version -> deployment.ref.
 * A deployment with no SHA is unactionable and returns { recorded: false }.
 */
export async function handleDeployment(
  payload: unknown,
  deps: HandlerDeps,
  now: () => number = Date.now,
): Promise<DeploymentHandlerResult> {
  const root = asRecord(payload);
  const deployment = asRecord(root.deployment);

  const sha = asString(deployment.sha);
  if (!sha) {
    return { recorded: false };
  }

  const environment = asString(deployment.environment) ?? 'production';
  const innerPayload = asRecord(deployment.payload);
  const version = asString(innerPayload.version) ?? asString(deployment.ref);

  const marker: DeployMarkerArgs = {
    version,
    sha,
    environment,
    at: now(),
  };

  await deps.monitor.recordDeployMarker(marker);
  return { recorded: true, marker };
}

// ---------------------------------------------------------------------------
// 2. Crash-regression status check
// ---------------------------------------------------------------------------

interface VersionPair {
  headSha: string | null;
  headVersion: string | null;
  baseVersion: string | null;
}

/**
 * Extract head SHA + head/base versions from either a `pull_request` or a
 * `check_suite` event. Both nest the relevant data slightly differently.
 */
function resolveVersionPair(payload: unknown): VersionPair {
  const root = asRecord(payload);

  // pull_request event
  const pr = asRecord(root.pull_request);
  if (Object.keys(pr).length > 0) {
    const head = asRecord(pr.head);
    const base = asRecord(pr.base);
    return {
      headSha: asString(head.sha),
      // We use the ref (branch/tag) as the version key; the monitor maps
      // refs -> app versions on its side.
      headVersion: asString(head.ref),
      baseVersion: asString(base.ref),
    };
  }

  // check_suite event
  const suite = asRecord(root.check_suite);
  if (Object.keys(suite).length > 0) {
    const headSha = asString(suite.head_sha);
    const headBranch = asString(suite.head_branch);
    // check_suite carries the associated PRs; use the first PR's base ref.
    const prs = Array.isArray(suite.pull_requests) ? suite.pull_requests : [];
    const firstPr = asRecord(prs[0]);
    const base = asRecord(firstPr.base);
    return {
      headSha,
      headVersion: headBranch,
      baseVersion: asString(base.ref),
    };
  }

  return { headSha: null, headVersion: null, baseVersion: null };
}

/**
 * On `pull_request` / `check_suite`, compare the head version's crash-free
 * rate against the base version's and post a commit status under the
 * `erne/crash-regression` context.
 *
 * Decision table:
 *   - no head SHA / no head version              -> 'pending' (cannot evaluate)
 *   - head or base rate unavailable (null)       -> 'pending' (no data yet)
 *   - headRate < baseRate - threshold            -> 'failure'
 *   - otherwise                                  -> 'success'
 *
 * Always posts a status when a head SHA is known, and returns the decision.
 */
export async function handleCrashRegressionCheck(
  payload: unknown,
  deps: HandlerDeps,
  threshold: number = DEFAULT_REGRESSION_THRESHOLD,
): Promise<CrashRegressionDecision> {
  const root = asRecord(payload);
  const repo = asRecord(root.repository);
  const owner = asString(asRecord(repo.owner).login) ?? asString(repo.owner);
  const repoName = asString(repo.name);

  const { headSha, headVersion, baseVersion } = resolveVersionPair(payload);

  const base: Omit<CrashRegressionDecision, 'state' | 'description'> = {
    context: CRASH_REGRESSION_CONTEXT,
    headVersion,
    baseVersion,
    headRate: null,
    baseRate: null,
  };

  // Can't evaluate without a head version to query the monitor with.
  if (!headVersion) {
    const decision: CrashRegressionDecision = {
      ...base,
      state: 'pending',
      description: 'Waiting for head version to evaluate crash-free rate.',
    };
    await maybePostStatus(deps, owner, repoName, headSha, decision);
    return decision;
  }

  const headRate = await deps.monitor.getCrashFreeRate({ version: headVersion });
  // If we have no base version, compare head against itself's availability only.
  const baseRate = baseVersion
    ? await deps.monitor.getCrashFreeRate({ version: baseVersion })
    : null;

  let state: CrashRegressionDecision['state'];
  let description: string;

  if (headRate === null) {
    state = 'pending';
    description = `No crash-free data yet for ${headVersion}.`;
  } else if (baseRate === null) {
    // We have head data but no baseline to compare against — surface the
    // head number as informational success rather than blocking the PR.
    state = 'success';
    description = `Crash-free rate ${pct(headRate)} (no baseline to compare).`;
  } else if (headRate < baseRate - threshold) {
    state = 'failure';
    const dropPts = ((baseRate - headRate) * 100).toFixed(2);
    description = `Crash-free rate dropped ${dropPts}% (${pct(baseRate)} -> ${pct(headRate)}).`;
  } else {
    state = 'success';
    description = `Crash-free rate stable at ${pct(headRate)} (baseline ${pct(baseRate)}).`;
  }

  const decision: CrashRegressionDecision = {
    ...base,
    state,
    description,
    headRate,
    baseRate,
  };

  await maybePostStatus(deps, owner, repoName, headSha, decision);
  return decision;
}

async function maybePostStatus(
  deps: HandlerDeps,
  owner: string | null,
  repo: string | null,
  sha: string | null,
  decision: CrashRegressionDecision,
): Promise<void> {
  if (!owner || !repo || !sha) {
    return;
  }
  await deps.github.createCommitStatus({
    owner,
    repo,
    sha,
    state: decision.state,
    description: decision.description,
    context: decision.context,
  });
}

// ---------------------------------------------------------------------------
// 3. Issue <-> crash linking
// ---------------------------------------------------------------------------

export interface IssueCrashLinkResult {
  linked: boolean;
  fingerprint?: string;
  issueNumber?: number;
}

// `ERNE-Crash: <fingerprint>` line (case-insensitive label).
const MARKER_LINE_RE = /ERNE-Crash:\s*([A-Za-z0-9._:-]+)/i;
// `erne.dev/crashes/<fingerprint>` URL, with or without scheme/subpath.
const MARKER_URL_RE = /erne\.dev\/crashes\/([A-Za-z0-9._:-]+)/i;

/** Extract a crash fingerprint from an issue body, or null if none present. */
export function extractFingerprint(body: unknown): string | null {
  const text = asString(body);
  if (!text) {
    return null;
  }
  const line = MARKER_LINE_RE.exec(text);
  if (line && line[1]) {
    return line[1];
  }
  const url = MARKER_URL_RE.exec(text);
  if (url && url[1]) {
    return url[1];
  }
  return null;
}

/**
 * On an `issues` event (opened/edited), parse a crash fingerprint from the
 * issue body. If found, link it via the monitor and post a confirming
 * comment. No fingerprint -> no-op.
 *
 * Only acts on the `opened` and `edited` actions; other actions (closed,
 * labeled, etc.) are intentionally ignored.
 */
export async function handleIssueCrashLink(
  payload: unknown,
  deps: HandlerDeps,
): Promise<IssueCrashLinkResult> {
  const root = asRecord(payload);
  const action = asString(root.action);
  if (action !== 'opened' && action !== 'edited') {
    return { linked: false };
  }

  const issue = asRecord(root.issue);
  const issueNumber = asNumber(issue.number);
  if (issueNumber === null) {
    return { linked: false };
  }

  const fingerprint = extractFingerprint(issue.body);
  if (!fingerprint) {
    return { linked: false, issueNumber };
  }

  const repo = asRecord(root.repository);
  const owner = asString(asRecord(repo.owner).login) ?? asString(repo.owner);
  const repoName = asString(repo.name);

  await deps.monitor.linkIssueToCrash({ issueNumber, fingerprint });

  if (owner && repoName) {
    await deps.github.createIssueComment({
      owner,
      repo: repoName,
      issueNumber,
      body:
        `Linked this issue to crash group \`${fingerprint}\`. ` +
        `View it in the ERNE dashboard: https://erne.dev/crashes/${fingerprint}`,
    });
  }

  return { linked: true, fingerprint, issueNumber };
}
