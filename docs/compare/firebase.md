# `@erne/monitor` vs Firebase Crashlytics

> **Scope & honesty note.** Firebase Crashlytics is Google's free, widely
> adopted crash reporting tool, usually paired with Firebase Performance
> Monitoring and Google Analytics for Firebase. It is free, reliable, and
> deployed on an enormous number of apps for good reason. Competitor details are
> **as of 2026** and reflect Google's public Firebase documentation; confirm
> against [firebase.google.com](https://firebase.google.com) before deciding.
> Rows we could not fully verify are marked ⚠️.

## At a glance

| Dimension | `@erne/monitor` | Firebase Crashlytics (+ Performance, per Google's docs, as of 2026) |
| --------- | --------------- | ------------------------------------------------------------------- |
| React Native / Expo support | RN/Expo-first SDK + dashboard | Via `@react-native-firebase/crashlytics` (community-maintained RN wrapper) and an Expo config plugin; underlying SDK is native iOS/Android |
| Self-hosting | Yes — default. MIT dashboard you run, or local-only mode | No — Crashlytics is a managed Google service; you cannot self-host it |
| Pricing model | Free (MIT); you run the infra | Free for Crashlytics; Performance Monitoring free; some adjacent Firebase services are usage-billed ⚠️ |
| Source maps / symbolication | JS source maps via Expo plugin + EAS hook; dSYM/ProGuard via dashboard symbol store | dSYM upload + NDK symbolication + JS source map support for RN via the RNFirebase tooling ⚠️ |
| Session replay | Yes — PII-masked screenshot ring buffer | No native session replay in Crashlytics ⚠️ (verify — historically not offered) |
| AI features | MCP server + AI Fix PR agent + on-device anomaly detection | Crashlytics has added AI-assisted insights / Gemini-powered features in the Firebase console ⚠️ — verify current scope; no agent-opens-a-PR loop |
| OpenTelemetry | Native OTel export (traces + logs + metrics) | Not OTel-based; data flows into Google's ecosystem (BigQuery export available) ⚠️ |
| Data ownership | You own it — your infra, or on-device | Data lives in Google's cloud; BigQuery export lets you copy it into your own GCP project ⚠️ |

## Where they differ in philosophy

Crashlytics is "free crash reporting, operated by Google, deeply integrated with
the rest of Firebase and GCP." You give up self-hosting and OTel-neutrality in
exchange for zero operational burden and a mature, free product.

`@erne/monitor` is "you run it, you own the data, it's RN-tuned, and an AI agent
can act on the crashes." You take on operating a small service in exchange for
data control and the AI/MCP workflow.

## Where Firebase Crashlytics is stronger

Crashlytics has clear, real advantages — for many teams it is the right default:

- **Free and zero-ops.** Nothing to host, scale, patch, or back up. Hard to beat
  for a small team or a side project.
- **Maturity and reliability.** It is one of the most battle-tested crash
  reporters in the industry, across billions of devices.
- **Ecosystem integration.** Tight links to Google Analytics for Firebase,
  Performance Monitoring, Remote Config, BigQuery export, and the broader GCP
  stack. If you already live in Firebase, the integration tax is near zero.
- **Velocity alerts & install-base context.** Crashlytics' velocity alerts and
  crash-free-users metrics are well-tuned and widely understood.

## Where `@erne/monitor` is stronger

- **Data ownership / self-hosting.** Crashlytics cannot be self-hosted at all;
  `@erne/monitor` is self-hosted by default and can run fully on-device.
- **OpenTelemetry neutrality.** `@erne/monitor` exports OTel, so your data is not
  tied to one vendor's ecosystem.
- **React-Native-specific depth.** Re-render storm detection, Fabric commit
  latency, dual-thread FPS, and Hermes profiling go beyond what Crashlytics +
  Performance Monitoring surface for an RN app.
- **AI Fix PR loop via MCP.** An agent reading the crash and opening a PR is a
  built-in workflow, not something you assemble around the console.
- **Session replay** is built in (⚠️ verify Crashlytics still does not offer it).

## When to pick which

- **Pick Crashlytics** if you want free, zero-maintenance crash reporting, you're
  already in the Firebase/GCP ecosystem, and self-hosting is not a requirement.
- **Pick `@erne/monitor`** if you need to own your telemetry, want RN-specific
  performance signals, prefer OTel, or want the AI/MCP fix-PR loop — and you're
  willing to run a small service (or use local-only mode).

It's also reasonable to **run both during a transition**: keep Crashlytics for
its mature crash-free-users baseline while you stand up `@erne/monitor` for
RN-specific signals and the AI workflow.

---

⚠️ **Verify before publishing:** the exact scope of Crashlytics' AI / Gemini
features, whether session replay is offered, current RN source-map tooling, and
which adjacent Firebase services carry usage-based billing. Confirm against
Google's live Firebase documentation.
