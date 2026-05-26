# Pricing

> **The product is free. You only ever pay us to run it for you.**
>
> `@erne/monitor` is open core, and the "core" is the whole thing.
> **Every product capability ships in the MIT-licensed package** — crashes,
> ANRs, RN-specific performance, session replay, the AI Fix PR agent, the MCP
> server, OpenTelemetry export, the dashboard, all of it. There is no
> feature-gated tier. The only thing money buys is **managed hosting and
> operations**: letting us (eventually) run, scale, patch, and back up the
> backend so you don't have to.

## The philosophy in one line

There is no "OSS edition vs Cloud edition" with features held back. **OSS and
Cloud are the same product** — the difference is **who operates the backend**.
Run it yourself for free, forever, or pay for managed hosting if you'd rather
not.

| If you…                                                               | Choose                     |
| --------------------------------------------------------------------- | -------------------------- |
| Want to keep telemetry on your own infrastructure (or on-device)      | **OSS (self-hosted)**      |
| Don't want to operate a backend, but have no special compliance needs | **Cloud** _(roadmap)_      |
| Need SSO, a DPA, support SLAs, longer audit retention, etc.           | **Enterprise** _(roadmap)_ |

> **Status today:** `@erne/monitor` is **self-hosted-by-default and shipping**.
> A managed **ERNE Cloud** (and the Enterprise add-ons that sit on top of it) is
> **on the roadmap, not yet generally available** — see
> [Self-hosted → ERNE Cloud](./migration/oss-to-cloud.md). Staying self-hosted
> is a fully supported, permanent option. Cloud and Enterprise rows below
> describe the **intended** managed offering and are marked accordingly.

---

## Tier matrix

This matrix compares **hosting, operations, and support** — not features,
because the feature set is identical across all three. Every product capability
listed in [What you get for free](#what-you-get-for-free-always) is present in
OSS and unchanged by which tier you pick.

| Dimension                      | **OSS** (self-hosted, free)                                                                         | **Cloud** (managed hosting) _(roadmap)_ | **Enterprise** (managed + compliance/ops) _(roadmap)_ |
| ------------------------------ | --------------------------------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------- |
| **Price**                      | $0 — MIT-licensed, free forever                                                                     | `TODO: pricing TBD`                     | `TODO: pricing TBD`                                   |
| **License**                    | MIT ([LICENSE](../LICENSE))                                                                         | MIT package + hosted service terms      | MIT package + hosted service terms                    |
| **All product features**       | ✅ The complete product                                                                             | ✅ Identical — same package             | ✅ Identical — same package                           |
| **Who runs the backend**       | You (dashboard server, or local-only / no backend)                                                  | We do (managed)                         | We do (managed)                                       |
| **Who runs the SDK**           | You (it runs in your app, on-device)                                                                | You (same SDK)                          | You (same SDK)                                        |
| **Backend updates / patching** | You                                                                                                 | Managed                                 | Managed                                               |
| **Backups & restore**          | You (portable [data-export format](./migration/data-export-format.md))                              | Managed backups                         | Managed backups; `TODO: retention/RPO TBD`            |
| **Scaling / capacity**         | You size your own instance                                                                          | Managed scaling                         | Managed scaling                                       |
| **Uptime / availability**      | Whatever you operate                                                                                | `TODO: SLA TBD`                         | `TODO: SLA TBD` (contractual)                         |
| **Data residency / location**  | Your infrastructure (or fully on-device)                                                            | `TODO: regions TBD`                     | `TODO: regions / residency commitments TBD`           |
| **SSO / SAML / SCIM**          | Bring your own (front the dashboard with your own auth proxy)                                       | `TODO: TBD`                             | ✅ planned                                            |
| **DPA / subprocessor list**    | N/A — your data never leaves your control                                                           | `TODO: TBD`                             | ✅ planned (DPA + subprocessor disclosure)            |
| **Audit-log retention**        | As long as you keep it (your storage, your retention policy)                                        | `TODO: retention window TBD`            | `TODO: extended retention TBD` (configurable)         |
| **Support**                    | Community — [GitHub issues](https://github.com/JubaKitiashvili/everything-react-native-expo/issues) | `TODO: support tier TBD`                | `TODO: support SLA TBD` (priority / contractual)      |
| **Compliance attestations**    | You self-attest on your own infra                                                                   | `TODO: TBD`                             | `TODO: SOC 2 / etc. — not promised until verified`    |

Legend: ✅ included · `TODO` not yet decided — do not treat as a commitment.

> **Read this carefully:** the rows above are **operational**, not functional.
> Nothing in Cloud or Enterprise unlocks a capability that OSS lacks. If a future
> ERNE Cloud ever shipped a genuinely product-exclusive feature, this page (and
> the package README) would have to change — as written, the OSS package is the
> full product.

---

## What you get for free (always)

This is the **entire** product, available today in the MIT-licensed
`@erne/monitor` package — no account, no tier, no backend required. (Capabilities
summarized from the [package README](../packages/monitor/README.md); see it for
the authoritative, source-linked list.)

- **Crash reporting** — JS exceptions + unhandled rejections (burst-coalesced),
  native SIGSEGV/abort via a signal-safe handler, persisted across process death.
- **ANR detection** — watchdog-thread detection with real main-thread stacks on
  iOS and Android.
- **RN-specific performance** — dual-thread (UI vs JS) FPS, Fabric commit
  latency, Hermes CPU profiler, frame-drop detection, long-task observer, memory
  and thermal polling.
- **Session replay** — PII-masked screenshot ring buffer with a replay masker
  (secureTextEntry / accessibility label / testID), opt-in via consent.
- **Intelligence** — signal router (dedup → correlate → confidence → context →
  dispatch), built-in pattern library, on-device anomaly detection.
- **MCP server** — Claude-native: an agent can query your crash data directly.
- **AI Fix PR agent** — confidence-gated; can open a pull request against your
  repo.
- **OpenTelemetry export** — traces + logs + metrics; offline-first batch
  transport with gzip and backoff.
- **Self-hostable dashboard** — live event view, crash groups, metrics; SQLite or
  PostgreSQL backend.
- **Local-only mode** — no backend at all; telemetry stays on-device and is read
  through the in-process runtime / Expo DevTools panel.
- **Privacy & compliance tooling** — per-category consent gate, PII sanitizer,
  bundled Apple Privacy Manifest, DSAR export / delete APIs.
- **Dev tools** — Metro terminal warnings, Expo DevTools panel,
  shake-to-report bug reporter.
- **CLI** — `init`, `dashboard`, `scan`, `doctor`, and live event tailing.

All of the above is covered by the [MIT license](../LICENSE). You can run it in
production, modify it, and self-host it indefinitely at no cost.

---

## Why pay for Cloud or Enterprise, then?

You're not paying for features — you're paying to **not operate the backend**.
For self-hosting you run, scale, patch, and back up the dashboard server (or use
local-only mode and run nothing). Managed hosting takes that work off your plate:

- **Cloud** _(roadmap)_ — we host and operate the dashboard backend for you. Same
  product, no ops. Migration from self-hosted is a backup-and-import using the
  portable data-export format — see
  [Self-hosted → ERNE Cloud](./migration/oss-to-cloud.md).
- **Enterprise** _(roadmap)_ — Cloud **plus** the contractual and operational
  add-ons larger orgs require: SSO, a DPA and subprocessor disclosure, a support
  SLA, longer / configurable audit-log retention, and so on. These are
  **operational and compliance** add-ons layered on managed hosting — again, not
  exclusive product features.

> **No fabricated specifics.** Dollar amounts, SLA percentages, supported
> regions, retention windows, and compliance attestations are **not finalized**
> and are marked `TODO` above. They will be filled in when ERNE Cloud reaches
> general availability. Until then, do not treat any number on this page as a
> commitment.

---

## Get started

- **Self-host for free (recommended starting point):** follow
  [Getting Started](./getting-started.md). Three commands gets the SDK wired and a
  local dashboard running; from there you can move to your own server or stay
  local-only.
- **Planning ahead for managed hosting:** read
  [Self-hosted → ERNE Cloud](./migration/oss-to-cloud.md) for the intended
  migration path, and the [portable data-export format](./migration/data-export-format.md)
  that keeps your self-hosted instance migration-ready.
- **Comparing tools first:** the dated, source-attributed
  [comparisons](./compare/README.md) lay out where each alternative is stronger.
- **Choosing a release channel:** see [release channels](./releasing/channels.md)
  (stable / beta / canary).

---

> **Summary.** Features are free and MIT-licensed — the OSS package is the whole
> product. **OSS and Cloud have feature parity; Cloud is managed hosting, not a
> higher feature tier.** Enterprise adds compliance and operational guarantees on
> top of managed hosting, not exclusive capabilities. Pay only if you'd rather we
> run it for you.
