# How much does `@erne/monitor` cost your app?

> **Honesty note.** This post separates what is **measured** from what is a
> **target**. Every number below is labeled as one of three things:
>
> - ✅ **Measured** — a real number produced by a command you can re-run, with the
>   command cited.
> - 🎯 **Budget / target** — a ceiling from the design spec. It is the number we
>   commit not to exceed; it is **not** a measurement of current behavior.
> - ⏳ **Pending** — a measurement the harness will produce but has not yet, with a
>   `TODO`.
>
> If a number is not labeled ✅, do not cite it as a measured result. We would
> rather publish a smaller set of honest numbers than a larger set of impressive
> ones.

`@erne/monitor` is a runtime monitoring SDK for React Native / Expo. An SDK that
watches your app for jank, crashes, and slow renders is only worth running if it
does not become the jank it is meant to catch. This post documents exactly what
we measure, what we have measured so far, and what is still pending — so you can
reproduce all of it yourself.

---

## 1. Methodology

There are two distinct costs an SDK imposes, and they are measured completely
differently:

| Cost                 | What it is                                          | How we measure it                                                                                   |
| -------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| **Bundle size**      | Bytes the SDK adds to your JS bundle                | `size-limit` + a bundle-analysis script over the compiled `dist/`. **Real today.**                  |
| **Runtime overhead** | Extra render time / CPU / memory while the app runs | Reassure SDK-on vs SDK-off render deltas in a real RN renderer. **Harness not yet wired — see §3.** |

### 1.1 Runtime overhead methodology (the intended harness)

The runtime measurement is built on
[Reassure](https://callstack.github.io/reassure/). The approach, per
[`packages/monitor/perf/README.md`](../../packages/monitor/perf/README.md), is a
paired comparison:

1. **SDK-off baseline** — a component tree rendered with no SDK attached.
2. **SDK-on** — the _same_ tree wrapped in `<MonitorProvider>` with default
   config.

The reported delta between the two runs is what the SDK costs a consumer. Three
scenarios are defined:

- **`provider-overhead`** — mount + re-render cost of `<MonitorProvider>` around
  a trivial tree.
- **`list-render`** — cost when a `FlatList` of 100 items renders under the SDK
  with the production sampler defaults.
- **`crash-collection`** — cost of `CrashCollector` being attached when an error
  boundary catches a thrown render error (JS pipeline only; the native signal
  handler and on-disk persistence are verified separately via Maestro chaos
  tests, not Reassure).

**Device / conditions for reproducibility:** Reassure compares a baseline run and
a current run, so the only hard requirement is that **both runs execute on
identical hardware** (the same CI agent, or the same local machine, with nothing
else competing for CPU). Reassure discards warmup runs and filters statistical
outliers; each scenario above declares its own `runs` / `warmupRuns` counts in
its test file. Reassure needs a real React Native renderer, which is why these
tests are designed to run inside an Expo example app rather than in the SDK's
plain `ts-jest` unit-test environment.

### 1.2 Bundle-size methodology (real today)

Bundle size is measured two ways, both over the actual compiled output in
`dist/`:

- **`size-limit`** enforces a per-entry gzip ceiling — the config lives in
  [`packages/monitor/.size-limit.json`](../../packages/monitor/.size-limit.json).
- **`scripts/generate-bundle-analysis.js`** walks the import graph from each
  public entry point, sums the on-disk bytes (raw) and the gzipped bytes, and
  writes [`packages/monitor/docs/BUNDLE-ANALYSIS.md`](../../packages/monitor/docs/BUNDLE-ANALYSIS.md).
  The same script run with `--check` fails CI if the committed numbers drift from
  reality, which is what keeps the published figures honest.

The gzip column is the number that matters: Metro and Hermes both gzip their
delivery, so gzip is what your users actually download.

---

## 2. Measured numbers: bundle size ✅

These are **real, reproducible measurements** of the compiled SDK. They were
re-verified for this post by running:

```bash
cd packages/monitor
node scripts/generate-bundle-analysis.js --check
# → "[@erne/monitor] docs/BUNDLE-ANALYSIS.md is up to date." (exit 0)
```

That exit-0 confirms the table below matches the bytes currently in `dist/`.

| Entry                       | Files | Raw (KB) | **Gzip (KB)** | Budget (KB) | Status |
| --------------------------- | ----: | -------: | ------------: | ----------: | :----- |
| `@erne/monitor` (main)      |    73 |   346.70 |     **83.66** |          85 | ✅ ok  |
| `@erne/monitor/performance` |    11 |    36.35 |      **7.01** |          20 | ✅ ok  |
| `@erne/monitor/network`     |     2 |     8.09 |      **2.36** |           5 | ✅ ok  |
| `@erne/monitor/ai`          |    13 |    47.13 |     **11.08** |          30 | ✅ ok  |
| `@erne/monitor/replay`      |     5 |    13.73 |      **3.57** |          10 | ✅ ok  |
| `@erne/monitor/dev`         |     5 |    18.39 |      **4.91** |          15 | ✅ ok  |
| `@erne/monitor/testing`     |     5 |    20.06 |      **6.21** |          10 | ✅ ok  |

Source: [`packages/monitor/docs/BUNDLE-ANALYSIS.md`](../../packages/monitor/docs/BUNDLE-ANALYSIS.md)
(auto-generated, CI-enforced).

**How to read this:**

- The full all-in-one entry is **~84 KB gzipped**. That is the worst case — the
  simplest wiring, the biggest bundle. (Optional collectors + dev integrations
  are lazy-loaded out of the static graph; crash/ANR/network/render stay eager.)
- The SDK ships **seven tree-shakeable entry points**. If you import only a
  subpath, you pay only for it: `@erne/monitor/network` is **~2.4 KB gzipped**,
  `/performance` is **~7 KB gzipped**.
- These figures **exclude** `react`, `react-native`, `expo`, and
  `expo-modules-core` (they are peer dependencies you already ship — see the
  `ignore` list in `.size-limit.json`), so this is the SDK's _own_ added weight.
- Real app impact is usually **smaller** than the table: a tree-shaking bundler
  (Metro in RN) drops everything you do not import.

> Task 117.107 lazy-loaded the optional instrumentation collectors + dev
> integrations out of the main static graph (loaded before any collector
> starts, so no events are missed), bringing the main entry from ~94 KB down to
> 83.66 KB against an 85 KB ceiling.

---

## 3. Runtime overhead: budgets today, measurements pending ⏳

This is the section where honesty matters most. **The Reassure perf suite is
currently a set of stubs, not measurements.**

The proof is in the repo itself —
[`packages/monitor/perf/README.md`](../../packages/monitor/perf/README.md) ends
with:

> "These files are stubs — the real tests land when `examples/full-showcase`
> (Task 88) is wired up."

And each `.perf-test.tsx` file carries a header such as:

> "This file is a spec for the real test that runs in `examples/full-showcase`
> where a React Native renderer is available."

Confirmed independently while writing this post:

- `reassure` is **not** installed in the `@erne/monitor` package and is not in
  its Jest config.
- The `examples/full-showcase` app the harness is meant to run inside **does not
  exist yet**.

So the suite cannot produce SDK-on-vs-off deltas right now. What we _do_ have is
a set of **budgets** — design-spec targets the SDK commits not to exceed:

| Metric                     | 🎯 Budget (target — NOT a measurement)                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------- |
| Additional render time     | < 5% vs SDK-off baseline                                                                            |
| Additional memory          | < 5 MB                                                                                              |
| Additional CPU (sustained) | < 2%                                                                                                |
| Additional bundle size     | Per [`.size-limit.json`](../../packages/monitor/.size-limit.json) — and _this_ one is measured (§2) |

Source for the budgets: [`packages/monitor/perf/README.md`](../../packages/monitor/perf/README.md)
(design spec §7).

> ⏳ **TODO: measured runtime deltas are pending the benchmark harness.** Until
> `examples/full-showcase` (Task 88) is wired up and the Reassure suite runs
> against a real RN renderer, the render-time / memory / CPU rows above are
> **targets, not results.** Do not cite them as measured overhead. When the
> harness lands, this section will be replaced with ✅ measured deltas for the
> `provider-overhead`, `list-render`, and `crash-collection` scenarios.

---

## 4. Comparison vs other tools (feature / architecture only)

> **This is a feature and architecture comparison, not a head-to-head
> performance benchmark.** We do **not** publish overhead numbers for Sentry,
> measure.sh, Bitdrift, or Firebase Crashlytics, because we cannot run their SDKs
> under the same harness fairly — different native code, different sampling
> defaults, different feature surfaces. The overhead numbers in §2–§3 are
> **`@erne/monitor`-only**. Any cross-tool comparison here is about _design and
> capabilities_, dated **as of 2026**, and sourced from each vendor's public docs.

The full, per-tool comparisons (with every unverifiable competitor claim flagged
⚠️) live in [`docs/compare/`](../compare/README.md):

- [vs Sentry](../compare/sentry.md) — the default RN crash + perf + replay SaaS
- [vs measure.sh](../compare/measure.md) — an open-source, self-hostable mobile
  observability tool
- [vs Bitdrift](../compare/bitdrift.md) — real-time, server-controlled on-device
  log capture
- [vs Firebase Crashlytics](../compare/firebase.md) — free, Google-backed crash
  reporting

### Where `@erne/monitor` is architecturally different

- **Self-hosted by default / local-only option.** There is no vendor ingestion
  endpoint to point a DSN at today. You run the MIT-licensed dashboard yourself,
  or run with no backend at all. Sentry, Bitdrift, and Crashlytics are
  primarily hosted; measure.sh is the closest peer on self-hosting.
- **React-Native-first internals.** The differentiating signals — re-render
  storm detection, Fabric commit latency, dual-thread (native UI vs JS) FPS, and
  Hermes CPU profiling — are RN-specific and would not have a meaningful analogue
  in a native-first SDK.
- **AI / MCP loop.** A Model Context Protocol server lets an agent query crash
  data directly, and a confidence-gated AI agent can open a fix PR against your
  repo.
- **OpenTelemetry-native.** Traces, logs, and metrics export as OTel, so the data
  is not tied to one vendor's ecosystem.

### Where the alternatives are genuinely stronger

These are honest, not token concessions:

- **Sentry** — a decade of maturity, dozens of platforms, cross-stack tracing
  with first-party backend SDKs, hosted operations (nothing to run), and an
  ingestion tier engineered for very high event volumes.
- **measure.sh** — deeper native Android/iOS SDKs; a better fit if your fleet is
  predominantly native or spans native + RN apps.
- **Bitdrift** — purpose-built for retroactive, server-controlled on-device
  logging ("turn up verbose logs for one user's session, live, without a
  release") and high-volume real-time streaming.
- **Firebase Crashlytics** — free, zero-ops, battle-tested across billions of
  devices, with tight Firebase/GCP ecosystem integration.

Migration guides exist for the two most common starting points:
[from Sentry](../../packages/monitor/docs/MIGRATING-FROM-SENTRY.md) and
[from Crashlytics](../../packages/monitor/docs/MIGRATING-FROM-CRASHLYTICS.md).

---

## 5. Reproduce it yourself

### Bundle size ✅ (works today)

```bash
cd packages/monitor
npm run build                # compile dist/

# Verify the published bundle-analysis numbers match dist/ exactly:
node scripts/generate-bundle-analysis.js --check

# Regenerate the analysis doc from scratch:
npm run analyze              # → docs/BUNDLE-ANALYSIS.md

# Enforce the per-entry gzip ceilings:
npm run check:bundle-size    # size-limit against .size-limit.json
```

If your machine produces different gzip figures than §2, that is itself useful
signal — please [open an issue](https://github.com/JubaKitiashvili/everything-react-native-expo/issues)
with your Node version and platform.

### Runtime overhead ⏳ (pending the harness)

Once `examples/full-showcase` (Task 88) is wired up, the documented procedure
([`perf/README.md`](../../packages/monitor/perf/README.md)) is:

```bash
cd examples/full-showcase
npx expo install reassure
yarn reassure --baseline     # capture the SDK-off / prior baseline
yarn reassure                # measure current, diff against baseline
```

Run both the baseline and the current measurement on **the same hardware** so the
delta reflects the SDK and not the machine. Until that app exists, these commands
will not produce a result — which is exactly why §3 publishes budgets, not
measurements.

---

## Summary

| What                                | Status           | Number                          |
| ----------------------------------- | ---------------- | ------------------------------- |
| Full SDK bundle (gzip)              | ✅ measured      | **83.66 KB**                    |
| Smallest subpath (`/network`, gzip) | ✅ measured      | **2.36 KB**                     |
| `/performance` subpath (gzip)       | ✅ measured      | **7.01 KB**                     |
| Additional render time              | 🎯 budget        | < 5% (target, not measured)     |
| Additional memory                   | 🎯 budget        | < 5 MB (target, not measured)   |
| Additional sustained CPU            | 🎯 budget        | < 2% (target, not measured)     |
| SDK-on vs SDK-off render deltas     | ⏳ pending       | TODO — harness (Task 88)        |
| Competitor head-to-head perf        | ❌ not published | We cannot run their SDKs fairly |

The bundle weight is real and reproducible. The runtime overhead targets are
real _commitments_ but not yet real _measurements_ — and we will not pretend
otherwise until the harness produces them.
