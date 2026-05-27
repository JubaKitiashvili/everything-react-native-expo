# Bundle Analysis

> Auto-generated from `dist/` after `npm run build`. Do not edit by hand —
> run `npm run analyze` to regenerate. CI fails on any mismatch.

`@erne/monitor` ships six tree-shakeable entry points. Consumers
who import from a subpath only pay for what they use. The main
entry re-exports every public symbol — it's the biggest bundle,
always — but it's also the simplest to wire.

## Summary

| Entry | Files | Raw (KB) | Gzip (KB) | Budget (KB) | Status |
| ----- | ----: | -------: | --------: | ----------: | :----- |
| `main` | 73 | 346.70 | 83.66 | 85 | ok |
| `/performance` | 11 | 36.35 | 7.01 | 20 | ok |
| `/network` | 2 | 8.09 | 2.36 | 5 | ok |
| `/ai` | 13 | 47.13 | 11.08 | 30 | ok |
| `/replay` | 5 | 13.73 | 3.57 | 10 | ok |
| `/bug-reports` | 2 | 4.98 | 1.75 | 5 | ok |
| `/dev` | 5 | 18.39 | 4.91 | 15 | ok |
| `/testing` | 5 | 20.06 | 6.21 | 10 | ok |

## Largest files (main entry)

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/core/createMonitorRuntime.js` | 36.64 | 9.75 |
| `dist/processors/Sanitizer.js` | 11.72 | 4.42 |
| `dist/processors/CcpaGate.js` | 10.82 | 3.99 |
| `dist/signal-router/PatternLibrary.js` | 11.55 | 2.84 |
| `dist/native/ErneMonitorNative.js` | 13.10 | 2.81 |
| `dist/core/CrashLoopGuard.js` | 7.93 | 2.61 |
| `dist/core/Config.js` | 8.77 | 2.49 |
| `dist/remote-config/RemoteConfig.js` | 7.07 | 2.40 |
| `dist/collectors/NetworkCollector.js` | 7.80 | 2.26 |
| `dist/storage/EventStore.js` | 8.62 | 2.24 |
| `dist/remote-config/RemoteConfigClient.js` | 5.94 | 2.22 |
| `dist/remote-config/RemoteConfigApplier.js` | 5.50 | 2.19 |
| `dist/collectors/CrashCollector.js` | 6.79 | 2.12 |
| `dist/core/OfflineQueue.js` | 5.89 | 2.08 |
| `dist/collectors/ActionsCollector.js` | 5.43 | 2.00 |

## Per-subpath breakdown

### `@erne/monitor/performance`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/collectors/RenderCollector.js` | 5.76 | 1.73 |
| `dist/collectors/FrameDropCollector.js` | 5.60 | 1.53 |
| `dist/collectors/native/HermesProfilerCollector.js` | 3.82 | 1.20 |
| `dist/collectors/ActivityCollector.js` | 4.04 | 1.15 |
| `dist/collectors/LongTaskCollector.js` | 3.89 | 1.13 |
| `dist/collectors/SuspenseCollector.js` | 2.66 | 1.00 |
| `dist/collectors/MemoryCollector.js` | 2.85 | 0.99 |
| `dist/collectors/native/DualThreadFPSCollector.js` | 2.33 | 0.92 |
| `dist/collectors/StartupCollector.js` | 2.40 | 0.79 |
| `dist/collectors/native/FabricCommitCollector.js` | 1.93 | 0.74 |
| …1 more | — | — |

### `@erne/monitor/network`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/collectors/NetworkCollector.js` | 7.80 | 2.26 |
| `dist/exports/network.js` | 0.29 | 0.22 |

### `@erne/monitor/ai`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/signal-router/PatternLibrary.js` | 11.55 | 2.84 |
| `dist/intelligence/AnomalyDetector.js` | 4.97 | 1.44 |
| `dist/intelligence/OTAUpdater.js` | 5.56 | 1.41 |
| `dist/signal-router/SignalRouter.js` | 3.71 | 1.16 |
| `dist/signal-router/DedupEngine.js` | 3.65 | 1.10 |
| `dist/signal-router/CorrelationEngine.js` | 2.88 | 1.06 |
| `dist/intelligence/PatternSync.js` | 3.00 | 0.90 |
| `dist/signal-router/DispatchEngine.js` | 2.33 | 0.82 |
| `dist/signal-router/ConfidenceScorer.js` | 2.09 | 0.78 |
| `dist/signal-router/ContextBuilder.js` | 2.27 | 0.78 |
| …3 more | — | — |

### `@erne/monitor/replay`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/collectors/native/VisualReproCollector.js` | 4.27 | 1.36 |
| `dist/collectors/native/ReplayCollector.js` | 3.86 | 1.26 |
| `dist/processors/ReplayMasker.js` | 2.81 | 0.94 |
| `dist/collectors/native/LayoutSnapshotCollector.js` | 2.10 | 0.86 |
| `dist/exports/replay.js` | 0.69 | 0.35 |

### `@erne/monitor/bug-reports`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/integrations/BugReportChannel.js` | 4.58 | 1.60 |
| `dist/exports/bug-reports.js` | 0.40 | 0.29 |

### `@erne/monitor/dev`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/integrations/DashboardBridge.js` | 6.27 | 1.97 |
| `dist/integrations/TerminalReporter.js` | 3.59 | 1.30 |
| `dist/integrations/ExpoDevToolsPlugin.js` | 4.34 | 1.16 |
| `dist/integrations/BugReporter.js` | 3.56 | 1.12 |
| `dist/exports/dev.js` | 0.63 | 0.36 |

### `@erne/monitor/testing`

| File | Raw (KB) | Gzip (KB) |
| ---- | -------: | --------: |
| `dist/testing/generateSyntheticEvent.js` | 7.04 | 2.65 |
| `dist/testing/matchers.js` | 5.22 | 1.59 |
| `dist/testing/CrashInjector.js` | 3.50 | 1.32 |
| `dist/testing/NetworkDegrader.js` | 3.58 | 1.31 |
| `dist/exports/testing.js` | 0.72 | 0.42 |

## How to interpret

- **Raw** is the concatenated size of every `.js` file reached
  from this entry (sum of on-disk bytes, no minification).
- **Gzip** is the true over-the-wire cost — Metro + Hermes both
  gzip their delivery; this is the number consumers actually pay.
- **Budget** is the ceiling enforced by `scripts/check-bundle-size.js`.
  Regressions fail the `monitor / performance budget` CI workflow.

A tree-shaking bundler (Metro in RN, esbuild/Rollup on web) will
drop everything the consumer doesn't import — so real app impact
is almost always smaller than the numbers above.
