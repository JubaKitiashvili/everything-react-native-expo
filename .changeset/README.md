# Changesets

This folder is managed by [Changesets](https://github.com/changesets/changesets). It holds your in-progress version bumps and changelog entries until they are released.

## What is a changeset?

A changeset is a small Markdown file describing a change you made and how it affects the package version (`major`, `minor`, or `patch`). You add one in the same PR as your change. At release time, Changesets consumes all pending changesets, bumps versions, updates `CHANGELOG.md`, and (optionally) publishes to npm.

## Workflow

1. Make your code change.
2. Run:
   ```bash
   npm run changeset
   ```
   Pick the affected package(s), choose the bump type, and write a short, user-facing summary. This creates a file in `.changeset/`.
3. Commit the generated changeset file alongside your code change.
4. Open your PR. **PRs with a user-facing change should include a changeset.**

## What happens on release

The `release.yml` GitHub workflow runs on `main`:

- If there are pending changesets, it opens (or updates) a **"Version Packages"** PR that bumps versions and updates changelogs.
- When that PR is merged, the same workflow publishes the new version(s) to npm — **only if the `NPM_TOKEN` secret is configured**.

See the **Releasing** section of `CONTRIBUTING.md` for the full flow.

Read more in the [Changesets docs](https://github.com/changesets/changesets/blob/main/docs/intro-to-using-changesets.md).
