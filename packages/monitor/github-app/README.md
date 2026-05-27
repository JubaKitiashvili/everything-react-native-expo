# @erne/monitor-github-app

GitHub App **webhook handler library** for [`@erne/monitor`](../). It provides the
verified, unit-tested logic that connects a repository's GitHub activity to the
ERNE monitoring dashboard. It is a *library*, not a running service — the host
(an Express route, a serverless function, etc.) wires it up and supplies live
clients.

## What it does

Three features, each a pure function of `(payload, deps)`:

1. **Deploy markers** — on a GitHub `deployment` event, records a deploy marker
   (version + commit SHA + environment + timestamp) in the dashboard so release
   boundaries can be drawn on crash/latency timelines.
2. **Crash-regression status check** — on `pull_request` / `check_suite`,
   compares the head branch's crash-free rate against the base branch's and
   posts a commit status under the `erne/crash-regression` context:
   - **failure** when the crash-free rate drops past the threshold
     (default 1 percentage point) — e.g. *"Crash-free rate dropped 4.00%
     (99.00% -> 95.00%)."*
   - **pending** when there is no crash-free data for the head version yet.
   - **success** when stable (or when only head data exists, reported as
     informational).
3. **Issue ↔ crash linking** — on `issues` (`opened` / `edited`), parses a crash
   fingerprint from the issue body and links it to the corresponding crash
   group, then posts a confirming comment. Two accepted formats:
   - a line `ERNE-Crash: <fingerprint>`
   - an `erne.dev/crashes/<fingerprint>` URL

## Webhook events handled

| Event          | Handler                       | Action                                  |
| -------------- | ----------------------------- | --------------------------------------- |
| `deployment`   | `handleDeployment`            | record deploy marker                    |
| `pull_request` | `handleCrashRegressionCheck`  | post `erne/crash-regression` status     |
| `check_suite`  | `handleCrashRegressionCheck`  | post `erne/crash-regression` status     |
| `issues`       | `handleIssueCrashLink`        | link issue to crash + comment           |
| `ping`         | —                             | acknowledged, ignored                   |
| *(any other)*  | —                             | acknowledged, ignored (`ignored: true`) |

## Design: everything is injected

There is **no `octokit` dependency** and **no network code**. All side effects
flow through two interfaces you implement (`src/types.ts`):

- `GitHubClient` — `createCommitStatus(...)`, `createIssueComment(...)`
- `MonitorClient` — `recordDeployMarker(...)`, `getCrashFreeRate(...)`,
  `linkIssueToCrash(...)`

Signature verification uses `node:crypto` only (`verifySignature`, HMAC-SHA256,
constant-time compare). Because every dependency is injected, the entire handler
surface is **fully unit-testable headlessly** with mocked clients and mock
GitHub payloads — no live GitHub access required.

## Usage (host integration sketch)

```ts
import { handleWebhook } from '@erne/monitor-github-app';

// In your HTTP handler, read the RAW body (not re-serialized JSON):
const result = await handleWebhook({
  event: req.headers['x-github-event'],
  payload: JSON.parse(rawBody),
  signatureHeader: req.headers['x-hub-signature-256'],
  rawBody, // exact bytes GitHub sent — required for signature verification
  secret: process.env.GITHUB_WEBHOOK_SECRET,
  deps: { github: myGitHubClient, monitor: myMonitorClient },
});

res.status(result.status).json(result);
```

`handleWebhook` never throws: a bad signature → `{ ok: false, status: 401 }`,
unknown events → `{ ok: true, status: 200, ignored: true }`, handler errors →
`{ ok: false, status: 500, error }`.

## Required GitHub App configuration

When you register the App (operator step, below), it needs:

**Repository permissions**

- **Commit statuses:** Read & write — to post the crash-regression status.
- **Issues:** Read & write — to read issue bodies and post link comments.
- **Deployments:** Read — to receive `deployment` events.
- **Pull requests:** Read — for `pull_request` event metadata.
- **Contents:** Read — for repository metadata.

**Event subscriptions**

- `deployment`
- `pull_request`
- `check_suite`
- `issues`

**Webhook**

- A webhook URL pointing at your host endpoint.
- A webhook **secret** matching the `secret` you pass to `handleWebhook`.

## Scripts

```bash
npm install     # installs into THIS package's own node_modules
npm run build      # tsc -> dist/
npm run typecheck  # tsc --noEmit
npm test           # vitest run
```

## 🟡 Operator setup — NOT covered by this package's tests

This package contains **only the verified, unit-tested handler logic.** The
following are **operator / deployment tasks that require live GitHub access**
and are explicitly **out of scope and not tested here**:

- 🟡 **Registering the GitHub App** (creating the App, its manifest, generating
  the private key, setting permissions and event subscriptions in the GitHub UI).
- 🟡 **Installing the App** on one or more repositories / an organization.
- 🟡 **Hosting the webhook endpoint** (deploying an HTTP server, configuring the
  public webhook URL and secret, TLS, scaling).
- 🟡 **Implementing the real `GitHubClient`** (minting an installation access
  token from the App's private key + installation ID and calling the GitHub REST
  API) and the real `MonitorClient` (calling the ERNE dashboard API).

Those require a live GitHub account and a deployed host, neither of which can be
exercised by unit tests. What *is* tested here: signature verification, payload
parsing, the regression decision logic, fingerprint extraction, and webhook
routing — all against mocked clients and mock GitHub payloads.
