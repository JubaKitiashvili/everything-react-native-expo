# `@erne/monitor` vs measure.sh

> **Scope & honesty note.** measure.sh (Measure) is an open-source mobile
> observability project that, like `@erne/monitor`, can be self-hosted. Because
> both tools share the "open source, self-host your own data" philosophy, the
> comparison is more about emphasis than ideology. Competitor details are **as
> of 2026** and reflect Measure's public documentation and repository; confirm
> against [measure.sh](https://measure.sh) and its GitHub repo before deciding.
> Rows we could not fully verify are marked ⚠️.

## At a glance

| Dimension | `@erne/monitor` | Measure (per their docs, as of 2026) |
| --------- | --------------- | ------------------------------------ |
| React Native / Expo support | RN/Expo-first; SDK internals target RN (Fabric, Hermes, dual-thread FPS) | Native Android + iOS SDKs; RN coverage is via the native layer / a wrapper ⚠️ — verify the current state of first-class RN support |
| Self-hosting | Yes — default. MIT-licensed dashboard server, or local-only no-backend mode | Yes — self-hostable; open source ⚠️ (confirm license: Measure has used a source-available / Elastic-style license at points — check the current `LICENSE`) |
| Pricing model | Free (MIT) — you run the infra | Open source / self-hosted free; a managed/hosted option may exist ⚠️ |
| Source maps / symbolication | JS source maps via Expo plugin + EAS hook; dSYM / ProGuard via the dashboard symbol store | Symbolication for native crashes (dSYM / ProGuard) per their docs; JS source map handling for RN ⚠️ |
| Session replay | Yes — PII-masked screenshot ring buffer | Yes — session timeline / replay-style views per their docs ⚠️ |
| AI features | MCP server + AI Fix PR agent + on-device anomaly detection | Not a primary focus as of 2026 ⚠️ — verify whether AI-assisted diagnosis exists |
| OpenTelemetry | Native OTel export (traces + logs + metrics) | OTel support ⚠️ — confirm ingest/export details |
| Data ownership | You own it — your infra, or on-device | You own it — self-hosted by design |

## Where they overlap

Both projects are open source, both let you keep telemetry on your own
infrastructure, and both target mobile (rather than treating mobile as an
afterthought of a web-first APM). If your top priority is "no third party
holds my users' telemetry," either tool satisfies that requirement. This is the
healthiest kind of competition — pick on fit, not on data-ownership fear.

## Where they differ in emphasis

- **Native-first vs RN-first.** Measure's center of gravity is robust native
  Android and iOS SDKs. `@erne/monitor` is built RN-first: its differentiating
  signals (re-render storms, Fabric commit latency, dual-thread FPS, Hermes CPU
  profiling) are React-Native-specific and would not have a meaningful analogue
  in a purely native SDK.
- **AI integration.** `@erne/monitor` treats Claude / MCP as a first-class
  consumer and ships an agent that opens fix PRs. That is a deliberate
  differentiator, not a feature Measure is built around (⚠️ verify Measure's
  current AI posture).

## Where Measure is stronger

- **Native depth.** For teams whose primary surface area is native Android/iOS
  code (or a large native portion of a brownfield app), Measure's native SDKs
  are likely more thorough than `@erne/monitor`'s native bridge, which exists to
  serve the RN layer.
- **Maturity of native crash handling on a per-platform basis** ⚠️ — verify, but
  a native-first project typically has had more time tuning native crash and
  symbolication edge cases.
- **Breadth beyond React Native.** If your org runs both an RN app and separate
  fully-native apps, a single Measure deployment may cover more of your fleet.

## When `@erne/monitor` is the better choice

- You are React-Native / Expo first and want signals tuned to RN internals.
- You want the AI/MCP loop (agent reads crashes → opens PRs) as a built-in.
- You want a true zero-backend local-only mode for development or
  privacy-sensitive contexts.

## When Measure is the better choice

- Your apps are predominantly native, or you need one tool to span native and RN
  fleets.
- You want a project whose primary design target is native mobile observability.

---

⚠️ **Verify before publishing:** Measure's exact license (it has used
source-available licensing at times), the current state of first-class React
Native support, its session-replay and OTel capabilities, and whether a managed
hosting option exists. These materially affect several rows above — check
Measure's live docs and `LICENSE` file.
