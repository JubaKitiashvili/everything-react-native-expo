# Comparing `@erne/monitor` with other observability tools

This folder holds factual, side-by-side comparisons between `@erne/monitor`
and the tools teams most often evaluate alongside it. The goal is to help you
pick the right tool — **not** to talk you out of the alternatives. Several of
the products compared here are excellent and, for many teams, a better fit than
a self-hosted SDK.

## How to read these pages

- **Every competitor claim is dated** ("as of 2026") and attributed ("per their
  docs / pricing page"). Vendors change features and pricing frequently — treat
  each table as a starting point, then confirm against the vendor's current
  documentation before making a decision.
- **Anything we could not verify is flagged** with a ⚠️ note. Do not rely on a
  flagged row without checking it yourself.
- **Each page has a "Where _X_ is stronger" section.** These are honest, not
  token concessions. If a competitor wins on a dimension that matters to you,
  it's called out plainly.
- We describe `@erne/monitor`'s own capabilities from its source and docs. Where
  a feature is partial, beta, or planned, we say so.

## What `@erne/monitor` is

An MIT-licensed, **self-hosted-by-default**, React-Native-first runtime
monitoring SDK plus a self-hostable dashboard, an MCP server for Claude-native
workflows, and an optional AI agent that can open a fix PR. It exports
OpenTelemetry and runs in a local-only mode with no backend at all.

It is **not** a hosted SaaS. There is no `erne.dev`-operated ingestion endpoint
you can point a DSN at today; you run the dashboard server yourself (or use
local-only mode). A future hosted "ERNE Cloud" is on the roadmap — see
[`../migration/oss-to-cloud.md`](../migration/oss-to-cloud.md).

## Pages

| Comparison | Best for evaluating against |
| ---------- | --------------------------- |
| [vs Sentry](./sentry.md) | The default RN crash + perf + replay SaaS |
| [vs measure.sh](./measure.md) | An open-source, self-hostable mobile observability tool |
| [vs Bitdrift](./bitdrift.md) | Real-time, on-device session capture / remote logging |
| [vs Firebase Crashlytics](./firebase.md) | Free, Google-backed crash reporting |

## Comparison dimensions

All pages use a consistent rubric so you can compare across tools:

- **React Native / Expo support** — first-class, SDK, or via a generic layer
- **Self-hosting** — can you run the backend yourself, and under what license
- **Pricing model** — how the vendor charges (as of 2026)
- **Source maps / symbolication** — JS source maps, dSYM, ProGuard/R8 mapping
- **Session replay** — visual session reconstruction
- **AI features** — automated diagnosis, suggested fixes, agent integration
- **OpenTelemetry** — native OTel ingest / export
- **Data ownership** — where your telemetry physically lives

## A note on fairness

We maintain these comparisons in the open. If you work on one of the tools
compared here and believe a row is inaccurate or out of date, please
[open an issue](https://github.com/JubaKitiashvili/everything-react-native-expo/issues)
and we will correct it. We would rather be accurate than flattering.
