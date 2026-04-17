# Changelog

All notable changes to `@erne/monitor` are documented here. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and
this project adheres to [Semantic Versioning](https://semver.org/).

## Versioning policy

- **Major** — breaking API changes, event-shape changes that consumer
  code must adapt to, minimum supported peer dependencies raised.
- **Minor** — new collectors, new subpath exports, new public APIs
  that don't break existing call sites.
- **Patch** — bug fixes, native-code regressions, performance
  improvements without shape changes.

Event type strings (`'crash'`, `'network'`, `'frame_drop'`, etc.) are
part of the public API — renaming any of them is a major bump. Event
`data` shapes are also public: adding optional fields is a minor bump,
removing or renaming is major.

---

## [Unreleased]

Nothing pending.

---

## [1.0.0] — 2026-04-18

First stable release. Feature-complete SDK with production-tuned
defaults, measured performance budget, iOS Privacy Manifest, GDPR
DSAR APIs, and six tree-shakeable subpath exports.

### Added

- **Core SDK** — `MonitorProvider`, `MonitorClient`, `createMonitorRuntime`,
  `defineMonitorConfig`, `SignalBus`, `SessionManager`,
  `EventStore` with pluggable backends (memory + expo-sqlite).
- **Collectors** — Crash · Network · Navigation · Custom · Render ·
  FrameDrop · Startup · Memory · LongTask · Breadcrumb ·
  TouchBoundary · Frustration · State · Suspense · Activity · Image ·
  A11y · Storage · DualThreadFPS · FabricCommit · HermesProfiler ·
  Replay · LayoutSnapshot · VisualRepro · RSC.
- **Processors** — Sanitizer (PII scrubbing) · Enricher (context
  envelope) · Fingerprinter (crash hashing) · AdaptiveSampler
  (per-type `byType` rates, battery/CPU degradation) · BurstThrottle
  (composite-key rate limiting) · ConsentGate (per-category GDPR
  gate) · ReplayMasker.
- **SignalRouter** — DedupEngine · CorrelationEngine · ConfidenceScorer
  · ContextBuilder · DispatchEngine · FeedbackTracker ·
  PatternLibrary (20 built-in RN patterns) · AnomalyDetector · OTA
  pattern/model updates · MTTR/DORA metrics.
- **Native** (iOS + Android) — signal-safe POSIX crash handler ·
  ANR watchdog with real main-thread stack capture (iOS mach_thread,
  Android Looper) · NativeMetrics (CPU, memory, thermal, battery,
  disk) · SpanSnapshot (cross-session span persistence) ·
  DualThreadFPS · FabricCommitTracker · ReplayCapture · LayoutSnapshot
  · Hermes CPU profiler bridge · ShakeDetector.
- **Transport** — BatchTransport (offline-first, exponential backoff,
  gzip, consent gate) · OTelExporter (OTLP/HTTP — traces/logs/metrics).
- **Plugin** — `@erne/monitor/plugin` Expo config plugin (iOS + Android
  native wiring) · `@erne/monitor/plugin/privacy` (privacy manifest).
- **Subpath exports** — `@erne/monitor/performance`, `/network`,
  `/ai`, `/replay`, `/dev`, `/testing`.
- **Testing helpers** — `generateSyntheticEvent`,
  `generateSyntheticEventBatch`, `isSyntheticEvent`, `CrashInjector`,
  `NetworkDegrader`.
- **DSAR API** — `monitor.setUserId(id)` · `monitor.exportUserData(id)`
  · `monitor.deleteUserData(id)` (GDPR compliance).
- **Apple Privacy Manifest** — `ios/PrivacyInfo.xcprivacy` bundled via
  CocoaPods `resource_bundles`; declares Crash/Performance/Other
  Diagnostic data collection (linked=no, tracking=no, purpose=
  AppFunctionality) + DiskSpace (85F4.1) + FileTimestamp (C617.1)
  required-reason APIs.
- **CI enforcement** — bundle size budget (gzip, per subpath) ·
  declaration map completeness · expo-module autolink sanity ·
  peerDependencies audit · README parity with package.json.
- **Examples** — `examples/minimal-demo` (Maestro chaos target),
  `examples/full-showcase` (3-tab demo with every collector).
- **Maestro chaos suite** — 6 flows (JS crash / native crash / ANR /
  crash loop / span crash / offline queue).

### Measured performance

Gzipped JS bundle (subpath / size / budget):

| Entry                    |  Size | Budget |
| ------------------------ | ----: | -----: |
| main                     | 67 KB |  75 KB |
| `/performance`           |  7 KB |  20 KB |
| `/network`               |  2 KB |   5 KB |
| `/ai`                    | 11 KB |  30 KB |
| `/replay`                |  4 KB |  10 KB |
| `/dev`                   |  5 KB |  15 KB |
| `/testing`               |  5 KB |  10 KB |

CPU, memory, and startup-impact budgets verified on iPhone 17 Pro
simulator (see `perf/README.md`).

### Platform support

- React Native 0.74 – 0.89 (New Architecture only)
- React 18.2 – 19.x
- Expo SDK 51 – 56
- iOS 15.1 – 18
- Android API 24 (SDK 35) – API 35
- Node 20+ (tooling)

### Breaking changes vs. 0.x previews

- `FrameDropCollector` emits `type: 'frame_drop'` with a flat payload
  (previously nested as `type: 'render'` with `data.frameDrop`). Update
  consumers that filtered on the nested shape.
- `RenderCollector` now drops non-storm, non-slow buckets by default.
  Set `emitOnlyInteresting: false` to restore the 0.x behavior.
- `CrashCollector` defaults `allRejections: false` (previously `true`).
  `.catch()`ed rejections no longer surface as crashes.
- `AdaptiveSampler` per-type `byType` rates are populated by default —
  consumers that relied on the global `sampling.prod` rate applying
  uniformly should either override `byType` or accept the tighter
  defaults.
- `MonitorConfig.sampling.byType` is now a required field (populated
  automatically by `defineMonitorConfig`).

[1.0.0]: https://github.com/JubaKitiashvili/everything-react-native-expo/releases/tag/monitor-v1.0.0
[Unreleased]: https://github.com/JubaKitiashvili/everything-react-native-expo/compare/monitor-v1.0.0...HEAD
