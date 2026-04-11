# Phase 1b: Intelligence Collectors + Dashboard

> **Status: ✅ Complete (11/11)** — closed 2026-04-12. Live-verified on iPhone 17 Pro with DashboardBridge streaming to `dashboard/public/runtime.html` via WebSocket.

**Goal:** "ERNE sees and visualizes runtime intelligence"
**Depends on:** Phase 1a (foundation + core collectors must be stable)
**Deliverable:** Dashboard shows real-time crashes, breadcrumbs, re-renders, FPS, startup time

---

## Success Criteria

- [ ] BreadcrumbCollector captures last 100 actions leading to any event
- [ ] RenderCollector detects unnecessary re-renders with component names
- [ ] FrameDropCollector monitors FPS and reports drops below 55fps
- [ ] StartupCollector measures cold/warm/hot launch time
- [ ] Dashboard "Runtime" tab shows health grid + live signals + breadcrumb timeline
- [ ] ConsentGate blocks data transmission until consent is granted
- [ ] All Phase 1a tests still pass (integration verification)

---

## Tasks

### Task 15: BreadcrumbCollector ★

**Depends on:** CrashCollector (#7), NetworkCollector (#8), NavigationCollector (#9)

Ring buffer that records the last 100 user actions. Attached to every crash event as context.

**Files to create:**
- `src/collectors/BreadcrumbCollector.ts`
- `src/collectors/BreadcrumbCollector.test.ts`

**Acceptance criteria:**
- [ ] Subscribes to SignalBus — consumes crash, network, navigation events
- [ ] Maintains ring buffer of 100 entries
- [ ] Each breadcrumb: `{ type, category, message, timestamp, data }`
- [ ] Categories: navigation, network, ui.tap, state, console, lifecycle
- [ ] Automatically attaches breadcrumb trail to crash events
- [ ] Thread-safe buffer access

**Spec reference:** §4 SignalRouter — ContextBuilder

---

### Task 16: RenderCollector ★

**Depends on:** SignalBus (#4) only

Detects unnecessary re-renders using React Profiler API.

**Files to create:**
- `src/collectors/RenderCollector.ts`
- `src/collectors/RenderCollector.test.ts`

**Acceptance criteria:**
- [ ] Uses React Profiler API to track render counts per component
- [ ] Identifies unnecessary re-renders (same props → same output)
- [ ] Reports: componentName, renderCount, renderDuration, isUnnecessary, trigger
- [ ] Only active in dev mode (`mode: 'dev'`)
- [ ] Debounced — batches render events over 1-second window

**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 17: FrameDropCollector ★

**Depends on:** SignalBus (#4) only

Monitors frame rate using requestAnimationFrame delta.

**Files to create:**
- `src/collectors/FrameDropCollector.ts`
- `src/collectors/FrameDropCollector.test.ts`

**Acceptance criteria:**
- [ ] Uses requestAnimationFrame to measure frame timing
- [ ] Reports when FPS drops below 55 for >500ms (sustained drop, not single frame)
- [ ] Reports: droppedFrames, expectedFrames, location (current screen)
- [ ] Low overhead — rAF callback is minimal
- [ ] Stops monitoring when app is backgrounded

**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 18: StartupCollector ★

**Depends on:** SignalBus (#4), NavigationCollector (#9)

Measures app startup time with cold/warm/hot classification.

**Files to create:**
- `src/collectors/StartupCollector.ts`
- `src/collectors/StartupCollector.test.ts`

**Acceptance criteria:**
- [ ] Uses performance.mark() / performance.measure() for timing
- [ ] Classifies startup: cold (process start), warm (JS reload), hot (foreground)
- [ ] Measures phases: JS init, first render, first navigation, interactive
- [ ] Reports as OTel-compatible span structure
- [ ] Warns if cold start exceeds 3 seconds

**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 19: MemoryCollector

**Depends on:** SignalBus (#4), PlatformBridge (#3)

Periodic memory usage sampling.

**Files to create:**
- `src/collectors/MemoryCollector.ts`
- `src/collectors/MemoryCollector.test.ts`

**Acceptance criteria:**
- [ ] Samples memory every 30 seconds (configurable)
- [ ] Uses PlatformBridge.getMemoryUsage() (JS-only values in Phase 1)
- [ ] Reports: heapUsed, heapTotal, timestamp
- [ ] Warns when memory exceeds 80% threshold
- [ ] Stops sampling when backgrounded, resumes on foreground

**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 20: LongTaskCollector ★

**Depends on:** SignalBus (#4) only

Detects JS thread blocks >50ms using PerformanceObserver.

**Files to create:**
- `src/collectors/LongTaskCollector.ts`
- `src/collectors/LongTaskCollector.test.ts`

**Acceptance criteria:**
- [ ] Uses PerformanceObserver for 'longtask' entries (RN 0.83+)
- [ ] Falls back to rAF-based detection if PerformanceObserver unavailable
- [ ] Reports: duration, location (current screen), timestamp
- [ ] Threshold: >50ms is a long task (W3C standard)

**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 21: Fingerprinter

**Depends on:** CrashCollector (#7)

Generates deterministic hashes for crash dedup.

**Files to create:**
- `src/processors/Fingerprinter.ts`
- `src/processors/Fingerprinter.test.ts`

**Acceptance criteria:**
- [ ] Normalizes stack traces: strip line numbers, collapse bridge frames
- [ ] Generates hash from: error type + top 3 in-app frames
- [ ] Stable — same crash always produces same fingerprint
- [ ] Adds fingerprint field to crash events
- [ ] Used by DedupEngine (Phase 1c) for grouping

**Spec reference:** §4 SignalRouter — DedupEngine

---

### Task 22: AdaptiveSampler

**Depends on:** Config (#2), PlatformBridge (#3)

Battery and CPU-aware event sampling.

**Files to create:**
- `src/processors/AdaptiveSampler.ts`
- `src/processors/AdaptiveSampler.test.ts`

**Acceptance criteria:**
- [ ] Sampling rate from config: dev=1.0, prod=0.1
- [ ] Adaptive: battery <20% → reduce to 10% of configured rate
- [ ] Adaptive: CPU high → skip non-critical collectors
- [ ] Never samples crashes — they always pass through
- [ ] Deterministic sampling per session (same session = same decision)

**Spec reference:** §7 Performance Budget — Adaptive Degradation

---

### Task 23: ConsentGate

**Depends on:** Config (#2), EventStore (#6)

GDPR consent management — blocks data transmission until consent.

**Files to create:**
- `src/processors/ConsentGate.ts`
- `src/processors/ConsentGate.test.ts`

**Acceptance criteria:**
- [ ] Per-category consent: crashes, analytics, replay
- [ ] Before consent: buffer locally in EventStore, never transmit
- [ ] On consent granted: flush buffered events, start transport
- [ ] On consent denied: purge buffer for denied categories
- [ ] API: monitor.setConsent({ crashes: true, analytics: false })
- [ ] Persists consent state across sessions (ConfigStore)

**Spec reference:** §14 Privacy & Compliance

---

### Task 24: DashboardBridge

**Depends on:** SignalBus (#4), EventStore (#6)

WebSocket bridge for real-time data to ERNE dashboard.

**Files to create:**
- `src/integrations/DashboardBridge.ts`
- `src/integrations/DashboardBridge.test.ts`

**Acceptance criteria:**
- [ ] Only active in `__DEV__` mode
- [ ] Connects to ERNE dashboard via WebSocket
- [ ] Streams events in real-time from SignalBus
- [ ] Handles disconnect/reconnect gracefully
- [ ] Sends initial state dump on connect (recent events from EventStore)
- [ ] Protocol: JSON messages with type discriminator

**Spec reference:** §9 Dashboard Integration

---

### Task 25: ERNE Dashboard "Runtime" Tab

**Depends on:** DashboardBridge (#24), all collectors from Phase 1a-1b

New tab in existing ERNE dashboard.

**Files to create/modify:**
- Dashboard server: route handler for monitor WebSocket
- Dashboard UI: Runtime tab with health grid, live signals, breadcrumb timeline

**Acceptance criteria:**
- [ ] Health grid: traffic light status for Crashes, FPS, Memory, Network, Startup
- [ ] Live signals: reverse-chronological event stream with color coding
- [ ] Breadcrumb timeline: visual trail leading to crash events
- [ ] Auto-updates via WebSocket (no polling)
- [ ] Works when monitor is not connected (shows "disconnected" state)

**Spec reference:** §9 Dashboard Integration

---

## Phase Completion Checklist

- [ ] All 11 tasks (15-25) are ✅
- [ ] All Phase 1a tests still pass (regression check)
- [ ] All Phase 1b tests pass
- [ ] Dashboard renders correctly with real data
- [ ] ConsentGate properly blocks/allows transmission
- [ ] Bundle size < 35KB gzipped (cumulative 1a + 1b)
- [ ] Plan adherence audit — spec §5, §7, §9, §14 covered
- [ ] Tag: `git tag monitor-phase-1b-complete`
- [ ] TRACKER.md updated, Phase 1c unblocked
