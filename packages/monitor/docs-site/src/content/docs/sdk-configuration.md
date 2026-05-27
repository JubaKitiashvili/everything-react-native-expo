---
title: SDK configuration
description: Configure @erne/monitor collectors, sampling, consent, PII sanitization, and remote config.
---

The SDK ships with production-tuned defaults — quiet at idle, noisy when it
matters. Override only what you care about with `defineMonitorConfig`, then pass
the result to `<MonitorProvider config={…}>`.

```tsx
import { defineMonitorConfig, MonitorProvider } from '@erne/monitor';

const config = defineMonitorConfig({
  sampling: {
    prod: 0.1, // global rate for non-crash events
    byType: {
      render: { prod: 0.01 }, // aggressively down-sample render events
      network: { prod: 0.5 },
    },
  },
  consent: { crashes: true, analytics: true, replay: false },
  ai: { autoFix: 'suggest', maxFilesPerFix: 5 },
  transport: { endpoint: 'https://ingest.example.com', batchInterval: 60_000 },
});

<MonitorProvider config={config}>{/* app tree */}</MonitorProvider>;
```

`defineMonitorConfig` deep-merges your overrides with the defaults, validates
every field (throwing a descriptive error on invalid input), and returns a
deeply-frozen config.

## Collectors

Each collector is set to a `CollectorMode`: `true` (always on), `false` (always
off), `'dev'` (on only when `__DEV__`), or `'prod'` (on only in release). Set
them under `collectors`:

```tsx
defineMonitorConfig({
  collectors: {
    crash: true,
    network: true,
    navigation: true,
    custom: true,
    render: 'dev',
    frameDrop: 'dev',
    state: 'dev',
    a11y: 'dev',
    memory: true,
    startup: true,
    replay: 'dev',
  },
});
```

The values above are the shipped defaults. The full collector catalogue lives in
the SDK source under `src/collectors/` (each collector documents its options,
events, and edge cases in JSDoc). Categories include:

- **Crash / ANR** — JS exceptions + unhandled rejections, native crash handler,
  ANR watchdog.
- **Network** — request/response timing and status.
- **Render** — re-render storms and commit churn (fires on every commit, so it
  is down-sampled hard by default).
- **Performance / native** — dual-thread FPS, Fabric commit latency, Hermes CPU
  profiler, frame drops, long tasks, memory, startup, thermal.
- **Pipeline / UX** — navigation, breadcrumbs, frustration, touch, suspense,
  RSC, activity, image, storage, state, accessibility.

:::note
Collectors enabled with `'dev'` only run in development. Production builds stay
lean by default — opt heavy collectors into `'prod'` only when you need them.
:::

### Tree-shakeable imports

Import a subpath to pull only the collectors and code it names, so you pay only
for what you use:

| Import                      | Contents                                                                  |
| --------------------------- | ------------------------------------------------------------------------- |
| `@erne/monitor`             | Everything — simplest to wire, biggest bundle.                            |
| `@erne/monitor/performance` | Render / FrameDrop / Startup / Memory / LongTask / DualThreadFPS / Fabric / Hermes profiler. |
| `@erne/monitor/network`     | NetworkCollector only.                                                    |
| `@erne/monitor/ai`          | SignalRouter pipeline + pattern library + anomaly detector.               |
| `@erne/monitor/replay`      | ReplayMasker + capture collectors.                                        |
| `@erne/monitor/dev`         | TerminalReporter + ExpoDevTools + BugReporter + DashboardBridge.          |
| `@erne/monitor/testing`     | `generateSyntheticEvent`, `CrashInjector`, `NetworkDegrader`.             |

## Sampling

Sampling has a global `dev` / `prod` rate plus per-type overrides under
`byType`. Each rate is a probability in `[0, 1]`. Crash-class events are kept
regardless of the global rate.

```tsx
defineMonitorConfig({
  sampling: {
    dev: 1.0,
    prod: 0.1,
    byType: {
      render: { dev: 0.05, prod: 0.01 },
      network: { dev: 1.0, prod: 0.5 },
      navigation: { dev: 1.0, prod: 1.0 },
    },
  },
});
```

The defaults are tuned so a static screen emits very few events in prod even
with every collector on — chatty types (`render`, `frame_drop`) are
down-sampled hard, while rare-but-important types (`navigation`, `crash`,
`custom`) stay at `1.0`. The complete per-type floor table is exported as
`DEFAULT_SAMPLING_BY_TYPE` (see `src/core/Config.ts`).

## Consent

Per-category consent gates what is collected. Crashes are on by default;
analytics and replay are opt-in.

```tsx
defineMonitorConfig({
  consent: {
    crashes: true, // default true
    analytics: false, // default false
    replay: false, // default false
    doNotSell: true, // optional — CCPA "do not sell" signal
  },
});
```

You can also flip consent at runtime through the runtime returned by
`useMonitor()`.

## PII sanitization

The SDK runs an on-device `Sanitizer` over every string field before storing or
sending. Out of the box it redacts **emails, phone numbers, auth headers
(Bearer / Basic / JWTs), and sensitive URL query parameters**. URLs are
re-serialized with sensitive params stripped rather than dropped wholesale.

Extend it with extra patterns, header names, query-param names, or sensitive
object-key names via `SanitizerOptions`:

```tsx
import { Sanitizer } from '@erne/monitor';

const sanitizer = new Sanitizer({
  patterns: [/internal-token-[a-z0-9]+/g], // extra regexes over every string
  headers: ['x-internal-auth'], // extra header names (case-insensitive)
  queryParams: ['session'], // extra URL params (case-insensitive)
  // sensitive object-key names whose values are always redacted
});

// Register more patterns later, at runtime:
sanitizer.addPatterns([/ssn-\d{3}-\d{2}-\d{4}/g]);
```

Sanitization runs **on-device, before transport** — redacted data never leaves
the app.

## Remote config

The dashboard can push a small runtime config that the SDK polls and applies
without an app update. The applied shape is:

```ts
interface RemoteConfig {
  sampling: Record<string, number>; // per-type rates in [0,1]; `default` key applies to unlisted types
  piiRules: string[]; // extra redaction patterns / sensitive key names
  featureFlags: Record<string, boolean>; // named runtime toggles
  updatedAt: number; // ms timestamp of the last server write (0 = never)
}
```

The SDK's apply path is total — a malformed section falls back to its default and
out-of-range sampling rates are clamped into `[0, 1]`, so a bad server config can
never throw into your app. A missing rate for a type means "sample everything".

## AI

The `ai` block controls the on-device intelligence and the (separate) fix-PR
agent's behaviour:

```tsx
defineMonitorConfig({
  ai: {
    crashExplainer: true, // default true
    autoFix: 'suggest', // 'suggest' | 'apply' | 'off' (default 'suggest')
    maxFilesPerFix: 5, // cap files a proposed fix may touch (default 5)
  },
});
```

See [MCP integration](/mcp-integration/) for how an agent reads this data and
opens a fix PR.

## Transport

```tsx
defineMonitorConfig({
  transport: {
    endpoint: null, // null = local-only / no upload (default)
    batchInterval: 60_000, // ms between batch uploads (default 60s)
    maxBatchSize: 100, // events per batch (default 100)
  },
});
```

Transport is offline-first: events are queued, batched, gzipped, and uploaded
with exponential backoff and jitter. When `endpoint` is `null` the SDK runs in
**local-only mode** — nothing is uploaded. To stream to a local dashboard in dev,
prefer the `dashboardUrl` prop on `<MonitorProvider>` (see
[Getting started](/getting-started/)).

## Source-level reference

The authoritative reference is the JSDoc on `defineMonitorConfig` in
`src/core/Config.ts`, plus `DEFAULT_SAMPLING_BY_TYPE` for every per-type
sampling floor.
