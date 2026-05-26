# @erne/monitor

> **Runtime intelligence for React Native & Expo** — crash reporting, dual-thread FPS, ANR detection, session replay, and AI-powered diagnosis. RN/Expo-first, **self-hosted by default**, and **Claude-native** via a built-in MCP server. Your telemetry stays on your infrastructure — or, in local-only mode, never leaves the device. MIT-licensed.

```bash
npx expo install @erne/monitor   # add the SDK, then wrap your app root in <MonitorProvider> (npx @erne/monitor init wires it for you)
```

Overhead budgets: `<2% CPU`, `<5MB memory` (Reassure). Bundle: the full all-in-one runtime is ~84KB gzipped (optional collectors + dev integrations are lazy-loaded out of the static graph; crash/ANR/network/render stay eager). Import a subpath to pay only for what you use (e.g. `@erne/monitor/network` is `<5KB gzipped`, `/performance` `<20KB`). See **[bundle analysis](./docs/BUNDLE-ANALYSIS.md)** for per-entry sizes.

`@erne/monitor` is an SDK plus a self-hostable dashboard, an MCP server so an agent like Claude can query your crash data directly, and an optional AI agent that — gated on a confidence score — can open a fix PR against your repo. It exports OpenTelemetry (traces + logs + metrics) and is built around RN internals other monitors don't see: re-render storms, Fabric commit latency, dual-thread (UI vs JS) FPS, and Hermes CPU profiling. There is **no vendor ingestion endpoint to point a DSN at today** — you run the dashboard, or run with no backend at all.

---

## Quickstart (3 lines)

```bash
npx @erne/monitor init        # wires MonitorProvider + babel plugin into your app
npx @erne/monitor dashboard   # starts the local dashboard on http://127.0.0.1:3333
# then start Metro and reload your app — events stream in live
```

`init` is idempotent (re-run safe; use `--dry-run` to preview). It renders a `monitor.config.ts`, wraps your root layout with `<MonitorProvider>`, and adds `@erne/monitor/babel-plugin` to your Babel config. After `init`, install the package if it isn't already a dependency (`npx @erne/monitor init` prints the exact command for your package manager), then start Metro.

> The `dashboard` server defaults to port `3333` and persists ingested events to SQLite at `~/.erne/monitor/dashboard.db`. The dashboard (live feed, crash groups, sessions, metrics) is served at `http://127.0.0.1:3333/`. Pass `--open` to pop a browser, `--port <n>` / `--host <h>` / `--db <path>` to override defaults.

The package also ships an Expo config plugin for native (iOS + Android) wiring. For a full managed-vs-bare setup walkthrough, the config plugin, and rebuilding native, see **[Getting Started](../../docs/getting-started.md)**.

---

## What it captures

|     | Category           | Detail                                                                                                                                                                                                                |
| --- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 💥  | **Crashes**        | JS exceptions + unhandled rejections (burst-coalesced) · native SIGSEGV/abort via signal-safe POSIX handler · persisted across process death, drained on next launch                                                  |
| 🧊  | **ANRs**           | Watchdog-thread detection (5s threshold) · real main-thread stack on iOS via `mach_thread` + `thread_get_state` + FP-chain walk · Android `Looper.getMainLooper().thread.stackTrace` with Zygote/Looper tail trimming |
| 📈  | **Performance**    | Dual-thread FPS (native UI vs JS) · Fabric commit latency · Hermes CPU profiler · frame-drop detection · long-task observer · memory + thermal polling                                                                |
| 🎥  | **Session replay** | PII-masked screenshots in a ring buffer · replay masker (secureTextEntry / accessibility label / testID) · layout snapshot · navigation-triggered visual repro                                                        |
| 🧠  | **Intelligence**   | Signal router (dedup → correlate → confidence → context → dispatch) · built-in pattern library · on-device anomaly detection · MCP server for agents · optional AI Fix PR agent                                       |
| 📡  | **Transport**      | Offline-first batch upload · exponential backoff with jitter · gzip · OpenTelemetry (traces + logs + metrics) export · pluggable backends                                                                             |
| 🛠️  | **Dev tools**      | Terminal warnings in Metro · live WebSocket dashboard · Expo DevTools panel · shake-to-report bug reporter with attachment bundling                                                                                   |
| 🔒  | **Privacy**        | Per-category consent gate · PII sanitizer (email / phone / auth headers / URLs) · Apple Privacy Manifest bundled · DSAR export / delete APIs                                                                          |

---

## Architecture

The pipeline is one direction: collectors on the device feed a router, which feeds an event store, which feeds the surfaces you read from — a dashboard for humans, an MCP server and AI agent for Claude.

```
React Native / Expo app
        │
   ┌────┴───────────────────────────────────────┐
   │  @erne/monitor SDK (on-device)              │
   │  • collectors: crash · ANR · FPS · render · │
   │    network · memory · replay …              │
   │  • signal router: dedup → correlate →       │
   │    confidence → context → dispatch          │
   │  • event store + offline-first transport    │
   └────┬───────────────────────────────────────┘
        │  batch upload (gzip) · OpenTelemetry export
        ▼
  Dashboard server  ──────────►  Dashboard UI  (humans)
  (self-hosted, SQLite/Postgres)   live feed, crash groups, metrics
        │
        ├──────────────────────►  MCP server   (Claude queries crash data)
        └──────────────────────►  AI Fix agent (opens a PR, confidence-gated)
```

In **local-only mode** there is no server at all — events stay on-device and are read through the in-process runtime / Expo DevTools panel.

---

## Tree-shakeable imports

Small bundle, a la carte. Each subpath pulls only the collectors + code it names. Per-subpath size budgets live in [`.size-limit.json`](./.size-limit.json); live measured sizes and transitive imports are in [Bundle analysis](./docs/BUNDLE-ANALYSIS.md).

| Import                      | Contents                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| `@erne/monitor`             | Everything — simplest to wire, biggest bundle                                                     |
| `@erne/monitor/performance` | Render / FrameDrop / Startup / Memory / LongTask / DualThreadFPS / FabricCommit / Hermes profiler |
| `@erne/monitor/network`     | NetworkCollector only                                                                             |
| `@erne/monitor/ai`          | SignalRouter pipeline + pattern library + anomaly detector                                        |
| `@erne/monitor/replay`      | ReplayMasker + capture collectors                                                                 |
| `@erne/monitor/dev`         | TerminalReporter + ExpoDevTools + BugReporter + DashboardBridge                                   |
| `@erne/monitor/testing`     | `generateSyntheticEvent`, `CrashInjector`, `NetworkDegrader`                                      |

---

## Configure

Defaults are production-tuned (quiet at idle, noisy when it matters). Override only what you care about:

```tsx
import { defineMonitorConfig, MonitorProvider } from '@erne/monitor';

const config = defineMonitorConfig({
  sampling: {
    prod: 0.1, // global rate, non-crash events
    byType: {
      render: { prod: 0.01 }, // aggressive down-sample of render events
      network: { prod: 0.5 },
    },
  },
  consent: { crashes: true, analytics: true, replay: false },
  ai: { autoFix: 'suggest', maxFilesPerFix: 5 },
  transport: { endpoint: 'https://ingest.example.com', batchInterval: 60_000 },
});

<MonitorProvider config={config}>…</MonitorProvider>;
```

See the JSDoc on `defineMonitorConfig` in [`src/core/Config.ts`](./src/core/Config.ts) (and `DEFAULT_SAMPLING_BY_TYPE` for every per-type sampling floor).

---

## Performance budgets

The SDK is built to a strict overhead budget (design spec §7). These are **targets enforced by the regression suite**, not marketing numbers:

| Metric                       | Budget                                                 |
| ---------------------------- | ------------------------------------------------------ |
| Additional render time       | < 5%                                                   |
| Additional memory            | < 5 MB                                                 |
| Additional sustained CPU     | < 2%                                                   |
| Bundle size (full SDK, gzip) | ≤ 75 KB — see [`.size-limit.json`](./.size-limit.json) |

Render/memory/CPU overhead is measured with [Reassure](https://callstack.github.io/reassure/) against an SDK-off vs SDK-on baseline (see [`perf/`](./perf)). <!-- TODO: publish measured deltas from the benchmark suite (Task 117.40 / 117.91) once the showcase app baselines land. -->

---

## DSAR API (GDPR)

Tag events with an opaque user id, export them on request, delete them on revoke.

```tsx
import { useMonitor } from '@erne/monitor';

function Settings() {
  const monitor = useMonitor();

  const onLogin = (userId: string) => monitor?.setUserId(userId);
  const onExport = () => monitor?.exportUserData('user-42');
  const onDelete = () => monitor?.deleteUserData('user-42');
  // ...
}
```

`useMonitor()` returns `MonitorRuntime | null` — null during the one-frame boot or outside a `<MonitorProvider>`. Use `useMonitor({ strict: true })` to throw on a missing provider.

---

## Platforms

|                | Min    | Tested up to |
| -------------- | ------ | ------------ |
| React Native   | 0.74   | 0.89         |
| React          | 18.2   | 19.x         |
| Expo SDK       | 51     | 56           |
| iOS            | 15.1   | 18           |
| Android        | API 24 | API 35       |
| Node (tooling) | 20     | 22           |

New Architecture only (Fabric + TurboModules). Peer-dependency ranges are declared in [`package.json`](./package.json).

---

## How it compares

The honest, dated, source-attributed comparisons live in [`docs/compare/`](../../docs/compare/) — one page per tool with a "where _they_ are stronger" section. This is a **feature-presence** summary; it makes **no performance claims** about competitors. Competitor rows reflect public docs **as of 2026** — confirm against each vendor before deciding.

| Capability                                                       | **@erne/monitor**              | Sentry                                  | measure.sh                           | Bitdrift                                  | Firebase Crashlytics       |
| ---------------------------------------------------------------- | ------------------------------ | --------------------------------------- | ------------------------------------ | ----------------------------------------- | -------------------------- |
| RN / Expo first                                                  | ✅ RN/Expo-only by design      | ➖ one of many platforms                | ➖ native-first; RN via wrapper ⚠️   | ➖ native-first; RN via binding ⚠️        | ➖ via RNFirebase wrapper  |
| Self-host the **whole** stack                                    | ✅ default; MIT                | ➖ self-hosted distro (SaaS-primary) ⚠️ | ✅ self-hostable (verify license ⚠️) | ➖ SDK OSS; backend SaaS-primary ⚠️       | ❌ Google-managed only     |
| Local-only / no backend                                          | ✅ on-device mode              | ❌                                      | ⚠️ verify                            | ➖ on-device buffer, hosted control plane | ❌                         |
| Crash reporting                                                  | ✅                             | ✅                                      | ✅                                   | ⚠️ verify                                 | ✅                         |
| RN-specific perf (re-render / Fabric / dual-thread FPS / Hermes) | ✅                             | ➖ general perf tracing                 | ➖ native-first                      | ➖ native-first                           | ➖ general perf monitoring |
| Session replay                                                   | ✅ PII-masked screenshots      | ✅                                      | ⚠️ timeline views                    | ⚠️ log-centric, verify visual             | ❌ ⚠️                      |
| OpenTelemetry export                                             | ✅ traces + logs + metrics     | ✅                                      | ⚠️ verify                            | ⚠️ verify                                 | ❌ (BigQuery export) ⚠️    |
| MCP server (Claude-native)                                       | ✅                             | ❌                                      | ❌                                   | ❌                                        | ❌                         |
| AI agent opens a fix PR                                          | ✅ confidence-gated            | ➖ in-product AI ⚠️                     | ❌ ⚠️                                | ❌ ⚠️                                     | ➖ console AI insights ⚠️  |
| Pricing                                                          | Free (MIT); run your own infra | Usage-based SaaS (free tier) ⚠️         | OSS / self-host ⚠️                   | SaaS for hosted service ⚠️                | Free (Crashlytics)         |

Legend: ✅ yes · ❌ no · ➖ partial / different model · ⚠️ unverified — see the linked page.

> **Where the alternatives win.** Each comparison page is explicit about it: Sentry's maturity, breadth, and cross-stack tracing; Firebase's free zero-ops reliability; measure.sh's native depth; Bitdrift's retroactive, server-controlled on-device logging. If one of those is your core need, that tool may be the better fit — the pages say so plainly.

Read the full pages: **[vs Sentry](../../docs/compare/sentry.md)** · **[vs measure.sh](../../docs/compare/measure.md)** · **[vs Bitdrift](../../docs/compare/bitdrift.md)** · **[vs Firebase Crashlytics](../../docs/compare/firebase.md)** · [overview & rubric](../../docs/compare/README.md).

---

## CLI

```
npx @erne/monitor init [--dry-run]                 # wire the SDK into your app (idempotent)
npx @erne/monitor dashboard [--port <n>] [--host <h>] [--db <path>] [--open]
npx @erne/monitor scan [path] [--json]             # recommend collectors from your source
npx @erne/monitor doctor [path] [--ping [url]]     # validate your integration end-to-end
npx @erne/monitor monitor live [--url <u>] [--api-key <k>] [--no-color]   # tail events in the terminal
```

The package exposes the `erne-monitor` bin; `npx @erne/monitor <command>` resolves it from your install.

---

## Examples

- [`examples/minimal-demo`](./examples/minimal-demo) — single-screen Expo app, every crash / ANR / network trigger surfaced as a button. Used by Maestro chaos flows.
- [`examples/full-showcase`](./examples/full-showcase) — 3-tab demo with Feed (FlashList + expo-image + fetch), Live Stats (reads `__ERNE_MONITOR__`), Settings (consent + DSAR + chaos + network degrader), detail screen with Suspense + render-storm button.

---

## Docs

- **[Getting Started](../../docs/getting-started.md)** — full setup, config plugin, native rebuild
- Migrating: [from Sentry](./docs/MIGRATING-FROM-SENTRY.md) · [from Crashlytics](./docs/MIGRATING-FROM-CRASHLYTICS.md)
- [Bundle analysis](./docs/BUNDLE-ANALYSIS.md) — live per-subpath sizes + transitive imports
- [Comparisons](../../docs/compare/README.md) — dated, source-attributed competitor pages
- [Self-hosted → ERNE Cloud (roadmap)](../../docs/migration/oss-to-cloud.md) · [portable data-export format](../../docs/migration/data-export-format.md)
- [Release channels](../../docs/releasing/channels.md) · [CHANGELOG](./CHANGELOG.md)
- Source-level reference: `src/core/Config.ts` · `src/core/createMonitorRuntime.ts` · `src/signal-router/SignalRouter.ts` · `src/native/ErneMonitorNative.ts`
- Collector catalog: every collector lives in [`src/collectors/`](./src/collectors) with JSDoc on its options, events, and edge cases

---

## License

MIT © [Juba Kitiashvili](https://github.com/JubaKitiashvili). See [LICENSE](../../LICENSE).
