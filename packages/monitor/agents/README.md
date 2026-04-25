# @erne/monitor-ai-fix-pr

AI Fix PR agent for the [`@erne/monitor`](../) dashboard. Given a crash
group fingerprint, it pulls the crash context from the dashboard, asks
Claude for a candidate fix, and opens a pull request via the GitHub
API. Confidence decays automatically based on whether your team merges
or rejects each proposal.

> Task 117.6 — Phase 7. Read-only LLM use; nothing in this agent
> mutates production data outside of GitHub PR creation.

## Install

```bash
npm install -g @erne/monitor-ai-fix-pr
# or run on-demand via npx (no install needed):
# npx @erne/monitor-ai-fix-pr <fingerprint>
```

Requires Node.js ≥ 20, a running `@erne/monitor` dashboard server, an
Anthropic API key, and a GitHub token (PAT or App installation token)
with write access on the target repo.

## Run

```bash
ANTHROPIC_API_KEY=sk-ant-...                     \
GITHUB_TOKEN=ghp_...                             \
ERNE_REPO_OWNER=acme                             \
ERNE_REPO_NAME=mobile-app                        \
ERNE_DASHBOARD_URL=http://127.0.0.1:3333         \
npx @erne/monitor-ai-fix-pr fp-abcdef01
```

The CLI prints a JSON result and exits 0 on `proposed`, 1 on `skipped`.

## Architecture

```
fingerprint
   │
   ▼
DashboardClient.listCrashGroups
DashboardClient.listEvents          ←  context bundler
   │
   ▼
FixContext { stack, breadcrumbs, ... }
   │
   ▼
AnthropicLLM.generateFix            ←  llm wrapper (prompt-cached)
   │
   ▼
FixCandidate { files, confidence, classification, abstain? }
   │
   ▼
ConfidenceStore.effectiveConfidence ←  Bayesian gate
   │     │
   │     └─→ skipped: confidence-too-low / no-files / too-many-files / unsupported-mode / llm-abstain
   ▼
GitHubAdapter.openPR                ←  Tree + Commit + Refs + Pulls
   │
   ▼
ConfidenceStore.recordProposal
```

Each collaborator is injected — swap `AnthropicLLM` for a different
provider, `GitHubAdapter` for a Forgejo / GitLab implementation, the
in-memory storage for the dashboard's `server_settings` REST shim.

## Confidence formula

Per classification (`null-check`, `missing-await`, `type-cast`, …):

```
trust = (1 + merged) / (1 + merged + 1 + rejected + ignored)
```

— a Beta-distribution mean with α=β=1 priors. Effective confidence
gating happens via:

```
effective = self_reported × trust
gate      = effective ≥ minConfidence  // default 50
```

A brand-new classification starts at trust = 0.5 (uniform prior). One
merge moves it to ~0.67; three merges to ~0.80. One rejection moves it
back; sustained rejections starve out the bucket entirely.

## Environment variables

| Variable              | Default                  | Required | Purpose                                          |
| --------------------- | ------------------------ | -------- | ------------------------------------------------ |
| `ERNE_DASHBOARD_URL`  | `http://127.0.0.1:3333`  | no       | Dashboard server REST API.                       |
| `ERNE_API_KEY`        | *(unset)*                | no       | When the dashboard's API gate is on (Task 117.61). |
| `ANTHROPIC_API_KEY`   | —                        | yes      | Claude API key.                                  |
| `GITHUB_TOKEN`        | —                        | yes      | PAT or App installation token.                   |
| `ERNE_REPO_OWNER`     | —                        | yes      | Target repo owner (org or user).                 |
| `ERNE_REPO_NAME`      | —                        | yes      | Target repo name.                                |
| `ERNE_REPO_BRANCH`    | `main`                   | no       | Base branch for the PR.                          |
| `ERNE_DASHBOARD_LINK` | `$ERNE_DASHBOARD_URL`    | no       | Public URL used in the PR backlink.              |
| `ERNE_MIN_CONFIDENCE` | `50`                     | no       | Effective-confidence floor.                      |
| `ERNE_MAX_FILES`      | `5`                      | no       | Per-PR file edit cap (sanity guard).             |

## Skip reasons

| Reason                | Meaning                                                   |
| --------------------- | --------------------------------------------------------- |
| `context-not-found`   | No crash group with that fingerprint, or no events.       |
| `llm-abstain`         | Claude declined to propose — see `detail` for why.        |
| `no-files`            | Candidate had zero file edits.                            |
| `too-many-files`      | Edit count exceeded `ERNE_MAX_FILES`.                     |
| `unsupported-mode`    | A `patch`-mode edit slipped through (only `replace` ships in v1). |
| `confidence-too-low`  | Effective confidence below `ERNE_MIN_CONFIDENCE`.         |

## What's still ahead

Several follow-up tasks build on this surface:

- **117.81 audit trail** — every Claude action logged with timestamp,
  user, tools called, files considered, confidence, PR link, plus an
  audit-log query API on the dashboard.
- **117.6 follow-up** — webhook handler that flips confidence buckets
  on PR merge / close events.
- **117.96 launch demo** — live Twitch session uses this agent end-
  to-end on a real RN app.

## License

MIT
