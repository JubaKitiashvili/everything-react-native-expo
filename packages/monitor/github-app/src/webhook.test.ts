import { describe, expect, it } from 'vitest';
import { handleWebhook } from './webhook.js';
import { CRASH_REGRESSION_CONTEXT } from './handlers.js';
import { makeMockDeps, signBody } from './test-helpers.js';

const SECRET = 'wh-secret';

function deliver(event: string, payloadObj: unknown, deps = makeMockDeps()) {
  const rawBody = JSON.stringify(payloadObj);
  const signatureHeader = signBody(rawBody, SECRET);
  return handleWebhook({
    event,
    payload: payloadObj,
    signatureHeader,
    rawBody,
    secret: SECRET,
    deps,
  });
}

describe('handleWebhook', () => {
  it('returns 401 on a bad signature and does not run any handler', async () => {
    const deps = makeMockDeps();
    const payloadObj = { deployment: { sha: 'x', environment: 'prod' } };
    const rawBody = JSON.stringify(payloadObj);

    const res = await handleWebhook({
      event: 'deployment',
      payload: payloadObj,
      signatureHeader: 'sha256=' + '0'.repeat(64),
      rawBody,
      secret: SECRET,
      deps,
    });

    expect(res.ok).toBe(false);
    expect(res.status).toBe(401);
    expect(deps.monitor.recordDeployMarker).not.toHaveBeenCalled();
  });

  it('routes deployment -> deploy marker', async () => {
    const deps = makeMockDeps();
    const res = await deliver(
      'deployment',
      { deployment: { sha: 'sha1', environment: 'prod', payload: { version: '2.0.0' } } },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(res.event).toBe('deployment');
    expect(deps.monitor.recordDeployMarker).toHaveBeenCalledTimes(1);
  });

  it('routes pull_request -> crash regression check', async () => {
    const deps = makeMockDeps({ crashFreeRate: (v) => (v === 'main' ? 0.99 : 0.9) });
    const res = await deliver(
      'pull_request',
      {
        repository: { name: 'app', owner: { login: 'acme' } },
        pull_request: { head: { ref: 'feat', sha: 's1' }, base: { ref: 'main' } },
      },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(deps.github.createCommitStatus).toHaveBeenCalledWith(
      expect.objectContaining({ context: CRASH_REGRESSION_CONTEXT }),
    );
  });

  it('routes check_suite -> crash regression check', async () => {
    const deps = makeMockDeps({ crashFreeRate: () => 0.99 });
    const res = await deliver(
      'check_suite',
      {
        repository: { name: 'app', owner: { login: 'acme' } },
        check_suite: { head_sha: 'cs1', head_branch: 'feat', pull_requests: [] },
      },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(deps.github.createCommitStatus).toHaveBeenCalledTimes(1);
  });

  it('routes issues -> issue crash link', async () => {
    const deps = makeMockDeps();
    const res = await deliver(
      'issues',
      {
        action: 'opened',
        repository: { name: 'app', owner: { login: 'acme' } },
        issue: { number: 3, body: 'ERNE-Crash: fp-3' },
      },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(deps.monitor.linkIssueToCrash).toHaveBeenCalledWith({
      issueNumber: 3,
      fingerprint: 'fp-3',
    });
  });

  it('ignores unknown events', async () => {
    const deps = makeMockDeps();
    const res = await deliver('star', { action: 'created' }, deps);
    expect(res.ok).toBe(true);
    expect(res.ignored).toBe(true);
  });

  it('ignores the ping event', async () => {
    const res = await deliver('ping', { zen: 'Keep it simple.' });
    expect(res.ok).toBe(true);
    expect(res.ignored).toBe(true);
  });

  it('never throws on a malformed payload (handler tolerates it)', async () => {
    const deps = makeMockDeps();
    const res = await deliver('deployment', { deployment: 'not-an-object' }, deps);
    // malformed deployment -> nothing recorded, but still a clean 200
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
    expect(deps.monitor.recordDeployMarker).not.toHaveBeenCalled();
  });

  it('never throws on a null/empty payload', async () => {
    const res = await deliver('issues', null);
    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);
  });

  it('maps a handler throw to a 500 without throwing', async () => {
    const deps = makeMockDeps();
    deps.monitor.recordDeployMarker.mockRejectedValueOnce(new Error('db down'));
    const res = await deliver(
      'deployment',
      { deployment: { sha: 'sha1', environment: 'prod' } },
      deps,
    );
    expect(res.ok).toBe(false);
    expect(res.status).toBe(500);
    expect(res.error).toBe('db down');
  });
});
