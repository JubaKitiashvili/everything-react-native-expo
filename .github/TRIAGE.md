# Issue Triage Guide

This document describes how incoming issues are labeled, prioritized, and worked through for `@erne/monitor`. It is for maintainers and anyone who wants to understand how their issue moves through the pipeline.

## Goals

- Every new issue gets an initial response and a `type/*` + `status/*` label quickly.
- Priority reflects user impact, not who filed it.
- Nothing sits in limbo — every issue is either actionable, waiting on someone, or closed.

## Label Taxonomy

Labels are grouped by prefix. An issue normally carries **one `type/*`**, **one `priority/*`**, **one `status/*`**, and **one or more `area/*`** labels.

### `type/*` — what kind of issue this is

| Label              | Meaning                                                      |
| ------------------ | ----------------------------------------------------------- |
| `type/bug`         | Something is broken or behaves incorrectly.                 |
| `type/feature`     | New capability or enhancement request.                      |
| `type/docs`        | Documentation gap, error, or improvement.                   |
| `type/question`    | A usage question (usually redirected to Discussions).      |
| `type/security`    | Security-relevant (handle per `SECURITY.md`, keep private). |
| `type/maintenance` | Refactors, dependency bumps, CI, release plumbing.          |

### `area/*` — which part of the project

| Label               | Meaning                                                |
| ------------------- | ------------------------------------------------------ |
| `area/sdk`          | The `@erne/monitor` SDK (collectors, transport, etc.). |
| `area/dashboard`    | The self-hosted dashboard (server + UI).               |
| `area/mcp`          | The MCP server integration.                            |
| `area/agents`       | Agent-facing tooling and analysis.                     |
| `area/storage`      | Storage adapters (memory, file, Postgres).             |
| `area/ci`           | CI/CD, workflows, release automation.                  |
| `area/docs`         | Documentation and examples.                            |

### `priority/*` — how urgent

| Label             | Meaning                                                            |
| ----------------- | ----------------------------------------------------------------- |
| `priority/critical` | Data loss, crash, security, or broken release. Drop everything. |
| `priority/high`    | Major feature broken or blocking many users.                     |
| `priority/medium`  | Important but has a workaround.                                   |
| `priority/low`     | Minor / cosmetic / nice-to-have.                                  |

### `status/*` — where it is in the workflow

| Label                  | Meaning                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `status/needs-triage`  | New, not yet reviewed. (Applied by default to new issues.)    |
| `status/needs-info`    | Waiting on the reporter for repro/details.                    |
| `status/confirmed`     | Reproduced / accepted; ready to be worked on.                 |
| `status/in-progress`   | Actively being worked on.                                     |
| `status/blocked`       | Waiting on an external dependency or another issue.           |
| `status/wontfix`       | Valid but intentionally not addressed.                        |
| `status/duplicate`     | Tracked by another issue (link it).                           |

### Helper labels

| Label              | Meaning                                                   |
| ------------------ | --------------------------------------------------------- |
| `good first issue` | Well-scoped, low-context entry point for new contributors. |
| `help wanted`      | We would welcome a community PR for this.                  |

## SLA Targets

These are targets, not guarantees — this is a community-maintained open-source project. They reset the clock whenever the ball is in our court (not while `status/needs-info`).

| Stage                          | Target                               |
| ------------------------------ | ------------------------------------ |
| First response / initial triage | within **3 business days**          |
| `priority/critical` acknowledgement | within **24 hours**             |
| `priority/critical` fix or mitigation | within **7 days**             |
| `priority/high` resolution     | best effort within **30 days**       |
| `status/needs-info` auto-close | **14 days** of no reply → close as stale |
| Security reports               | see `SECURITY.md` (48h ack, 90-day disclosure) |

## Triage Workflow

1. **New issue arrives** with `status/needs-triage` (and the `type/*` label its template applied).
2. **Confirm the type.** If it is actually a question, redirect to [Discussions](https://github.com/JubaKitiashvili/everything-react-native-expo/discussions), apply `type/question`, and close.
3. **Check completeness.** Missing repro steps, version, or environment? Apply `status/needs-info` and ask. If no reply in 14 days, close as stale (it can always be reopened).
4. **Reproduce / validate.** For bugs, try to reproduce. For features, assess fit against `ROADMAP.md`.
5. **Label it fully** — add `area/*`, `priority/*`, and replace `status/needs-triage` with `status/confirmed` (or `status/wontfix` / `status/duplicate`).
6. **Slot the work.** Confirmed items move onto the roadmap board (see `ROADMAP.md` → GitHub Projects). Tag `good first issue` / `help wanted` where appropriate.
7. **During work**, flip to `status/in-progress`; if it stalls on something external, use `status/blocked`.
8. **On merge/release**, close the issue and reference the PR + release. Security issues follow the advisory process in `SECURITY.md`.

## Security Issues

If an issue is security-relevant, **do not discuss details publicly.** Apply `type/security`, redirect the reporter to the private channels in [`SECURITY.md`](../SECURITY.md), and continue under the coordinated-disclosure process there.
