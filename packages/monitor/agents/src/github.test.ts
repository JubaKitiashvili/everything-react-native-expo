// Task 117.6 audit follow-up — GitHub adapter tests.
//
// Octokit is heavy to spin up in tests — we feed in a hand-rolled fake
// that exposes only the methods the adapter touches. The fake records
// every call so we can assert the Tree+Commit+Refs+Pulls choreography
// happens in the right order with the right payloads.

import { describe, expect, test, vi } from 'vitest';
import { GitHubAdapter } from './github.js';
import type { Octokit } from '@octokit/rest';

interface FakeCall {
  endpoint: string;
  args: Record<string, unknown>;
}

function makeFakeOctokit(): { octokit: Octokit; calls: FakeCall[] } {
  const calls: FakeCall[] = [];
  const ok = (endpoint: string, data: unknown) =>
    vi.fn(async (args: Record<string, unknown>) => {
      calls.push({ endpoint, args });
      return { data };
    });
  const fake = {
    git: {
      getRef: ok('git.getRef', { object: { sha: 'base-sha' } }),
      getCommit: ok('git.getCommit', { tree: { sha: 'base-tree' } }),
      createBlob: vi.fn(async (args: Record<string, unknown>) => {
        calls.push({ endpoint: 'git.createBlob', args });
        return { data: { sha: `blob-${args.content}`.slice(0, 10) } };
      }),
      createTree: ok('git.createTree', { sha: 'new-tree' }),
      createCommit: ok('git.createCommit', { sha: 'new-commit' }),
      createRef: ok('git.createRef', { ref: 'refs/heads/branch' }),
    },
    pulls: {
      create: ok('pulls.create', {
        number: 7,
        html_url: 'https://github.com/o/r/pull/7',
      }),
    },
    issues: {
      addLabels: ok('issues.addLabels', []),
    },
  } as unknown as Octokit;
  return { octokit: fake, calls };
}

describe('GitHubAdapter.openPR', () => {
  test('walks Tree+Commit+Refs+Pulls in order with correct payloads', async () => {
    const { octokit, calls } = makeFakeOctokit();
    const adapter = new GitHubAdapter({
      owner: 'acme',
      repo: 'mobile',
      token: 'unused',
      defaultBranch: 'main',
      octokit,
    });
    const pr = await adapter.openPR({
      branch: 'erne/fix/abc-123',
      commitMessage: 'Fix it',
      title: 'Fix it',
      body: 'PR body',
      files: [
        { path: 'src/x.ts', mode: 'replace', content: 'a' },
        { path: 'src/y.ts', mode: 'replace', content: 'b' },
      ],
    });
    expect(pr).toEqual({
      url: 'https://github.com/o/r/pull/7',
      number: 7,
      sha: 'new-commit',
    });
    const order = calls.map((c) => c.endpoint);
    expect(order).toEqual([
      'git.getRef',
      'git.getCommit',
      'git.createBlob',
      'git.createBlob',
      'git.createTree',
      'git.createCommit',
      'git.createRef',
      'pulls.create',
    ]);

    const treeCall = calls.find((c) => c.endpoint === 'git.createTree');
    expect(treeCall?.args.base_tree).toBe('base-tree');
    expect((treeCall?.args.tree as Array<{ path: string }>).map((t) => t.path)).toEqual([
      'src/x.ts',
      'src/y.ts',
    ]);

    const commitCall = calls.find((c) => c.endpoint === 'git.createCommit');
    expect(commitCall?.args.tree).toBe('new-tree');
    expect(commitCall?.args.parents).toEqual(['base-sha']);

    const refCall = calls.find((c) => c.endpoint === 'git.createRef');
    expect(refCall?.args.ref).toBe('refs/heads/erne/fix/abc-123');
    expect(refCall?.args.sha).toBe('new-commit');

    const prCall = calls.find((c) => c.endpoint === 'pulls.create');
    expect(prCall?.args.head).toBe('erne/fix/abc-123');
    expect(prCall?.args.base).toBe('main');
  });

  test('rejects patch-mode edits — only replace ships in v1', async () => {
    const { octokit } = makeFakeOctokit();
    const adapter = new GitHubAdapter({ owner: 'a', repo: 'b', token: 't', octokit });
    await expect(
      adapter.openPR({
        branch: 'b',
        commitMessage: '',
        title: 't',
        body: '',
        files: [{ path: 'f.ts', mode: 'patch', content: '@@ -1 +1 @@' }],
      }),
    ).rejects.toThrow(/replace/);
  });

  test('rejects empty file list', async () => {
    const { octokit } = makeFakeOctokit();
    const adapter = new GitHubAdapter({ owner: 'a', repo: 'b', token: 't', octokit });
    await expect(
      adapter.openPR({
        branch: 'b',
        commitMessage: '',
        title: '',
        body: '',
        files: [],
      }),
    ).rejects.toThrow(/zero file edits/);
  });

  test('label add failure does not block the PR', async () => {
    const { octokit } = makeFakeOctokit();
    // Make addLabels reject — the openPR contract is "best effort".
    (octokit.issues.addLabels as unknown as { mockImplementation: (fn: () => unknown) => void })
      .mockImplementation(async () => {
        throw new Error('forbidden');
      });
    const adapter = new GitHubAdapter({ owner: 'a', repo: 'b', token: 't', octokit });
    const pr = await adapter.openPR({
      branch: 'b',
      commitMessage: '',
      title: 't',
      body: '',
      files: [{ path: 'f.ts', mode: 'replace', content: 'x' }],
      labels: ['erne:auto-fix'],
    });
    expect(pr.number).toBe(7);
  });

  test('exposes owner / repo / defaultBranch publicly for orchestrators', () => {
    const { octokit } = makeFakeOctokit();
    const adapter = new GitHubAdapter({
      owner: 'acme',
      repo: 'mobile',
      token: 't',
      defaultBranch: 'develop',
      octokit,
    });
    expect(adapter.owner).toBe('acme');
    expect(adapter.repo).toBe('mobile');
    expect(adapter.defaultBranch).toBe('develop');
  });
});
