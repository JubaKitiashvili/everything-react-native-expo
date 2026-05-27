import { describe, expect, it } from 'vitest';
import {
  CRASH_REGRESSION_CONTEXT,
  extractFingerprint,
  handleCrashRegressionCheck,
  handleDeployment,
  handleIssueCrashLink,
} from './handlers.js';
import { makeMockDeps } from './test-helpers.js';

// ---------------------------------------------------------------------------
// handleDeployment
// ---------------------------------------------------------------------------

describe('handleDeployment', () => {
  it('records a deploy marker with parsed fields', async () => {
    const deps = makeMockDeps();
    const payload = {
      deployment: {
        sha: 'abc123def456',
        environment: 'production',
        ref: 'v1.4.0',
        payload: { version: '1.4.0' },
      },
      repository: { name: 'app', owner: { login: 'acme' } },
    };

    const result = await handleDeployment(payload, deps, () => 1_700_000_000_000);

    expect(result.recorded).toBe(true);
    expect(deps.monitor.recordDeployMarker).toHaveBeenCalledTimes(1);
    expect(deps.monitor.recordDeployMarker).toHaveBeenCalledWith({
      version: '1.4.0',
      sha: 'abc123def456',
      environment: 'production',
      at: 1_700_000_000_000,
    });
  });

  it('falls back to deployment.ref for version and defaults environment', async () => {
    const deps = makeMockDeps();
    const payload = { deployment: { sha: 'sha-only', ref: 'release-7' } };

    const result = await handleDeployment(payload, deps, () => 5);

    expect(result.recorded).toBe(true);
    expect(deps.monitor.recordDeployMarker).toHaveBeenCalledWith({
      version: 'release-7',
      sha: 'sha-only',
      environment: 'production',
      at: 5,
    });
  });

  it('does nothing when there is no sha', async () => {
    const deps = makeMockDeps();
    const result = await handleDeployment({ deployment: { environment: 'staging' } }, deps);
    expect(result.recorded).toBe(false);
    expect(deps.monitor.recordDeployMarker).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// handleCrashRegressionCheck
// ---------------------------------------------------------------------------

function prPayload(headRef: string, baseRef: string, headSha = 'head-sha') {
  return {
    action: 'synchronize',
    repository: { name: 'app', owner: { login: 'acme' } },
    pull_request: {
      head: { ref: headRef, sha: headSha },
      base: { ref: baseRef },
    },
  };
}

describe('handleCrashRegressionCheck', () => {
  it('fails when crash-free rate drops past the threshold', async () => {
    const rates: Record<string, number> = { 'feature-x': 0.95, main: 0.99 };
    const deps = makeMockDeps({ crashFreeRate: (v) => rates[v] ?? null });

    const decision = await handleCrashRegressionCheck(prPayload('feature-x', 'main'), deps);

    expect(decision.state).toBe('failure');
    expect(decision.context).toBe(CRASH_REGRESSION_CONTEXT);
    expect(decision.description).toContain('dropped');
    expect(decision.description).toContain('99.00%');
    expect(decision.description).toContain('95.00%');

    expect(deps.github.createCommitStatus).toHaveBeenCalledTimes(1);
    expect(deps.github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'acme',
        repo: 'app',
        sha: 'head-sha',
        state: 'failure',
        context: CRASH_REGRESSION_CONTEXT,
      }),
    );
  });

  it('succeeds when the rate is stable', async () => {
    const rates: Record<string, number> = { 'feature-y': 0.992, main: 0.99 };
    const deps = makeMockDeps({ crashFreeRate: (v) => rates[v] ?? null });

    const decision = await handleCrashRegressionCheck(prPayload('feature-y', 'main'), deps);

    expect(decision.state).toBe('success');
    expect(decision.description).toContain('stable');
    expect(deps.github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'success', context: CRASH_REGRESSION_CONTEXT }),
    );
  });

  it('does not fail for a drop within the threshold', async () => {
    // 0.5pt drop, default threshold is 1pt -> success
    const rates: Record<string, number> = { 'feature-z': 0.985, main: 0.99 };
    const deps = makeMockDeps({ crashFreeRate: (v) => rates[v] ?? null });

    const decision = await handleCrashRegressionCheck(prPayload('feature-z', 'main'), deps);
    expect(decision.state).toBe('success');
  });

  it('is pending when head has no crash-free data', async () => {
    const deps = makeMockDeps({ crashFreeRate: () => null });

    const decision = await handleCrashRegressionCheck(prPayload('brand-new', 'main'), deps);

    expect(decision.state).toBe('pending');
    expect(decision.description).toContain('No crash-free data');
    expect(deps.github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ state: 'pending', context: CRASH_REGRESSION_CONTEXT }),
    );
  });

  it('reports informational success when only head data exists (no baseline)', async () => {
    const rates: Record<string, number> = { 'feature-a': 0.97 };
    const deps = makeMockDeps({ crashFreeRate: (v) => rates[v] ?? null });

    const decision = await handleCrashRegressionCheck(prPayload('feature-a', 'main'), deps);

    expect(decision.state).toBe('success');
    expect(decision.description).toContain('no baseline');
  });

  it('handles a check_suite event shape', async () => {
    const rates: Record<string, number> = { 'feature-cs': 0.90, main: 0.99 };
    const deps = makeMockDeps({ crashFreeRate: (v) => rates[v] ?? null });
    const payload = {
      repository: { name: 'app', owner: { login: 'acme' } },
      check_suite: {
        head_sha: 'cs-sha',
        head_branch: 'feature-cs',
        pull_requests: [{ base: { ref: 'main' } }],
      },
    };

    const decision = await handleCrashRegressionCheck(payload, deps);

    expect(decision.state).toBe('failure');
    expect(deps.github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ sha: 'cs-sha', context: CRASH_REGRESSION_CONTEXT }),
    );
  });

  it('is pending and posts no status when head version is unresolvable', async () => {
    const deps = makeMockDeps();
    const decision = await handleCrashRegressionCheck(
      { repository: { name: 'app', owner: { login: 'acme' } } },
      deps,
    );
    expect(decision.state).toBe('pending');
    // no head sha -> cannot post a commit status
    expect(deps.github.createCommitStatus).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// extractFingerprint + handleIssueCrashLink
// ---------------------------------------------------------------------------

describe('extractFingerprint', () => {
  it('extracts from an ERNE-Crash: line', () => {
    const body = 'Steps to reproduce...\nERNE-Crash: a1b2c3d4e5\nmore text';
    expect(extractFingerprint(body)).toBe('a1b2c3d4e5');
  });

  it('extracts from an erne.dev/crashes/<fp> URL', () => {
    const body = 'See https://erne.dev/crashes/deadbeef99 for details';
    expect(extractFingerprint(body)).toBe('deadbeef99');
  });

  it('is case-insensitive on the marker label', () => {
    expect(extractFingerprint('erne-crash: lowfp123')).toBe('lowfp123');
  });

  it('returns null when no fingerprint present', () => {
    expect(extractFingerprint('just a normal issue')).toBeNull();
    expect(extractFingerprint('')).toBeNull();
    expect(extractFingerprint(undefined)).toBeNull();
    expect(extractFingerprint(123)).toBeNull();
  });
});

describe('handleIssueCrashLink', () => {
  function issuePayload(action: string, body: string | null, number = 7) {
    return {
      action,
      repository: { name: 'app', owner: { login: 'acme' } },
      issue: { number, body },
    };
  }

  it('links and comments when a marker-line fingerprint is found', async () => {
    const deps = makeMockDeps();
    const result = await handleIssueCrashLink(
      issuePayload('opened', 'crash report\nERNE-Crash: fp-777'),
      deps,
    );

    expect(result.linked).toBe(true);
    expect(result.fingerprint).toBe('fp-777');
    expect(deps.monitor.linkIssueToCrash).toHaveBeenCalledWith({
      issueNumber: 7,
      fingerprint: 'fp-777',
    });
    expect(deps.github.createIssueComment).toHaveBeenCalledTimes(1);
    expect(deps.github.createIssueComment).toHaveBeenCalledWith(
      expect.objectContaining({ owner: 'acme', repo: 'app', issueNumber: 7 }),
    );
    const commentArgs = deps.github.createIssueComment.mock.calls[0][0] as { body: string };
    expect(commentArgs.body).toContain('fp-777');
  });

  it('links from a URL fingerprint on the edited action', async () => {
    const deps = makeMockDeps();
    const result = await handleIssueCrashLink(
      issuePayload('edited', 'now linking https://erne.dev/crashes/url-fp-1', 12),
      deps,
    );
    expect(result.linked).toBe(true);
    expect(result.fingerprint).toBe('url-fp-1');
    expect(deps.monitor.linkIssueToCrash).toHaveBeenCalledWith({
      issueNumber: 12,
      fingerprint: 'url-fp-1',
    });
  });

  it('is a no-op when the body has no fingerprint', async () => {
    const deps = makeMockDeps();
    const result = await handleIssueCrashLink(issuePayload('opened', 'unrelated issue'), deps);
    expect(result.linked).toBe(false);
    expect(deps.monitor.linkIssueToCrash).not.toHaveBeenCalled();
    expect(deps.github.createIssueComment).not.toHaveBeenCalled();
  });

  it('ignores actions other than opened/edited', async () => {
    const deps = makeMockDeps();
    const result = await handleIssueCrashLink(
      issuePayload('closed', 'ERNE-Crash: fp-ignored'),
      deps,
    );
    expect(result.linked).toBe(false);
    expect(deps.monitor.linkIssueToCrash).not.toHaveBeenCalled();
  });
});
