# Phase 2b: Native Advanced (parallel with Phase 3)

**Goal:** "Deep native insights + developer tools"
**Depends on:** Phase 2a (native module foundation must be stable)
**Deliverable:** Dual-thread FPS, Fabric commit tracking, session replay capture, Hermes profiling, bug reporter, and Expo DevTools integration
**Parallel with:** Phase 3 (backend) — no backend dependency, all local/dev tooling

---

## Success Criteria

- [ ] DualThreadFPS reports separate JS and UI thread frame rates on both iOS and Android
- [ ] FabricCommitTracker captures Fabric/Yoga commit counts and durations natively
- [ ] ReplayCapture produces annotated session snapshots with gesture overlay and PII masking
- [ ] LayoutSnapshot exports the full native UI hierarchy as a serializable tree
- [ ] Hermes CPU profiler integration captures and exports `.cpuprofile` data
- [ ] Source maps auto-upload to ERNE backend during EAS Build via config plugin
- [ ] ExpoDevToolsPlugin shows a real-time monitor tab in React Native DevTools
- [ ] BugReporter allows shake-to-report with annotation and submission
- [ ] VisualRepro captures navigation-triggered screenshots for crash reproduction
- [ ] All Phase 2a tests still pass (regression check)

---

## Tasks

### Task 45: DualThreadFPS.swift/kt

**Depends on:** Phase 2a native module infrastructure

Native frame rate monitoring that separates JS thread and UI thread performance.

**Files to create:**
- `ios/DualThreadFPS.swift`
- `android/src/main/java/com/ernemonitor/DualThreadFPS.kt`
- `src/collectors/native/DualThreadFPSCollector.ts`
- `src/collectors/native/DualThreadFPSCollector.test.ts`

**Acceptance criteria:**
- [ ] iOS: uses `CADisplayLink` to measure UI thread frame delivery
- [ ] iOS: uses `JSContext` timing or Hermes sampling to measure JS thread responsiveness
- [ ] Android: uses `Choreographer.FrameCallback` for UI thread
- [ ] Android: uses `ReactMarker` listeners for JS thread timing
- [ ] Reports separate `jsFPS` and `uiFPS` values every 1 second
- [ ] Detects thread-specific jank (e.g., JS blocked but UI smooth = bridge bottleneck)
- [ ] Emits to SignalBus as `frameDrop` events with thread attribution
- [ ] Stops monitoring when app is backgrounded

**Integration points:** Emits to SignalBus. Dashboard displays dual-thread FPS graph. FrameDropCollector (Phase 1b) can delegate to this when native module is available.

---

### Task 46: FabricCommitTracker.swift/kt

**Depends on:** Phase 2a native module infrastructure

Tracks Fabric rendering pipeline commits and Yoga layout calculations at the native level.

**Files to create:**
- `ios/FabricCommitTracker.swift`
- `android/src/main/java/com/ernemonitor/FabricCommitTracker.kt`
- `src/collectors/native/FabricCommitCollector.ts`
- `src/collectors/native/FabricCommitCollector.test.ts`

**Acceptance criteria:**
- [ ] Hooks into Fabric commit pipeline to count shadow tree commits per second
- [ ] Measures Yoga layout calculation duration per commit
- [ ] Reports: `commitCount`, `avgCommitDuration`, `maxCommitDuration`, `yogaLayoutTime`
- [ ] Detects layout thrashing (>10 commits/second sustained for >2 seconds)
- [ ] Batches reports every 2 seconds to avoid overhead
- [ ] Graceful no-op if Fabric is not enabled (legacy bridge apps)

**Integration points:** Emits to SignalBus. RenderCollector (Phase 1b) correlates JS re-renders with native commits. Dashboard shows commit frequency timeline.

---

### Task 47: ReplayCapture.swift/kt

**Depends on:** Phase 2a native module, NavigationCollector (#9)

Session replay capture that records visual snapshots, gesture overlay, and applies PII masking.

**Files to create:**
- `ios/ReplayCapture.swift`
- `android/src/main/java/com/ernemonitor/ReplayCapture.kt`
- `src/collectors/native/ReplayCollector.ts`
- `src/collectors/native/ReplayCollector.test.ts`
- `src/processors/ReplayMasker.ts`
- `src/processors/ReplayMasker.test.ts`

**Acceptance criteria:**
- [ ] Captures low-resolution screenshots at configurable interval (default 1fps, max 5fps)
- [ ] Records touch/gesture coordinates as an overlay timeline
- [ ] PII masking: automatically obscures `TextInput` fields with `secureTextEntry`
- [ ] PII masking: blurs views tagged with `accessibilityLabel` containing "password", "email", "phone"
- [ ] Configurable mask list via `replayMaskViews: string[]` in config
- [ ] Storage: writes compressed frames to local ring buffer (max 30 seconds of replay)
- [ ] Respects `consent.replay` gate — no capture without explicit consent
- [ ] iOS: uses `UIView.drawHierarchy(in:afterScreenUpdates:)` for capture
- [ ] Android: uses `PixelCopy` API for capture

**Integration points:** ConsentGate (#23) controls activation. BugReporter (#52) attaches replay to reports. Dashboard plays back replay segments.

---

### Task 48: LayoutSnapshot.swift/kt

**Depends on:** Phase 2a native module infrastructure

Exports the full native UI hierarchy as a serializable tree for debugging layout issues.

**Files to create:**
- `ios/LayoutSnapshot.swift`
- `android/src/main/java/com/ernemonitor/LayoutSnapshot.kt`
- `src/collectors/native/LayoutSnapshotCollector.ts`
- `src/collectors/native/LayoutSnapshotCollector.test.ts`

**Acceptance criteria:**
- [ ] Walks the native view hierarchy and serializes to JSON tree
- [ ] Each node: `{ type, frame: {x,y,w,h}, props, children, accessibilityLabel }`
- [ ] Includes Yoga layout metrics: padding, margin, flex properties
- [ ] Truncates deep trees at 50 levels (configurable)
- [ ] Snapshot capture completes in <100ms for typical app (~500 views)
- [ ] On-demand only — triggered via ref method or BugReporter, not continuous
- [ ] Strips sensitive text content (applies Sanitizer rules)

**Integration points:** BugReporter (#52) attaches layout snapshot. ExpoDevToolsPlugin (#51) can request on-demand snapshots. Dashboard renders interactive tree viewer.

---

### Task 49: Hermes CPU Profiler Integration

**Depends on:** Phase 2a native module infrastructure

Integrates with the Hermes sampling profiler to capture CPU profiles on demand or when performance thresholds are exceeded.

**Files to create:**
- `src/collectors/native/HermesProfilerCollector.ts`
- `src/collectors/native/HermesProfilerCollector.test.ts`
- `ios/HermesProfilerBridge.swift`
- `android/src/main/java/com/ernemonitor/HermesProfilerBridge.kt`

**Acceptance criteria:**
- [ ] Starts/stops Hermes sampling profiler via native bridge
- [ ] Auto-triggers profile capture when JS thread FPS drops below 30 for >2 seconds
- [ ] Manual trigger via `monitor.captureProfile(durationMs)` API
- [ ] Exports `.cpuprofile` format compatible with Chrome DevTools
- [ ] Profile duration capped at 30 seconds to limit memory usage
- [ ] Stores profiles locally with timestamp and triggering event reference
- [ ] Dev-only by default (`mode: 'dev'`), configurable for production sampling

**Integration points:** DualThreadFPS (#45) triggers auto-capture. Dashboard opens profiles in embedded viewer. Source maps (#50) required for symbolicated profiles.

---

### Task 50: Source Map Auto-Upload

**Depends on:** EventStore (#6), transport infrastructure

EAS Build config plugin that automatically uploads source maps during build for production crash symbolication.

**Files to create:**
- `src/plugins/withSourceMapUpload.ts` (Expo config plugin)
- `src/plugins/sourceMapUpload.test.ts`
- `scripts/upload-sourcemaps.sh`

**Acceptance criteria:**
- [ ] Expo config plugin hooks into EAS Build post-build step
- [ ] Extracts Hermes bytecode source maps from build output
- [ ] Uploads to configured endpoint with: `appVersion`, `buildNumber`, `platform`, `bundleId`
- [ ] Supports both iOS and Android build outputs
- [ ] Falls back gracefully if upload endpoint is unreachable (build does not fail)
- [ ] Deduplicates — skips upload if same version+build already exists
- [ ] Works with `eas build` and local `npx expo run:*` builds

**Integration points:** Symbolication service (Phase 3, #60) consumes uploaded maps. CrashCollector (#7) includes `bundleId` in crash events for map lookup.

---

### Task 51: ExpoDevToolsPlugin

**Depends on:** DashboardBridge (#24), all collectors

Real-time monitor tab inside React Native DevTools (Expo DevTools protocol).

**Files to create:**
- `src/integrations/ExpoDevToolsPlugin.ts`
- `src/integrations/ExpoDevToolsPlugin.test.ts`
- `src/integrations/devtools-ui/` (lightweight panel UI)

**Acceptance criteria:**
- [ ] Registers as an Expo DevTools plugin via `expo/devtools` API
- [ ] Appears as "Monitor" tab in React Native DevTools
- [ ] Shows live health grid: Crashes, FPS (JS/UI), Memory, Network errors
- [ ] Shows recent events list with filtering by type
- [ ] Provides "Capture Profile" and "Layout Snapshot" action buttons
- [ ] Updates in real-time via existing DashboardBridge WebSocket
- [ ] Dev-only — stripped from production builds
- [ ] Handles DevTools disconnect/reconnect gracefully

**Integration points:** DashboardBridge (#24) provides data stream. HermesProfiler (#49) and LayoutSnapshot (#48) respond to action buttons.

---

### Task 52: BugReporter

**Depends on:** ReplayCapture (#47), LayoutSnapshot (#48), BreadcrumbCollector (#15)

Shake-to-report bug submission with annotation and context bundling.

**Files to create:**
- `src/integrations/BugReporter.ts`
- `src/integrations/BugReporter.test.ts`
- `src/integrations/BugReporterUI.tsx`
- `ios/ShakeDetector.swift`
- `android/src/main/java/com/ernemonitor/ShakeDetector.kt`

**Acceptance criteria:**
- [ ] Shake gesture (or `DeviceEventEmitter` fallback) triggers report flow
- [ ] Captures current screenshot and allows user annotation (draw/text overlay)
- [ ] Bundles: screenshot, breadcrumb trail, replay segment (last 30s), layout snapshot
- [ ] Includes device info, session ID, current screen, recent events
- [ ] User can add description text before submitting
- [ ] Submits to configured endpoint (or saves locally if no endpoint)
- [ ] Rate-limited — max 1 report per 60 seconds
- [ ] Configurable trigger: shake, floating button, or programmatic only

**Integration points:** ReplayCapture (#47) provides replay segment. LayoutSnapshot (#48) provides hierarchy. BreadcrumbCollector (#15) provides trail. Transport (#54, Phase 3) handles submission.

---

### Task 53: VisualRepro

**Depends on:** NavigationCollector (#9), native screenshot capability

Captures screenshots on navigation transitions to provide visual reproduction steps for crashes.

**Files to create:**
- `src/collectors/native/VisualReproCollector.ts`
- `src/collectors/native/VisualReproCollector.test.ts`
- `ios/ScreenshotCapture.swift`
- `android/src/main/java/com/ernemonitor/ScreenshotCapture.kt`

**Acceptance criteria:**
- [ ] Captures low-resolution screenshot on every screen transition (after transition settles)
- [ ] Stores last 10 screenshots in ring buffer (FIFO eviction)
- [ ] On crash: attaches screenshot sequence as visual reproduction steps
- [ ] Compressed storage — JPEG quality 40, max 200KB per frame
- [ ] Total buffer size capped at 2MB
- [ ] Capture is async and non-blocking — never delays navigation
- [ ] Respects `consent.replay` — no capture without consent
- [ ] PII masking applied before storage (reuses ReplayMasker from #47)

**Integration points:** NavigationCollector (#9) triggers captures. CrashCollector (#7) attaches screenshot sequence on crash. BugReporter (#52) includes screenshots in reports.

---

## Phase Completion Checklist

- [ ] All 9 tasks (45-53) are complete
- [ ] All Phase 2a tests still pass (regression check)
- [ ] All Phase 2b tests pass on both iOS and Android
- [ ] DualThreadFPS correctly differentiates JS vs UI thread jank
- [ ] Replay capture respects consent gate and PII masking
- [ ] BugReporter produces a complete bundle (screenshot, breadcrumbs, replay, layout)
- [ ] ExpoDevToolsPlugin renders in React Native DevTools
- [ ] Source map upload works with EAS Build pipeline
- [ ] Native modules add <500KB to binary size (per platform)
- [ ] Plan adherence audit — spec native architecture and developer tools sections covered
- [ ] Tag: `git tag monitor-phase-2b-complete`
- [ ] TRACKER.md updated
