# npm Release Channels

ERNE publishes to three npm **dist-tags** so consumers can opt into the level of
stability they want. This document defines the three channels, how
[Changesets](https://github.com/changesets/changesets) pre-release mode maps to
them, and the promotion workflow from beta to stable.

This complements — and does **not** replace — the day-to-day release flow in
[`../../.changeset/README.md`](../../.changeset/README.md) and the **Releasing**
section of [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md). The main
`release.yml` workflow continues to own the **stable** channel; nothing here
changes that.

## The three channels

| Channel | npm dist-tag | `npm install` form | Audience | Source |
| ------- | ------------ | ------------------ | -------- | ------ |
| **Stable** | `latest` | `npm install erne-universal` | Everyone — the default | Changesets release of `main` |
| **Beta** | `next` | `npm install erne-universal@next` | Early adopters validating an upcoming release | Changesets **pre-release mode** |
| **Canary** | `canary` | `npm install erne-universal@canary` | Bleeding edge — test a specific commit | Per-commit publish from the `canary` branch |

Key property of npm dist-tags: a bare `npm install <pkg>` always resolves to the
`latest` tag. Beta and canary builds are published under their own tags, so they
are **opt-in only** — a normal install never picks them up. This is what makes
it safe to publish pre-releases continuously.

### Stable (`latest`)

The production channel. Versions are plain semver: `1.4.0`, `1.4.1`, `1.5.0`.
Published by the existing `release.yml` Changesets flow when a "Version
Packages" PR merges into `main`. Most users only ever touch this channel.

### Beta (`next`)

A stabilization channel for an upcoming release. Versions carry a pre-release
identifier: `1.5.0-beta.0`, `1.5.0-beta.1`, … Driven by Changesets
**pre-release mode** (see below). Use this when a release is feature-complete but
you want real-world validation before promoting it to `latest`.

### Canary (`canary`)

The bleeding-edge channel. Each push to the `canary` branch publishes a uniquely
versioned build (a pre-release version derived from the commit, e.g.
`1.5.0-canary.<short-sha>` or a timestamped snapshot) under the `canary`
dist-tag. Canary builds are disposable and may be broken — they exist so you can
reproduce or test against an exact in-progress commit. The `canary` dist-tag is
overwritten on every push, so it always points at the newest canary build.

## How Changesets pre-release mode maps to the channels

Changesets has a built-in **pre-release mode** that turns the normal stable flow
into a beta flow without changing how you write changesets.

### Entering beta

```bash
npx changeset pre enter beta
```

This writes `.changeset/pre.json`, recording that the repo is now in `beta`
pre-release mode. From this point:

- `npx changeset version` produces **`x.y.z-beta.N`** versions instead of plain
  `x.y.z`.
- `npx changeset publish` publishes under the **`next`** dist-tag (configured via
  the publish tag for pre-releases), not `latest`.
- Changelogs accumulate under the pre-release versions.

Channel mapping:

| Changesets state | Produces version | Published dist-tag | Channel |
| ---------------- | ---------------- | ------------------ | ------- |
| Pre-release mode `beta` | `x.y.z-beta.N` | `next` | **Beta** |
| Normal (no pre mode) | `x.y.z` | `latest` | **Stable** |
| Out-of-band per-commit build (canary workflow) | `x.y.z-canary.<sha>` | `canary` | **Canary** |

> Canary is intentionally **outside** Changesets' pre-release mode. Canary builds
> are produced by a dedicated workflow (`.github/workflows/canary.yml`) that
> version-stamps each commit and runs `npm publish --tag canary`. Keeping canary
> out of Changesets means it never interferes with the stable or beta version
> ledger.

### Exiting beta (promotion to stable)

```bash
npx changeset pre exit
```

This removes the repo from pre-release mode. The **next** `changeset version`
run collapses the accumulated `-beta.N` entries into a single clean stable
version (e.g. `1.5.0`), and `changeset publish` returns to publishing under
`latest`.

## Promotion workflow: beta → stable

The typical lifecycle of a release moving through the channels:

1. **Develop on `main`** as usual, adding changesets to PRs.
2. **Enter beta** when the release is feature-complete:
   ```bash
   npx changeset pre enter beta
   git commit -am "chore: enter beta pre-release mode"
   ```
3. **Cut beta builds.** Each merge produces `x.y.z-beta.N` published to `next`.
   Early adopters install with `@next` and report back.
   ```bash
   npm install erne-universal@next
   ```
4. **Iterate.** Land fixes (with changesets). Each round bumps the beta counter:
   `…-beta.1`, `…-beta.2`, …
5. **Exit beta** once the build is validated:
   ```bash
   npx changeset pre exit
   git commit -am "chore: exit beta pre-release mode"
   ```
6. **Promote to stable.** The next Changesets version PR produces the clean
   `x.y.z` and publishes to `latest`. The release is now the default install.

There is no separate "re-publish the same bytes under a new tag" step required —
exiting pre-release mode and running the normal release produces the stable
artifact. If you ever do need to retag an already-published version (e.g. point
`latest` at an existing version), use:

```bash
npm dist-tag add erne-universal@1.5.0 latest
```

## Choosing a channel as a consumer

| You want… | Install |
| --------- | ------- |
| The default, production-ready release | `npm install erne-universal` |
| To validate an upcoming release before it's the default | `npm install erne-universal@next` |
| To reproduce or test against a specific in-progress commit | `npm install erne-universal@canary` |
| A specific exact version | `npm install erne-universal@1.5.0-beta.1` |

## CI / automation

- **Stable & beta** are handled by `.github/workflows/release.yml` via the
  Changesets action. Whether it publishes to `latest` or `next` is determined by
  whether the repo is in pre-release mode (`.changeset/pre.json` present).
- **Canary** is handled by `.github/workflows/canary.yml`, which runs on pushes
  to the `canary` branch and publishes a per-commit build under the `canary`
  dist-tag. It is **guarded on the `NPM_TOKEN` secret** — if the token is not
  configured, the publish step is skipped (not failed), exactly like the stable
  release flow.

All three flows skip publishing gracefully when `NPM_TOKEN` is absent, so forks
and PRs never attempt to publish.
