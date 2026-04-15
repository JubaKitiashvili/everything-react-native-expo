# @erne/monitor — Implementation Tracker

> ★ ყოველი სესიის დასაწყისში ეს ფაილი პირველი წაიკითხე. ★

**Last updated:** 2026-04-15
**Current Phase:** Phase 2b — Native Advanced in progress
**Active Task:** Phase 4 Task 63 — next session
**Overall Progress:** 62/70 tasks (Phase 1a 14/14 ✅ · Phase 1b 11/11 ✅ · Phase 1c 12/12 ✅ · Phase 2a 7/7 ✅ · Phase 2b 9/9 ✅ · Phase 3 9/9 ✅)

---

## Status Dashboard

| Phase | Progress | Status | Deliverable |
|-------|----------|--------|-------------|
| 1a Foundation | 14/14 | ✅ Done | crashes + network in terminal |
| 1b Intelligence | 11/11 | ✅ Done | real-time dashboard |
| 1c AI Integration | 12/12 | ✅ Done | AI fix suggestions |
| 2a Native Core | 7/7 | ✅ Done | native crash/ANR/metrics/spans + config plugin |
| 2b Native Advanced | 9/9 | ✅ Done | replay, profiler, dev tools |
| 3 Backend | 9/9 | ✅ Done | production backend |
| 4 Intelligence | 0/8 | ⬜ Ready | self-learning AI |

---

## Active Task

> **Phase 2a · Task 38 — ErneMonitorModule shell (Expo Modules API)**

### Pre-Start Checklist
- [x] Read PROTOCOLS.md
- [x] Review phase-2a-native-core.md (paths updated to root-level layout 2026-04-12)
- [x] Verify no blockers in Blockers & Decisions section
- [x] Spec ADR logged for native module layout

## Phase 2a — Task Checklist

| # | Task | Status | Files Created | Tests | Integrated |
|---|------|--------|---------------|-------|------------|
| 38 | ErneMonitorModule shell | ✅ | expo-module.config.json, src/native/{types,ErneMonitorNative,defaultLoader,index}.ts, src/native/ErneMonitorNative.test.ts, ios/ErneMonitorModule.swift, ios/ErneMonitor.podspec, android/build.gradle.kts, android/src/main/AndroidManifest.xml, android/src/main/java/expo/modules/ernemonitor/ErneMonitorModule.kt | ✅ (16) | ✅ |
| 39 | Schema codegen execution (Swift + Kotlin) | ✅ | ios/AnyCodable.swift, ios/generated/ErneMonitorSchema.swift (Sendable + Equatable + Codable), android/src/main/java/expo/modules/ernemonitor/generated/ErneMonitorSchema.kt (@Serializable + autolinked package), scripts/codegen/verify-codegen.test.ts | ✅ (9) | ✅ |
| 40 | CrashHandler (signal-safe POSIX + JNI) | ✅ | iOS: SignalHandler.{c,h} (async-signal-safe POSIX, 64KB pre-allocated buffer, 6 signals chained), CrashReportWriter.swift (line-protocol parser), CrashHandler.swift (lifecycle + NSException @convention(c) chain), AnyCodable.swift, ErneMonitorModule.swift (drainPersistedCrashes/acknowledgePersistedCrash). Android: signal_handler.cpp (libunwind backtrace, JNI exports), CMakeLists.txt, NativeCrashHandler.java (JNI bridge), CrashHandler.kt (POSIX + Thread.uncaughtExceptionHandler chain). JS: src/native/NativeCrashGateway.ts, src/native/NativeCrashGateway.test.ts, ErneMonitorNative drain/ack methods, createMonitorRuntime wiring + replay on start. | ✅ (12) | ✅ |
| 41 | ANRDetector | ✅ | iOS: ios/ANRDetector.swift (DispatchSource watchdog, 1s ping/5s threshold, debugger + background suspend, Thread.callStackSymbols capture, @convention(c) onANR delegation). Android: android/.../ANRDetector.kt (HandlerThread + main Looper ping, identical 1s/5s, Debug.isDebuggerConnected, Looper.getMainLooper().thread.stackTrace). JS: src/native/ANRGateway.{ts,test.ts} translation layer dispatching native_anr custom events. createMonitorRuntime wires anrGateway, startMonitorRuntime starts it. | ✅ (6) | ✅ |
| 42 | NativeMetrics | ✅ | iOS: ios/NativeMetrics.swift (Mach task_info CPU% via thread_basic_info enumeration, task_vm_info phys_footprint memory, ProcessInfo.thermalState, UIDevice battery, NSURL disk caps, ThermalObserver via thermalStateDidChangeNotification). Android: android/.../NativeMetrics.kt (/proc/self/stat CPU jiffies, /proc/self/statm RSS, ActivityManager.MemoryInfo, PowerManager currentThermalStatus, ACTION_BATTERY_CHANGED sticky, StatFs disk; ThermalObserver via PowerManager.OnThermalStatusChangedListener). JS: src/native/NativeMetricsPoller.{ts,test.ts} 30s interval poller emitting native_metrics + native_thermal custom events. **Live-verified iPhone 16 Pro simulator**: cpuUsagePercent=2, memoryUsedBytes=394MB, memoryTotalBytes=19GB, thermalState=nominal, diskAvailableBytes=14GB, diskTotalBytes=494GB streaming to dashboard. | ✅ (5) | ✅ |
| 43 | SpanSnapshot | ✅ | iOS: ios/SpanLog.swift (line-protocol append-only log under Application Support/ErneMonitor/spans.log, START/END/UPD records, 1MB rotation, max 50 active, drainInterrupted parses on next launch). Android: android/.../SpanLog.kt (identical line-protocol under filesDir/erne-monitor/spans.log, ConcurrentHashMap active set, synchronized I/O). JS: src/native/SpanSnapshot.{ts,test.ts} startSpan/updateSpan/endSpan API + replayInterrupted dispatch as interrupted_span custom events. ErneMonitorNative startSpan/endSpan/updateSpan/drainInterruptedSpans wrappers. createMonitorRuntime wires spanSnapshot, startMonitorRuntime calls replayInterrupted. | ✅ (7) | ✅ |
| 44 | Expo Config Plugin (withErneMonitor) | ✅ | plugin/withErneMonitor.ts (composes withErneMonitorIOS + withErneMonitorAndroid via createRunOncePlugin). iOS: ITSAppUsesNonExemptEncryption=false, NSAppTransportSecurity localhost exception (gated by allowDevDashboard option), UIBackgroundModes fetch. Android: WAKE_LOCK + ACCESS_NETWORK_STATE permissions, application extractNativeLibs=true. Idempotent, preserves existing settings, never overwrites consumer values. plugin/build/ ships compiled JS via tsconfig.plugin.json. package.json exports `./plugin` and `./app.plugin` so consumers write `'@erne/monitor/plugin'` in app.config.{ts,js}. | ✅ (11) | ✅ |

## Phase 3 — Task Checklist

| # | Task | Status | Files Created | Tests | Integrated |
|---|------|--------|---------------|-------|------------|
| 54 | BatchTransport | ✅ | src/transport/BatchTransport.{ts,test.ts}, src/transport/RetryQueue.{ts,test.ts} (offline-first batch upload, exponential backoff, gzip, crash immediate flush, consent gate) | ✅ (9+12) | ✅ |
| 55 | OTelExporter | ✅ | src/transport/OTelExporter.{ts,test.ts}, src/transport/otel/{TraceMapper,MetricMapper,LogMapper}.ts (OTLP/HTTP JSON, navigation→spans, FPS/memory→metrics, crash→logs) | ✅ (9) | ✅ |
| 56 | PostgreSQL Schema | ✅ | server/db/migrations/001_initial_schema.sql, 002_alert_rules.sql, server/db/schema.ts (6 tables, FK indexes, MigrationRunner interface) | ✅ (included in 58) | ✅ |
| 57 | ClickHouse Schema | ✅ | server/clickhouse/migrations/001_events_table.sql, 002_materialized_views.sql, server/clickhouse/queries.ts (ReplacingMergeTree, 3 materialized views, typed query builders) | ✅ (included in 58) | ✅ |
| 58 | Ingest Service | ✅ | server/ingest/server.ts, validator.ts, router.ts, server.test.ts (POST /v1/events, OTLP endpoints, API key auth, rate limiting, backpressure) | ✅ (24) | ✅ |
| 59 | Ingest Workers | ✅ | server/workers/eventProcessor.ts, crashProcessor.ts, metricsAggregator.ts, workers.test.ts (batch ClickHouse inserts, server fingerprinting, 1-min rollups) | ✅ (22) | ✅ |
| 60 | Symbolication | ✅ | server/symbolication/service.ts, sourceMapResolver.ts, cache.ts, service.test.ts (source map lookup, LRU cache 500MB, frame resolution) | ✅ (18) | ✅ |
| 61 | Alerting Engine | ✅ | server/alerting/engine.ts, evaluator.ts, channels/{slack,webhook,email}.ts, engine.test.ts (6 operators, cooldown dedup, auto-resolution, 3 channels) | ✅ (17) | ✅ |
| 62 | Data Retention | ✅ | server/maintenance/retention.ts, cleanup.ts, retention.test.ts (per-app TTL, ClickHouse DROP PARTITION, PostgreSQL orphan cleanup, dry-run) | ✅ (14) | ✅ |

---

## Phase 2b — Task Checklist

| # | Task | Status | Files Created | Tests | Integrated |
|---|------|--------|---------------|-------|------------|
| 45 | DualThreadFPS | ✅ | ios/DualThreadFPS.swift (CADisplayLink UI + dispatch probe JS), android/.../DualThreadFPS.kt (Choreographer + HandlerThread probe), src/collectors/native/DualThreadFPSCollector.{ts,test.ts}, ErneMonitorModule.swift/kt wired (onDualThreadFPS event, start/stop lifecycle), ErneMonitorNative.ts onDualThreadFPS subscription, types.ts NativeDualThreadFPSReport, createMonitorRuntime wiring + start/stop/shutdown. Also: diagnostics API (triggerTestCrash/triggerTestANR/triggerTestSpanCrash) added to native modules + JS wrapper + 9 diagnostics tests. | ✅ (9+9) | ✅ |
| 46 | FabricCommitTracker | ✅ | ios/FabricCommitTracker.swift (CFRunLoopObserver layout-pass bracketing, thrashing detection), android/.../FabricCommitTracker.kt (FrameMetrics API 26+ LAYOUT_MEASURE_DURATION + TOTAL_DURATION), src/collectors/native/FabricCommitCollector.{ts,test.ts}, ErneMonitorModule.swift/kt wired (onFabricCommit event), createMonitorRuntime wiring. | ✅ (6) | ✅ |
| 47 | ReplayCapture | ✅ | ios/ReplayCapture.swift (UIView.drawHierarchy half-res JPEG, PII mask overlay, touch recording), android/.../ReplayCapture.kt (PixelCopy API 26+ with View.draw fallback, JPEG q30, mask overlay), src/processors/ReplayMasker.{ts,test.ts} (secureTextEntry/a11yLabel/custom mask rules), src/collectors/native/ReplayCollector.{ts,test.ts} (ring buffer, consent gate, mask refresh), ErneMonitorModule.swift/kt wired (startReplayCapture/stopReplayCapture/updateMasks/recordTouch/onReplayFrame). | ✅ (8+11) | ✅ |
| 48 | LayoutSnapshot | ✅ | ios/LayoutSnapshot.swift (UIView hierarchy walk, screen coords, a11y, PII sanitization, depth truncation), android/.../LayoutSnapshot.kt (View hierarchy walk, FrameMetrics, padding/margin, password redaction), src/collectors/native/LayoutSnapshotCollector.{ts,test.ts} (on-demand capture, node counting). | ✅ (6) | ✅ |
| 49 | Hermes CPU Profiler | ✅ | ios/HermesProfilerBridge.swift (profile file storage, listing, cleanup), android/.../HermesProfilerBridge.kt (same), src/collectors/native/HermesProfilerCollector.{ts,test.ts} (JS-coordinated via HermesInternal, 30s cap, dev-only gate, concurrent prevention). | ✅ (8) | ✅ |
| 50 | Source Map Auto-Upload | ✅ | plugin/withSourceMapUpload.ts (Expo config plugin, writes upload script via withDangerousMod), plugin/sourceMapUpload.test.ts, scripts/upload-sourcemaps.sh (curl-based, HEAD dedup, always exits 0). | ✅ (8) | ✅ |
| 51 | ExpoDevToolsPlugin | ✅ | src/integrations/ExpoDevToolsPlugin.{ts,test.ts} (registers "ErneMonitor" tab, live health grid + recent events, command handling for captureProfile/layoutSnapshot, dev-only gate). | ✅ (10) | ✅ |
| 52 | BugReporter | ✅ | ios/ShakeDetector.swift (UIWindow motionEnded swizzle), android/.../ShakeDetector.kt (accelerometer 2.7G threshold), src/integrations/BugReporter.{ts,test.ts} (bundles screenshot+breadcrumbs+replay+layout+device info, 60s rate limit, shake/programmatic triggers), ErneMonitorModule wired (onShakeDetected + start/stopShakeDetection). | ✅ (11) | ✅ |
| 53 | VisualRepro | ✅ | src/collectors/native/VisualReproCollector.{ts,test.ts} (navigation-triggered screenshots, 10-frame ring buffer, 2MB cap, consent gate, crash attachment). | ✅ (12) | ✅ |

---

## Phase 1a — Task Checklist

| # | Task | Status | Files Created | Tests | Integrated |
|---|------|--------|---------------|-------|------------|
| 1 | MonitorClient | ✅ | src/core/MonitorClient.ts, src/core/MonitorClient.test.ts, src/types/index.ts | ✅ (14) | ✅ |
| 2 | Config | ✅ | src/core/Config.ts, src/core/Config.test.ts | ✅ (20) | ✅ |
| 3 | PlatformBridge | ✅ | src/core/PlatformBridge.ts, src/core/JSPlatformBridge.ts, src/core/PlatformBridge.test.ts | ✅ (17) | ✅ |
| 4 | SignalBus | ✅ | src/core/SignalBus.ts, src/core/SignalBus.test.ts | ✅ (15) | ✅ |
| 5 | SessionManager | ✅ | src/core/SessionManager.ts, src/core/SessionManager.test.ts | ✅ (13) | ✅ |
| 6 | EventStore | ✅ | src/storage/EventStore.ts, src/storage/EventStore.test.ts | ✅ (13) | ✅ (memory backend; SQLite backend deferred per ADR) |
| 7 | CrashCollector | ✅ | src/collectors/CrashCollector.ts, src/collectors/CrashCollector.test.ts | ✅ (10) | ✅ |
| 8 | NetworkCollector | ✅ | src/collectors/NetworkCollector.ts, src/collectors/NetworkCollector.test.ts | ✅ (8) | ✅ |
| 9 | NavigationCollector | ✅ | src/collectors/NavigationCollector.ts, src/collectors/NavigationCollector.test.ts | ✅ (8) | ✅ |
| 10 | CustomEventCollector | ✅ | src/collectors/CustomEventCollector.ts, src/collectors/CustomEventCollector.test.ts | ✅ (9) | ✅ |
| 11 | Sanitizer | ✅ | src/processors/Sanitizer.ts, src/processors/Sanitizer.test.ts | ✅ (16) | ✅ |
| 12 | Enricher | ✅ | src/processors/Enricher.ts, src/processors/Enricher.test.ts | ✅ (6) | ✅ |
| 13 | TerminalReporter | ✅ | src/integrations/TerminalReporter.ts, src/integrations/TerminalReporter.test.ts | ✅ (8) | ✅ |
| 14 | MonitorProvider | ✅ | src/MonitorProvider.tsx, src/MonitorProvider.test.tsx, src/core/createMonitorRuntime.ts, src/core/createMonitorRuntime.test.ts | ✅ (9) | ✅ |

Status legend: ⬜ Not started | 🔄 In progress | ✅ Done | ❌ Blocked | 🔁 Rework needed

---

## Blockers & Decisions

| Date | Type | Description | Resolution | Impact |
|------|------|-------------|------------|--------|
| 2026-04-10 | Decision | Design spec approved | Proceed to implementation | All phases |
| 2026-04-11 | Decision | Repo location | Option A — monorepo at `packages/monitor/` | All phases |
| 2026-04-11 | Milestone | Bootstrap complete | package.json, tsconfig, jest.config, dirs, entry stub, tsc clean | Phase 1a unblocked |
| 2026-04-11 | ADR | EventStore backend pluggable | Task 6 ships EventStore with a pluggable `EventStoreBackend` interface and a full in-memory backend. The expo-sqlite backend is deferred to the Phase 1a integration pass (it depends on PlatformBridge being wired into a real RN runtime and cannot run under plain ts-jest). MemoryEventStoreBackend satisfies all API and behavior requirements for Phase 1a unit tests; the SQLite adapter will be a thin driver added before Phase 1a completion alongside the Expo demo app. | Phase 1a Task 6, Phase 1a completion checklist |
| 2026-04-12 | ADR | Native module layout | Phase 2a native code lives directly at `packages/monitor/ios` + `packages/monitor/android` with `expo-module.config.json` at package root, following the standard published Expo Module layout (expo-image, expo-video, expo-camera). The earlier design draft used `modules/erne-monitor/` — that is the in-app module convention and would not autolink when `@erne/monitor` is consumed as an npm dependency. phase-2a-native-core.md file paths updated accordingly. | Phase 2a Tasks 38–44 |

---

## Integration Health

After each task, verify all existing components still work together.

| Component | Status | Last Verified | Notes |
|-----------|--------|---------------|-------|
| MonitorClient | ✅ | 2026-04-11 | 14 unit tests passing, tsc clean |
| Config | ✅ | 2026-04-11 | 20 unit tests, defaults + validation + deep-freeze |
| PlatformBridge | ✅ | 2026-04-11 | 17 unit tests, JS impl with DI, native override planned for Phase 2 |
| SignalBus | ✅ | 2026-04-11 | 15 unit tests, typed + wildcard, error isolation, snapshot dispatch |
| SessionManager | ✅ | 2026-04-11 | 13 unit tests, UUID v4, 5-min inactivity via AppState, DI clock |
| EventStore | ✅ | 2026-04-11 | 13 tests on memory backend, priority queue + LRU + age pruning + sync insert |
| CrashCollector | ✅ | 2026-04-11 | 10 tests, chained ErrorUtils + promise rejection tracker, sync fatal persist |
| NetworkCollector | ✅ | 2026-04-11 | 8 tests, fetch + XHR monkey-patch, transparent proxy, host filter |
| NavigationCollector | ✅ | 2026-04-11 | 8 tests, NavigationAdapter DI, Expo Router/React Nav/manual fallback |
| CustomEventCollector | ✅ | 2026-04-11 | 9 tests, trackEvent validation (name, type, limits) |
| Sanitizer | ✅ | 2026-04-11 | 16 tests, email/phone/header/URL redaction, deep walk, pure function |
| Enricher | ✅ | 2026-04-11 | 6 tests, context envelope, cached static info, dynamic connection/memory |
| TerminalReporter | ✅ | 2026-04-11 | 8 tests, dev-only, rate-limited, severity routing, resilient |
| createMonitorRuntime | ✅ | 2026-04-11 | 6 tests, wires every Phase 1a component, shutdown releases all resources |
| MonitorProvider | ✅ | 2026-04-11 | 3 tests via react-test-renderer, mount/unmount, defaults, no re-init on re-render |
| BreadcrumbCollector | ✅ | 2026-04-11 | 6 tests, ring buffer of 100, attaches trail to crash events |
| RenderCollector | ✅ | 2026-04-11 | 5 tests, debounced profiler aggregation, unnecessary-render detection |
| FrameDropCollector | ✅ | 2026-04-11 | 3 tests, rAF-driven, sustained-drop window, app-state pause |
| StartupCollector | ✅ | 2026-04-11 | 4 tests, cold/warm/hot milestones, budget flag |
| MemoryCollector | ✅ | 2026-04-11 | 3 tests, periodic sampling, pause on background |
| LongTaskCollector | ✅ | 2026-04-11 | 3 tests, PerformanceObserver + rAF fallback |
| Fingerprinter | ✅ | 2026-04-11 | 6 tests, stable across line-number churn, separates rejections |
| AdaptiveSampler | ✅ | 2026-04-11 | 8 tests, deterministic hashing, battery/CPU degradation, always keeps crashes |
| ConsentGate | ✅ | 2026-04-11 | 7 tests, per-category buffering + flush + revoke + persistence |
| DashboardBridge | ✅ | 2026-04-12 | 6 tests, WS client with reconnect + buffer, live-verified against dashboard/server.js |
| Dashboard Runtime tab | ✅ | 2026-04-12 | New /runtime.html + /api/monitor/{summary,events} endpoints; WS push + REST poll; live-verified against iPhone 16 Pro |
| createMonitorRuntime (Phase 1b) | ✅ | 2026-04-12 | Wires all 10 collectors + Fingerprinter + AdaptiveSampler + ConsentGate + DashboardBridge + Breadcrumb trail attach in pipeline |
| TouchBoundaryCollector | ✅ | 2026-04-12 | 6 tests, debounced per-target, DI scheduler |
| FrustrationCollector | ✅ | 2026-04-12 | 7 tests, rage/dead/error-tap correlation across touch + crash |
| StateCollector | ✅ | 2026-04-12 | 6 tests, Zustand + Redux middleware factories, shallow-diff only (no PII) |
| SuspenseCollector | ✅ | 2026-04-12 | 5 tests, nested depth tracking, error outcomes |
| ActivityCollector | ✅ | 2026-04-12 | 5 tests, React 19 Activity wasted-render detection, debounced flush |
| ImageCollector | ✅ | 2026-04-12 | 5 tests, per-URI aggregation, oversize detection, error rate |
| A11yCollector | ✅ | 2026-04-12 | 6 tests, missing label / small target / missing role / image alt |
| StorageCollector | ✅ | 2026-04-12 | 5 tests, AsyncStorage monkey-patch with clean unpatch, warnings |
| SignalRouter (composite) | ✅ | 2026-04-12 | 25 tests across 7 sub-components + integration; DedupEngine, CorrelationEngine, ConfidenceScorer, ContextBuilder, DispatchEngine, FeedbackTracker, PatternLibrary (20 built-in patterns) |
| Schema Codegen | ✅ | 2026-04-12 | 12 tests, ts-morph → Swift + Kotlin, deterministic + idempotent, ran against canonical src/types/events.ts (12 interfaces) |
| Babel auto-instrumentation plugin | ✅ | 2026-04-12 | 18 tests, displayName injection, Pressable/Touchable onMonitorTouch, Suspense marker, include/exclude, @erne-monitor-ignore pragma |
| `npx @erne/monitor init` CLI wizard | ✅ | 2026-04-12 | 14 tests, detectProject + renderMonitorConfig + patchAppEntry + patchBabelConfig + runInit pipeline, dry-run + idempotent, VFS-injectable for tests |
| ErneMonitorNative (JS wrapper) | ✅ | 2026-04-12 | 16 tests, LazyNativeModuleLoader + safe wrapper, graceful no-op when native module absent, full event surface (onNativeCrash/onANRDetected/onThermalStateChange) |
| ErneMonitorModule (iOS shell) | ✅ | 2026-04-12 | Swift Module definition, Name/Events/Function declarations, ProcessInfo + thermalState surface, real impls land in Tasks 40–42 |
| ErneMonitorModule (Android shell) | ✅ | 2026-04-12 | Kotlin Module definition, ActivityManager/PowerManager surface, real impls land in Tasks 40–42 |
| Schema codegen verify-codegen | ✅ | 2026-04-12 | 9 tests, drift detection (CI freshness gate) + Swift Codable/Equatable/Sendable assertion + Kotlin @Serializable/@SerialName assertion + TS↔Swift↔Kotlin field cross-reference for every interface and alias |
| NativeCrashGateway | ✅ | 2026-04-12 | 12 tests, live native crash dispatch + persisted crash replay + idempotent start/stop + ack-after-dispatch contract + graceful no-native-module fallback |
| iOS SignalHandler.c | ✅ | 2026-04-12 | 64KB pre-allocated buffer, 6 signals chained (SIGSEGV/SIGABRT/SIGBUS/SIGFPE/SIGILL/SIGTRAP), backtrace + line-protocol persist, **live-verified end-to-end** on iPhone 16 Pro simulator: SIGSEGV via kill → file written → relaunch → drain → SignalRouter score 82 → dashboard "crash":1 with 17 frames + breadcrumb trail + fingerprint 1vogxht → file deleted via ack |
| iOS CrashHandler.swift | ✅ | 2026-04-12 | install/uninstall lifecycle, NSException chain via @convention(c) function pointer, CrashReportWriter parses on-disk format on next launch, drain → ErneMonitorModule.AsyncFunction("drainPersistedCrashes") |
| Android signal_handler.cpp | ✅ | 2026-04-12 | libunwind backtrace, identical line-protocol to iOS, JNI exports (nativeInstall/nativeUninstall/nativeIsInstalled), CMakeLists.txt with NDK r27 + C++17 toolchain |
| Android CrashHandler.kt | ✅ | 2026-04-12 | NativeCrashHandler.java JNI bridge, Thread.setDefaultUncaughtExceptionHandler chain, on-disk parse identical to iOS, drain → ErneMonitorModule.AsyncFunction("drainPersistedCrashes") |
| createMonitorRuntime native wiring | ✅ | 2026-04-12 | nativeModuleLoader DI (defaults to createDefaultNativeModuleLoader), NativeCrashGateway constructed in pipeline, startMonitorRuntime calls native.start + gateway.start + replayPersistedCrashes() — all swallowing errors so SDK boot never fails because the native module misbehaved |
| Diagnostics API (dev-only) | ✅ | 2026-04-15 | triggerTestCrash/triggerTestANR/triggerTestSpanCrash on iOS (#if DEBUG) + Android (debuggable flag), ErneMonitorNative JS wrapper + 9 tests, gpc-expo diagnostics screen |
| DualThreadFPSCollector | ✅ | 2026-04-15 | 9 tests, native CADisplayLink/Choreographer UI FPS + dispatch-probe JS FPS, bottleneck attribution (ui/js/both/none), background suppression |
| FabricCommitCollector | ✅ | 2026-04-15 | 6 tests, iOS CFRunLoopObserver layout-pass bracketing + Android FrameMetrics (LAYOUT_MEASURE + TOTAL), thrashing detection (>10 commits/sec for >2s), 2s batched reports |
| ReplayMasker | ✅ | 2026-04-15 | 8 tests, secureTextEntry + PII a11yLabel (password/email/phone) + custom testID/nativeID mask matching, case-insensitive |
| ReplayCollector | ✅ | 2026-04-15 | 11 tests, native capture start/stop, ring buffer (30s FIFO), consent gate, touch recording, mask refresh, frame base64 + touch overlay |

---

## Plan Adherence

Track coverage of the design spec. Updated at end of each phase.

| Spec Section | Covered By | Status |
|-------------|------------|--------|
| §1 Vision | README.md | ✅ Documented |
| §2 Architecture | architecture/*.md | ✅ Documented |
| §3 SDK Architecture | Phase 1a-1c | 🔄 Phase 1a complete (MonitorClient, Config, PlatformBridge, SessionManager, SignalBus, collectors) |
| §4 SignalRouter | Phase 1c | ✅ Composite built: Dedup + Correlate + Score + Context + Dispatch + Feedback + 20-pattern library |
| §5 Data Pipeline | Phase 1a-1b, 3 | 🔄 EventStore + SignalBus + Sanitizer + Enricher shipped; full pipeline routing lands in 1b |
| §6 Schema Codegen | Phase 1c | ✅ ts-morph-based Swift + Kotlin generators in scripts/codegen/, bound to src/types/events.ts, runs via `npm run codegen` |
| §7 Performance Budget | Every task | 🔄 Bundle size not yet measured — deferred to Phase 1a integration pass with Expo demo |
| §8 Developer Experience | Phase 1c | 🔄 defineMonitorConfig + MonitorProvider shipped; zero-config CLI wizard lands in 1c |
| §9 Dashboard | Phase 1b | ✅ TerminalReporter + DashboardBridge + /runtime.html tab; live-verified WS stream from gpc-expo → dashboard |
| §10 Testing Strategy | Every task | ✅ 173 unit tests across 16 suites; integration tests in 1b |
| §11 Phased Rollout | phases/*.md | ✅ Documented |
| §13 Competitive Advantages | Phase 1c-2b | ⬜ Not started |
| §14 Privacy & Compliance | Phase 1b (ConsentGate) | ✅ Sanitizer + ConsentGate shipped and wired in pipeline |

---

## Session History

| Date | Session # | Phase | Tasks Completed | Notes |
|------|-----------|-------|-----------------|-------|
| 2026-04-10 | 1 | Planning | — | Design spec created. 6 projects analyzed (Measure.sh, Callstack Brownfield, Sentry, Embrace, Datadog, Instabug). 3 rounds of improvement analysis. 70 tasks planned across 7 phases. |
| 2026-04-11 | 2 | 1a | Bootstrap, Task 1 (MonitorClient) | Option A monorepo chosen. packages/monitor/ bootstrapped (package.json, tsconfig strict, jest config, dirs, entry stub). MonitorClient implemented with singleton + priority-ordered lifecycle + rollback. 14 tests passing. tsc clean. |
| 2026-04-11 | 2 (cont.) | 1a | Tasks 2–14 + SQLite adapter | Completed all Phase 1a tasks in a single autonomous session per Juba's instruction ("გადი ბოლომდე, ინსტრუქციის მიხედვით"). Config with validation and deep-freeze; PlatformBridge with DI JS impl; SignalBus with error isolation and snapshot dispatch; SessionManager with 5-min AppState inactivity; EventStore with pluggable backend (Memory + Sqlite adapters); CrashCollector chaining ErrorUtils + rejection tracker + sync fatal persist; NetworkCollector with transparent fetch/XHR patching; NavigationCollector with adapter-based auto-detect; CustomEventCollector with trackEvent validation; Sanitizer with email/phone/header/URL scrubbing; Enricher with cached static + dynamic context; TerminalReporter rate-limited dev surface; MonitorProvider + createMonitorRuntime end-to-end wiring. 173 tests across 16 suites, tsc clean. Deferred for Phase 1a integration pass: bundle size measurement and Expo demo app (both require a real RN runtime). |
| 2026-04-12 | 3 | 1b | Tasks 15–23 | Phase 1b SDK — BreadcrumbCollector (ring buffer + crash trail attach), RenderCollector (Profiler aggregation, unnecessary detection), FrameDropCollector (rAF sustained drop), StartupCollector (cold/warm/hot milestones), MemoryCollector (periodic polling, pause on bg), LongTaskCollector (PerformanceObserver + rAF fallback), Fingerprinter (djb2 stack hash for dedup), AdaptiveSampler (deterministic per-session + battery/CPU degradation), ConsentGate (per-category buffer/flush/revoke + persistence). 218 tests across 25 suites. |
| 2026-04-12 | 4 | 1b complete | Tasks 24 + 25 + live integration | gpc-expo (Expo SDK 55 / RN 0.83 / React 19) live-wired via build pipeline (tsconfig.build.json, dist/). Found + fixed: NetworkCollector blob/arraybuffer responseType crash (+5 tests), TerminalReporter triggering LogBox overlays (switched to console.log only, +1 test), BreadcrumbCollector pipeline ordering so stored crash copies carry the trail. Phase 1b wiring rewritten in createMonitorRuntime: 10 collectors + Fingerprinter + AdaptiveSampler + ConsentGate + stats counters + `__ERNE_MONITOR__` global. DashboardBridge (Task 24) — WebSocket client with hello/event protocol, exponential backoff reconnect, bounded offline buffer, 6 tests. Dashboard server.js — `monitor:hello` / `monitor:event` WS routes, in-memory 500-slot ring buffer, `/api/monitor/{summary,events}` REST endpoints, broadcast to all connected clients. Runtime tab (Task 25) — `/runtime.html` with health grid (crashes/network/nav/custom/renders), live signal feed, client panel, WS push + 10s REST poll fallback. End-to-end live-verified on iPhone 16 Pro: 23+ events streaming, real PerformanceObserver long-task detection at 51/52/72/133ms, real GPC backend traffic, test crash with stable fingerprint `76hp6x` visible in dashboard. 235 tests across 26 suites, tsc clean. |
| 2026-04-12 | 5 | 1c (tasks 26-34) | 8 advanced collectors + SignalRouter composite | Phase 1c SDK core — 8 new collectors (TouchBoundary, Frustration, State, Suspense, Activity, Image, A11y, Storage) with full DI and ts-jest coverage. SignalRouter built as 7-file composite: DedupEngine (fingerprint-windowed merge), CorrelationEngine (time-window grouping with confidence), ConfidenceScorer (0-100 weighted by correlation/recurrence/pattern), ContextBuilder (breadcrumbs + summary + screen + source location), DispatchEngine (score-based channel routing with per-channel rate limits), FeedbackTracker (applied/helpful ratings), PatternLibrary (20 built-in RN patterns: Cannot-read-property, unhandled rejection, 5xx, oversized image, missing a11y label, rage tap, wasted Activity render, slow Suspense fallback, re-render storm, long JS task, memory pressure, AsyncStorage pressure, etc.). Router exposes `process(event)` single-entry pipeline with stats tracking. 305 tests across 35 suites. Tasks 35-37 (Schema codegen, Babel auto-instrumentation, init wizard) deferred to next session as separate tooling domains. |
| 2026-04-12 | 6 | 1c complete | Tasks 35, 36, 37 | Phase 1c completion — **Schema codegen** (Task 35): ts-morph-driven parser + Swift/Kotlin emitters in `scripts/codegen/`, canonical types in `src/types/events.ts` (12 interfaces), `npm run codegen` produces `ios/generated/ErneMonitorSchema.swift` and `android/generated/ErneMonitorSchema.kt`. Handles primitives, optionals, arrays, nested refs, X\|null, string-literal unions (as enums), Record<string, X>, and string\|number\|boolean unions (JsonPrimitive). 12 tests. **Babel auto-instrumentation plugin** (Task 36): `babel-plugin/index.ts` + visitors for displayName injection on PascalCase arrow components, `onMonitorTouch` prop injection on Pressable/TouchableOpacity/TouchableHighlight/TouchableWithoutFeedback, and `data-erne-suspense-id` marker on `<Suspense>`. Include/exclude globs, `@erne-monitor-ignore` pragma (walks up to statement-level comments), idempotent. 18 tests via `@babel/core` + preset-react + preset-typescript. **CLI init wizard** (Task 37): `cli/{detect-project, scaffold-config, scaffold-provider, scaffold-babel, init, bin}.ts`. Detects Expo Router / React Navigation / TS / package manager / state mgmt / existing monitor dep. Renders monitor.config.{ts,js}, patches app entry to wrap `<MonitorProvider>`, patches babel.config.* to add the plugin. VFS-injected for tests, `--dry-run` support, fully idempotent, prints post-init summary. 14 tests. Total 349 tests across 38 suites. Phase 1c 12/12 complete; Phase 2a (native core) unblocked. |

| 2026-04-15 | 8 | 2b complete | Tasks 45-53 | Phase 2b — all 9 tasks completed in one session. DualThreadFPS (CADisplayLink/Choreographer + JS probe, bottleneck attribution), FabricCommitTracker (CFRunLoopObserver/FrameMetrics, layout thrashing), ReplayCapture + ReplayMasker (session replay with PII masking, ring buffer, consent gate), LayoutSnapshot (native view hierarchy walk, sanitization, depth truncation), HermesProfilerCollector (JS-coordinated via HermesInternal, 30s cap, dev-only), Source Map Auto-Upload (Expo config plugin + shell script), ExpoDevToolsPlugin (DevTools tab with health grid + commands), BugReporter (shake detection + context bundling, rate limiting), VisualRepro (navigation-triggered screenshots, 2MB buffer cap). Also: production-ready diagnostics API (triggerTestCrash/ANR/SpanCrash) + gpc-expo diagnostics screen. 519 tests across 55 suites, tsc clean. iPhone 16 Pro device name corrected in all docs. Phase 3 (backend) unblocked. |

---

## Phase 1a Retrospective (2026-04-11)

**What went well:**
- Dependency injection everywhere (PlatformBridge, AppState, fetch target, NavigationAdapter, ErrorUtils, RejectionTracker, SQLite module) let every component run under plain ts-jest without the RN preset. Phase 2 native bridge has a clear extension point at every seam.
- Pluggable EventStoreBackend interface split the storage concern cleanly: MemoryEventStoreBackend for unit tests, SqliteEventStoreBackend for production, same public surface.
- Strict TypeScript + deep-frozen config caught three bugs at compile time before a single test ran.
- Per-handler try/catch on SignalBus and SessionManager.fireChange prevents a single buggy subscriber from taking down the bus — learned from the RN community's pain with older analytics SDKs.
- Descriptive validation errors in Config and CustomEventCollector mean misuse fails loudly in dev instead of silently corrupting the event stream.

**What to improve next phase:**
- Collectors write directly to EventStore AND emit to the bus, so the bus listener writes a second copy. Phase 1b should route everything through a single pipeline stage (SignalBus → processors → EventStore) to eliminate duplication.
- Bundle size was not measured this session. Phase 1b integration should add a size-limit check and a real Expo demo app.
- A couple of tests rely on microtask flushing with `await Promise.resolve()` loops. A proper fake-timer helper would be cleaner.
- react-test-renderer logs act-warnings despite setupFiles. Non-blocking but noisy.

**Deferred to Phase 1a integration pass (tracked):**
- Real Expo demo app + end-to-end smoke (`monitor-phase-1a-demo`).
- Bundle size measurement against the <20KB subset budget.
- git tag `monitor-phase-1a-complete` after the integration pass.
