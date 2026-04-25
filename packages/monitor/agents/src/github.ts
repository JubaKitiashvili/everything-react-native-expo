// Task 117.6 — GitHub PR creator.
//
// Wraps Octokit's REST endpoints to land a candidate fix as a PR
// without a local git checkout. We use the Tree + Commit API:
//
//   1. Read the default branch's HEAD commit + base tree SHA.
//   2. For each file edit, create a blob via /git/blobs.
//   3. Build a new tree atop the base tree with the new blob SHAs.
//   4. Create a commit pointing at the new tree, with HEAD as parent.
//   5. Create a `refs/heads/<branch>` ref at the new commit.
//   6. Open the PR via /pulls.
//
// All writes go through Octokit's typed methods so we never construct
// raw URLs. PAT mode is the simplest: pass `auth: 'ghp_…'`. GitHub
// App mode wraps Octokit with `@octokit/auth-app`, but we keep that
// dependency optional — operators who need it install it separately.

import { Octokit } from '@octokit/rest';
import type { FixFileEdit } from './llm.js';

export interface GitHubAdapterOptions {
  /** Repository owner (org or user). */
  owner: string;
  /** Repository name. */
  repo: string;
  /**
   * Auth token. Either a personal access token (`ghp_…`) or a GitHub
   * App installation token. Both work — we just need write access on
   * the target repo.
   */
  token: string;
  /** Default branch name. Defaults to `main`. */
  defaultBranch?: string;
  /** Inject a custom Octokit instance for tests. */
  octokit?: Octokit;
}

export interface OpenPRInput {
  /** Branch name to create — must not exist yet. */
  branch: string;
  /** Commit message for the single squash commit. */
  commitMessage: string;
  /** PR title. */
  title: string;
  /** PR body (markdown). */
  body: string;
  /** File edits to apply on the new branch. */
  files: FixFileEdit[];
  /**
   * Optional marker to land in the PR labels — useful for the
   * dashboard to filter "PRs opened by ERNE" without pattern-matching
   * on the title.
   */
  labels?: string[];
}

export interface OpenPRResult {
  /** Full URL of the new PR. */
  url: string;
  /** Numeric PR id. */
  number: number;
  /** SHA the branch was created at. */
  sha: string;
}

export class GitHubAdapter {
  readonly owner: string;
  readonly repo: string;
  readonly defaultBranch: string;
  private readonly octokit: Octokit;

  constructor(options: GitHubAdapterOptions) {
    this.owner = options.owner;
    this.repo = options.repo;
    this.defaultBranch = options.defaultBranch ?? 'main';
    this.octokit = options.octokit ?? new Octokit({ auth: options.token });
  }

  /**
   * One-shot helper: branch + commit + PR. Throws on any step
   * failure. The caller is responsible for handling the AlreadyExists
   * case (e.g., picking a different branch name).
   */
  async openPR(input: OpenPRInput): Promise<OpenPRResult> {
    if (input.files.length === 0) {
      throw new Error('openPR called with zero file edits');
    }

    // 1. Resolve the base ref + commit SHA.
    const ref = await this.octokit.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${this.defaultBranch}`,
    });
    const baseCommitSha = ref.data.object.sha;
    const baseCommit = await this.octokit.git.getCommit({
      owner: this.owner,
      repo: this.repo,
      commit_sha: baseCommitSha,
    });
    const baseTreeSha = baseCommit.data.tree.sha;

    // 2. Materialise each edit as a blob. `replace` writes the full
    // file; `patch` mode is currently unsupported in this minimal
    // path — the orchestrator should refuse patch-mode edits at
    // confidence-gate time.
    const treeEntries: Array<{
      path: string;
      mode: '100644';
      type: 'blob';
      sha: string;
    }> = [];

    for (const edit of input.files) {
      if (edit.mode !== 'replace') {
        throw new Error(
          `[github] file edit mode "${edit.mode}" is not supported in v1 — use "replace"`,
        );
      }
      const blob = await this.octokit.git.createBlob({
        owner: this.owner,
        repo: this.repo,
        content: edit.content,
        encoding: 'utf-8',
      });
      treeEntries.push({
        path: edit.path,
        mode: '100644',
        type: 'blob',
        sha: blob.data.sha,
      });
    }

    // 3. Build the new tree atop the base.
    const newTree = await this.octokit.git.createTree({
      owner: this.owner,
      repo: this.repo,
      base_tree: baseTreeSha,
      tree: treeEntries,
    });

    // 4. Commit pointing at the new tree.
    const newCommit = await this.octokit.git.createCommit({
      owner: this.owner,
      repo: this.repo,
      message: input.commitMessage,
      tree: newTree.data.sha,
      parents: [baseCommitSha],
    });

    // 5. Create the branch ref. `refs/heads/<branch>` is the absolute
    // form Octokit's createRef expects.
    await this.octokit.git.createRef({
      owner: this.owner,
      repo: this.repo,
      ref: `refs/heads/${input.branch}`,
      sha: newCommit.data.sha,
    });

    // 6. Open the PR.
    const pr = await this.octokit.pulls.create({
      owner: this.owner,
      repo: this.repo,
      head: input.branch,
      base: this.defaultBranch,
      title: input.title,
      body: input.body,
    });

    if (input.labels && input.labels.length > 0) {
      try {
        await this.octokit.issues.addLabels({
          owner: this.owner,
          repo: this.repo,
          issue_number: pr.data.number,
          labels: input.labels,
        });
      } catch {
        // Labels are best-effort — a missing label permission shouldn't
        // fail the whole PR creation.
      }
    }

    return {
      url: pr.data.html_url,
      number: pr.data.number,
      sha: newCommit.data.sha,
    };
  }
}
