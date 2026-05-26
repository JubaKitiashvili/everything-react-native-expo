# `@erne/monitor` vs Sentry

> **Scope & honesty note.** Sentry is a mature, widely used product with a
> large engineering team behind it. This page compares it with `@erne/monitor`
> for a React Native / Expo team's runtime monitoring needs. Competitor details
> are **as of 2026** and reflect Sentry's public documentation and pricing
> pages; confirm against [sentry.io](https://sentry.io) before deciding.
> Rows we could not fully verify are marked ⚠️.

## At a glance

| Dimension | `@erne/monitor` | Sentry (per their docs, as of 2026) |
| --------- | --------------- | ----------------------------------- |
| React Native / Expo support | RN/Expo-first; the SDK and dashboard exist only for RN/Expo | First-class `@sentry/react-native` SDK; RN is one of many supported platforms |
| Self-hosting | Yes — default mode. MIT-licensed dashboard server you run yourself; also a local-only no-backend mode | Self-hosting available via the open-source `self-hosted` Docker distribution; the hosted SaaS is the primary offering ⚠️ (self-hosted is community-supported and explicitly not recommended at very large scale per their docs) |
| Pricing model | Free (MIT). You pay only for the infrastructure you run | Usage-based SaaS (events / spans / replays / cron) with a free tier; self-hosted is free but you operate it ⚠️ |
| Source maps / symbolication | JS source maps via the Expo config plugin + EAS post-build hook; dSYM / ProGuard handled server-side by the dashboard's symbol store | Mature source map + dSYM + ProGuard upload pipeline with `sentry-cli` and CI integrations |
| Session replay | Yes — PII-masked screenshot ring buffer, opt-in via consent | Yes — mobile session replay (per their docs) |
| AI features | MCP server + AI Fix PR agent that can open a PR against your repo; on-device anomaly detection | AI features such as autofix / "Seer" exist in their product ⚠️ (capabilities and availability change frequently) |
| OpenTelemetry | Native OTel export (traces + logs + metrics); ingest is also OTel-shaped | Strong OTel support and broad tracing ecosystem |
| Data ownership | You own it — telemetry stays on your infrastructure (or on-device in local mode) | Hosted: data lives in Sentry's cloud (region selectable per their docs). Self-hosted: you own it |

## Where they differ in philosophy

`@erne/monitor` starts from "your data never has to leave your control." The
default experience is a dashboard you run, or no backend at all (local-only,
on-device). There is no vendor ingestion endpoint to point a DSN at today.

Sentry starts from "a great hosted experience that just works," with
self-hosting available as an option. For most teams the hosted product is the
intended path, and it is genuinely polished and battle-tested.

The other structural difference is the **AI integration model**. `@erne/monitor`
ships a Model Context Protocol (MCP) server so an agent like Claude can query
your crash data directly, and an AI Fix PR agent that — gated on a confidence
score — can open a pull request against your repository. Sentry's AI features
live inside Sentry's product surface. If your workflow is "an AI agent reads the
crash, writes the fix, opens the PR," `@erne/monitor` is built around that loop.

## Where Sentry is stronger

This is not a close call on several axes — Sentry has real advantages:

- **Maturity and breadth.** Sentry has been in production for over a decade,
  supports dozens of platforms and frameworks, and has an enormous body of
  documentation, integrations, and community knowledge. `@erne/monitor` is new
  and RN-only.
- **Hosted operations.** With Sentry's SaaS you do not run, scale, patch, or
  back up anything. `@erne/monitor`'s default mode makes that your job.
- **Cross-stack tracing.** Sentry can trace a request from your React Native app
  through your backend services with first-party SDKs on both ends.
  `@erne/monitor` emits OTel spans but does not ship backend SDKs — distributed
  tracing across your services is something you assemble yourself.
- **Ecosystem & alerting integrations.** Sentry integrates out of the box with a
  long list of issue trackers, chat tools, and CI systems. `@erne/monitor` has a
  smaller, RN-focused integration surface.
- **Scale.** Sentry's hosted ingestion is engineered for very high event
  volumes. A single self-hosted `@erne/monitor` dashboard is appropriate for
  most apps but is not a drop-in replacement for a globally distributed
  ingestion tier.

## When `@erne/monitor` is the better choice

- You have a hard requirement to keep telemetry on your own infrastructure (or
  fully on-device) — e.g. for regulatory, contractual, or privacy reasons.
- You are React-Native-first and want an SDK tuned for RN internals (dual-thread
  FPS, Fabric commit latency, Hermes profiling, re-render storm detection).
- You want an AI agent to read crashes and open fix PRs as a native part of the
  loop, via MCP.
- You want to avoid per-event SaaS billing and are comfortable operating a small
  service (or running local-only).

## Migration

If you are currently on `@sentry/react-native`, there is a step-by-step
migration guide in the package itself:
`packages/monitor/docs/MIGRATING-FROM-SENTRY.md`. It maps `Sentry.init`,
breadcrumbs, user tagging, source map upload, and session replay to their
`@erne/monitor` equivalents.

---

⚠️ **Verify before publishing:** Sentry's self-hosted support posture, current
pricing structure, mobile session-replay availability, and the exact naming /
scope of its AI features (e.g. autofix, "Seer") all change frequently. Confirm
each against Sentry's live docs and pricing page before citing specifics.
