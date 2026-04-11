# Phase 2a: Native Core

**Goal:** "Production-grade crash and performance monitoring"
**Depends on:** Phase 1c (schema codegen must exist — generated types are consumed here)
**Deliverable:** Native crash handling, ANR detection, CPU/memory/thermal metrics, cross-session persistence, Expo config plugin

---

## Success Criteria

- [ ] Expo Module API exposes MonitorModule on both iOS (Swift) and Android (Kotlin)
- [ ] Generated Swift/Kotlin types compile and match TypeScript event definitions exactly
- [ ] CrashHandler captures native crashes with signal-safe, pre-allocated buffers
- [ ] ANRDetector identifies unresponsive main thread with 5-second threshold
- [ ] NativeMetrics provides real CPU, memory, thermal state, and battery level
- [ ] SpanSnapshot persists open spans across app restarts (crash recovery)
- [ ] Expo Config Plugin auto-configures native projects via `npx expo prebuild`
- [ ] Native module does not increase app launch time by more than 50ms
- [ ] All Phase 1a, 1b, and 1c tests still pass (regression check)
- [ ] Native tests pass on iOS simulator and Android emulator

---

## Tasks

### Task 38: Expo Module API Setup — MonitorModule

**Depends on:** Phase 1c complete (all JS-side collectors and SignalRouter stable)

**Description:** Create the native module shell using Expo Modules API. This is the bridge between JS-side collectors and native-side crash/performance monitoring. Defines the module interface, event emitters, and method exports that the JS SDK will call.

**Files to create:**
- `packages/monitor/expo-module.config.json`
- `packages/monitor/src/native/ErneMonitorModule.ts` (JS bindings via requireNativeModule)
- `packages/monitor/src/native/ErneMonitorModule.test.ts`
- `packages/monitor/ios/ErneMonitorModule.swift`
- `packages/monitor/ios/ErneMonitor.podspec`
- `packages/monitor/android/build.gradle.kts`
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/ErneMonitorModule.kt`

> **Layout decision (ADR 2026-04-12):** Native code lives directly under `packages/monitor/ios` and `packages/monitor/android` with `expo-module.config.json` at package root — the standard layout for published Expo Modules (`expo-image`, `expo-video`, `expo-camera`). The earlier `modules/erne-monitor/` path from the design draft was the in-app module convention; it would have required a nested autolink search path that does not match how `@erne/monitor` is consumed as an npm dependency.

**Acceptance criteria:**
- [ ] Module initializes on both iOS and Android without errors
- [ ] Exports methods: `startNativeMonitoring()`, `stopNativeMonitoring()`, `getNativeMetrics()`
- [ ] Exports events: `onNativeCrash`, `onANRDetected`, `onThermalStateChange`
- [ ] JS bindings use Expo Modules API typed interface (no `NativeModules` bridge)
- [ ] Module is discoverable by `expo-modules-autolinking`
- [ ] Initializes lazily — no work done until `startNativeMonitoring()` is called
- [ ] Graceful degradation: JS SDK works without native module (Phase 1 behavior preserved)
- [ ] Module adds <500KB to binary size per platform

**Integration points:** JS-side MonitorClient (#1) calls native module methods. PlatformBridge (#3) gets native override.
**Spec reference:** §3 SDK Architecture — PlatformBridge

---

### Task 39: Schema Codegen Execution — Generate Swift/Kotlin Types

**Depends on:** Schema Codegen (#35), MonitorModule (#38)

**Description:** Run the schema codegen from Phase 1c to generate the actual Swift structs and Kotlin data classes that the native module will use. Verify generated types compile, match TypeScript definitions, and integrate with the module build.

**Files to create:**
- `packages/monitor/ios/generated/ErneMonitorSchema.swift` (refreshed)
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/generated/ErneMonitorSchema.kt` (refreshed)
- `packages/monitor/scripts/codegen/verify-codegen.test.ts`

> Phase 1c already wired the ts-morph emitters and produced initial output under `ios/generated/` + `android/generated/`. Task 39 moves those outputs into the finalized module paths, adds `Codable`/`Sendable` conformance on Swift, adds `@Serializable` on Kotlin, and ships the CI freshness check.

**Acceptance criteria:**
- [ ] `npm run codegen` generates all files without errors
- [ ] Generated Swift structs conform to `Codable` and `Sendable`
- [ ] Generated Kotlin data classes use `@Serializable` (kotlinx.serialization)
- [ ] All event types from `src/types/events.ts` have corresponding native types
- [ ] Round-trip test: TS object → JSON → Swift/Kotlin decode → JSON → TS object matches
- [ ] Generated files compile as part of the native module build (Xcode + Gradle)
- [ ] CI job validates codegen output is up-to-date (fails if events.ts changed but codegen not re-run)

**Integration points:** CrashHandler (#40), ANRDetector (#41), NativeMetrics (#42), SpanSnapshot (#43) all use these types.
**Spec reference:** §6 Schema Codegen

---

### Task 40: CrashHandler — Signal-Safe Native Crash Capture

**Depends on:** MonitorModule (#38), Generated Types (#39)

**Description:** Native crash handler that captures POSIX signals (SIGSEGV, SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGTRAP) on iOS and uncaught exceptions + native crashes on Android. Uses pre-allocated memory buffers to avoid malloc in signal handlers. Writes crash data synchronously to disk before the process dies.

**Files to create:**
- `packages/monitor/ios/CrashHandler.swift`
- `packages/monitor/ios/SignalHandler.c` (C for signal safety)
- `packages/monitor/ios/CrashReportWriter.swift`
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/CrashHandler.kt`
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/NativeCrashHandler.java` (JNI bridge)
- `packages/monitor/android/src/main/cpp/signal_handler.cpp`
- `packages/monitor/android/src/main/cpp/CMakeLists.txt`

**Acceptance criteria:**
- [ ] Pre-allocates 64KB write buffer at init (no malloc in signal handler)
- [ ] Registers handlers for: SIGSEGV, SIGABRT, SIGBUS, SIGFPE, SIGILL, SIGTRAP
- [ ] Captures: signal type, faulting address, register state, thread backtrace
- [ ] Writes crash report synchronously to app sandbox (not external storage)
- [ ] iOS: uses `NSException` handler for Objective-C/Swift exceptions
- [ ] Android: uses `Thread.setDefaultUncaughtExceptionHandler` + NDK signal handler
- [ ] Chains previous signal handlers — does not swallow existing crash reporters (Sentry, Firebase)
- [ ] Crash report includes: timestamp, device info, app version, memory state, last 5 breadcrumbs
- [ ] On next app launch: reads persisted crash report, emits to SignalBus, deletes file
- [ ] Signal handler function is async-signal-safe (no heap allocation, no locks, no printf)
- [ ] Test: force crash via null pointer dereference, verify report on next launch

**Integration points:** MonitorModule (#38) starts/stops handler. JS-side CrashCollector (#7) receives native crash events on next launch.
**Spec reference:** §3 SDK Architecture — Collectors, §13 Competitive Advantages

---

### Task 41: ANRDetector — Application Not Responding

**Depends on:** MonitorModule (#38), Generated Types (#39)

**Description:** Watchdog thread that monitors the main thread for unresponsiveness. If the main thread does not respond to a ping within 5 seconds, captures a stack trace and reports an ANR event. On Android, also monitors the `MessageQueue` for blocked messages.

**Files to create:**
- `packages/monitor/ios/ANRDetector.swift`
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/ANRDetector.kt`

**Acceptance criteria:**
- [ ] Spawns a low-priority watchdog thread that pings the main thread every 1 second
- [ ] If main thread does not respond within 5 seconds (configurable), captures ANR
- [ ] Captures: main thread stack trace at time of ANR, duration of block, current screen
- [ ] iOS: uses `DispatchQueue.main.async` ping + `Thread.callStackSymbols` for trace
- [ ] Android: uses `Looper.getMainLooper()` handler ping + `Thread.getStackTrace()`
- [ ] Android: additionally monitors `MessageQueue` idle handler gap
- [ ] Does not false-positive during app backgrounding (pauses watchdog when `!isActive`)
- [ ] Does not false-positive during debugger breakpoints (detects debugger attachment)
- [ ] Emits ANR event to JS via module event emitter
- [ ] Watchdog thread uses <0.1% CPU when app is responsive

**Integration points:** MonitorModule (#38) starts/stops detector. JS-side receives ANR events via event listener.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 42: NativeMetrics — CPU, Memory, Thermal, Battery

**Depends on:** MonitorModule (#38), Generated Types (#39)

**Description:** Provides real device metrics that are unavailable from JavaScript. Replaces the placeholder `null` returns from JSPlatformBridge (#3) with actual hardware measurements. Samples periodically and on-demand.

**Files to create:**
- `packages/monitor/ios/NativeMetrics.swift`
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/NativeMetrics.kt`

**Acceptance criteria:**
- [ ] CPU usage: per-process CPU percentage (not system-wide)
- [ ] Memory: resident set size, available memory, memory pressure level
- [ ] iOS: uses `task_info` (MACH_TASK_BASIC_INFO) for CPU/memory
- [ ] Android: reads `/proc/self/stat` for CPU, `ActivityManager.MemoryInfo` for memory
- [ ] Thermal state: iOS `ProcessInfo.thermalState`, Android `PowerManager.thermalStatus`
- [ ] Battery level and charging state on both platforms
- [ ] Disk space: available and total storage
- [ ] Sampling interval: configurable, default 10 seconds
- [ ] On-demand: `getNativeMetrics()` returns current snapshot synchronously
- [ ] Emits thermal state change events proactively (not just on poll)
- [ ] Low overhead: metrics collection completes in <5ms per sample

**Integration points:** Overrides PlatformBridge (#3) methods. AdaptiveSampler (#22) uses thermal/battery for degradation decisions. MemoryCollector (#19) gets real memory values.
**Spec reference:** §3 SDK Architecture — PlatformBridge, §7 Performance Budget

---

### Task 43: SpanSnapshot — Cross-Session Persistence

**Depends on:** MonitorModule (#38), Generated Types (#39), EventStore (#6)

**Description:** Persists open monitoring spans (in-progress operations) to disk so they survive app crashes and restarts. When the app crashes mid-operation, the next launch can reconstruct what was happening and how far it progressed. Uses memory-mapped files for crash-safe writes.

**Files to create:**
- `packages/monitor/ios/SpanSnapshot.swift`
- `packages/monitor/android/src/main/java/expo/modules/ernemonitor/SpanSnapshot.kt`

**Acceptance criteria:**
- [ ] Maintains an in-memory list of active spans (operations in progress)
- [ ] Writes span state to disk on every span start/update/end (append-only log)
- [ ] iOS: uses `mmap` for crash-safe persistence (no fsync needed)
- [ ] Android: uses `MappedByteBuffer` for crash-safe persistence
- [ ] On app launch: reads persisted spans, identifies incomplete spans (crashed mid-operation)
- [ ] Incomplete spans are emitted as "interrupted_span" events with duration-so-far
- [ ] Supports span nesting (parent-child relationships)
- [ ] Maximum 50 concurrent active spans (prevents unbounded memory growth)
- [ ] File rotation: snapshot file capped at 1MB, rotates when full
- [ ] Span format compatible with OpenTelemetry span structure

**Integration points:** CrashHandler (#40) triggers span recovery on next launch. EventStore (#6) receives recovered spans. StartupCollector (#18) can detect if previous session crashed.
**Spec reference:** §5 Data Pipeline, §13 Competitive Advantages

---

### Task 44: Expo Config Plugin — withErneMonitor

**Depends on:** MonitorModule (#38), CrashHandler (#40)

**Description:** Expo Config Plugin that automatically configures native iOS and Android projects for @erne/monitor during `npx expo prebuild`. Adds required entitlements, background modes, ProGuard rules, and native module registration.

**Files to create:**
- `packages/monitor/plugin/withErneMonitor.ts`
- `packages/monitor/plugin/withErneMonitorIOS.ts`
- `packages/monitor/plugin/withErneMonitorAndroid.ts`
- `packages/monitor/plugin/withErneMonitor.test.ts`

**Acceptance criteria:**
- [ ] Registered in package.json as `expo.plugins` entry
- [ ] iOS: adds `UIBackgroundModes` for background fetch (crash report upload)
- [ ] iOS: configures `NSExceptionDomain` for crash report network access
- [ ] iOS: adds dSYM upload build phase for symbolication (optional, configurable)
- [ ] Android: adds ProGuard rules to preserve stack trace symbols
- [ ] Android: adds `android:extractNativeLibs="true"` for native crash handler
- [ ] Android: configures `CMakeLists.txt` for NDK signal handler compilation
- [ ] Configurable via plugin options: `{ dsymUpload: boolean, proguardKeep: boolean }`
- [ ] Idempotent — running `npx expo prebuild` multiple times produces same result
- [ ] Does not conflict with other common plugins (expo-dev-client, expo-updates, sentry-expo)
- [ ] Validates minimum Expo SDK version (53+) and warns if incompatible

**Integration points:** Init wizard (#37) adds plugin to app.json. CI/CD pipeline uses plugin during EAS Build.
**Spec reference:** §8 Developer Experience

---

## Phase Completion Checklist

- [ ] All 7 tasks (38-44) are complete
- [ ] All Phase 1a tests still pass (regression check)
- [ ] All Phase 1b tests still pass (regression check)
- [ ] All Phase 1c tests still pass (regression check)
- [ ] All Phase 2a native tests pass on iOS simulator and Android emulator
- [ ] Native module initializes in <50ms on both platforms
- [ ] CrashHandler survives force-kill and reports crash on next launch
- [ ] ANRDetector correctly identifies 5-second main thread blocks
- [ ] NativeMetrics returns real CPU, memory, thermal, battery values
- [ ] SpanSnapshot recovers incomplete spans after crash
- [ ] Config plugin runs cleanly with `npx expo prebuild --clean`
- [ ] Schema codegen output compiles on both platforms
- [ ] JS SDK gracefully falls back to Phase 1 behavior when native module is absent
- [ ] Bundle size increase: <500KB per platform binary, <50KB JS
- [ ] Plan adherence audit — spec §3, §5, §6, §7, §8, §13 covered
- [ ] Tag: `git tag monitor-phase-2a-complete`
- [ ] TRACKER.md updated, Phase 2b unblocked
