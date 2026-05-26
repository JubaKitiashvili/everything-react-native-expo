# `@erne/monitor` vs Bitdrift

> **Scope & honesty note.** Bitdrift (best known for its Capture product and the
> open-source `bitdrift-capture` SDK) focuses on real-time, on-device telemetry
> capture with server-controlled logging — a distinctive model where you can
> turn on detailed logs for a session after the fact. This is a genuinely
> different approach, and for incident response it is excellent. Competitor
> details are **as of 2026** and reflect Bitdrift's public docs; confirm against
> [bitdrift.io](https://bitdrift.io) before deciding. Rows we could not fully
> verify are marked ⚠️.

## At a glance

| Dimension | `@erne/monitor` | Bitdrift (per their docs, as of 2026) |
| --------- | --------------- | ------------------------------------- |
| React Native / Expo support | RN/Expo-first SDK and dashboard | Native iOS/Android SDKs; RN via a binding / wrapper ⚠️ — verify first-class RN support and Expo config-plugin availability |
| Self-hosting | Yes — default. MIT dashboard you run, or local-only mode | The capture SDK is open source; the control plane / backend (Bitdrift Capture service) is primarily a hosted offering ⚠️ — verify whether the full backend is self-hostable |
| Pricing model | Free (MIT); you run the infra | SaaS / usage-based for the hosted service ⚠️; SDK itself is open source |
| Source maps / symbolication | JS source maps via Expo plugin + EAS hook; dSYM/ProGuard via dashboard symbol store | Symbolication for native crashes per their docs ⚠️ |
| Session replay | Yes — PII-masked screenshot ring buffer | Bitdrift's model centers on rich structured logs / timelines rather than screenshot replay ⚠️ — verify whether visual replay is offered |
| AI features | MCP server + AI Fix PR agent + on-device anomaly detection | ⚠️ — verify current AI-assisted features |
| OpenTelemetry | Native OTel export (traces + logs + metrics) | OTel-compatible export ⚠️ — confirm |
| Data ownership | You own it — your infra, or on-device | Hosted: data lives in Bitdrift's cloud ⚠️ (verify region/residency options); on-device buffering before upload |

## Where Bitdrift's model is genuinely distinctive

Bitdrift's headline idea is **server-controlled, on-device logging**: the SDK
buffers fine-grained telemetry locally and you can remotely "pull" or enable
detailed logs for sessions matching a query — without shipping a new app build.
This is a powerful answer to "the bug only reproduces on one user's device and
we didn't have verbose logging on." It is a different shape of problem than what
crash-and-perf SDKs traditionally solve, and it is well-executed.

`@erne/monitor` buffers on-device too (offline-first batch upload, replay ring
buffer, crash persistence across process death), but its on-device intelligence
is oriented toward **anomaly detection and signal routing** rather than
remote-controlled log streaming.

## Where Bitdrift is stronger

- **Remote, retroactive log control.** If your core need is "let me crank up
  logging for a specific cohort or session, live, without a release,"
  Bitdrift is purpose-built for that and `@erne/monitor` is not.
- **High-volume real-time streaming.** Bitdrift's pipeline is engineered for
  continuous, high-cardinality telemetry streams ⚠️ (verify) — a hosted
  ingestion tier will out-scale a single self-hosted dashboard.
- **Native SDK depth.** As with other native-first tools, Bitdrift's iOS/Android
  SDKs are likely more thorough on native specifics than `@erne/monitor`'s RN
  bridge.

## Where `@erne/monitor` is stronger

- **Self-hosting the whole stack.** `@erne/monitor`'s dashboard and storage are
  designed to be run by you under MIT; the entire pipeline can stay on your
  infrastructure or, in local-only mode, never leave the device.
- **React-Native-specific signals.** Re-render storms, Fabric commit latency,
  dual-thread FPS, and Hermes profiling are RN-native concerns Bitdrift's
  native-first design does not target.
- **AI / MCP loop.** The MCP server and AI Fix PR agent are built in.

## When to pick which

- **Pick Bitdrift** if retroactive, server-controlled on-device logging for
  hard-to-reproduce issues is your central requirement, and a hosted control
  plane is acceptable.
- **Pick `@erne/monitor`** if you want a fully self-hostable, RN-first stack with
  built-in AI/MCP workflows and the option to keep all data on-device.

---

⚠️ **Verify before publishing:** Bitdrift's self-hosting story for its backend
(vs the open-source SDK alone), first-class RN/Expo support, whether it offers
visual session replay, its OTel and AI capabilities, and data-residency options.
These drive several rows — confirm against Bitdrift's live documentation.
