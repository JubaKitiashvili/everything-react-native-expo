# @erne/monitor — Design Specification

> ERNE Runtime Intelligence SDK — monitoring, analysis, and auto-remediation for React Native & Expo

**Date:** 2026-04-10 (last touched 2026-04-12)
**Status:** Phase 1 implemented — §3, §4, §5, §6, §7 (partial), §8, §9, §14 are live in `packages/monitor/`. See TRACKER.md for live progress.
**Author:** Juba + Claude

---

## 1. Vision

ERNE evolves from code-level intelligence to full-lifecycle platform:

```
v1: Static Analysis    → "sees your code"
v2: + AI Agents        → "sees and fixes your code"
v3: + Runtime Monitor  → "sees your code, sees your app live, fixes automatically"
```

**Value proposition:** ERNE detects runtime issues, correlates them with code, and dispatches AI agents that auto-analyze and fix problems — closing the loop from detection to resolution without developer intervention.

**Competitive moat:** No existing tool (Sentry, Crashlytics, Datadog, Embrace) combines runtime monitoring with AI auto-fix. They collect data; developers fix manually. ERNE monitors AND fixes.

---

## 2. Architecture Overview

### Package Structure

```
@erne/monitor-core          ← Pure TS, platform-agnostic (event schema, buffer, transport)
@erne/monitor-react-native  ← RN adapter (Expo Module API, native crash handlers)
@erne/monitor               ← Meta-package re-exporting both + config plugin
```

Core/adapter split enables future portability (Flutter, KMP, web) without rewriting business logic.

### Subpath Exports (Tree-Shakeable)

```json
{
  "@erne/monitor":              "core + crash reporting (~15KB)",
  "@erne/monitor/performance":  "render timing, FPS, startup spans",
  "@erne/monitor/network":      "request/response logging",
  "@erne/monitor/ai":           "SignalRouter + agent dispatch",
  "@erne/monitor/replay":       "session replay + screenshots",
  "@erne/monitor/dev":          "dev-only collectors (re-renders, state, a11y)"
}
```

### High-Level Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                        APP RUNTIME                          │
│                                                             │
│  Collectors (30)                                            │
│       │                                                     │
│       ▼                                                     │
│  SignalBus (central event bus)                              │
│       │                                                     │
│       ▼                                                     │
│  ConsentGate (GDPR — block transmission until consent)      │
│       │                                                     │
│       ▼                                                     │
│  Sanitizer → AdaptiveSampler → Enricher → Fingerprinter    │
│       │                                                     │
│       ▼                                                     │
│  EventStore (SQLite, priority queue, 50MB cap)              │
│       │                                                     │
│       ├──→ DashboardBridge (WebSocket, real-time)           │
│       ├──→ SignalRouter (AI agent dispatch)                 │
│       ├──→ Transport (offline-first, OTel export)           │
│       └──→ ExpoDevToolsPlugin (dev tools tab)              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. SDK Architecture

### Directory Structure

```
@erne/monitor
├── src/                          ← JS/TS Layer
│   ├── core/
│   │   ├── MonitorClient.ts         — singleton, init/start/stop lifecycle
│   │   ├── Config.ts                — SDK configuration + dynamic config
│   │   ├── SessionManager.ts        — session tracking (5min inactivity = new)
│   │   ├── SignalBus.ts             — central event bus, typed emitter
│   │   └── PlatformBridge.ts        — interface for platform adapters
│   │
│   ├── collectors/               ← Data collectors (plugin-based)
│   │   ├── CrashCollector.ts        — ErrorUtils + Promise rejections
│   │   ├── NetworkCollector.ts      — fetch/XHR monkey-patch
│   │   ├── NavigationCollector.ts   — Expo Router / React Navigation auto-track
│   │   ├── RenderCollector.ts       — re-render detection ★
│   │   ├── FrameDropCollector.ts    — requestAnimationFrame delta ★
│   │   ├── StateCollector.ts        — Zustand/Redux middleware ★
│   │   ├── ImageCollector.ts        — load time, cache miss, oversized ★
│   │   ├── A11yCollector.ts         — runtime accessibility violations ★
│   │   ├── StartupCollector.ts      — cold/warm/hot OTel spans ★
│   │   ├── MemoryCollector.ts       — periodic sampling
│   │   ├── StorageCollector.ts      — AsyncStorage/SQLite/SecureStore ★
│   │   ├── CustomEventCollector.ts  — developer-defined events
│   │   ├── BreadcrumbCollector.ts   — ring buffer (last 100 actions) ★
│   │   ├── TouchBoundaryCollector.ts — component-path tap tracking
│   │   ├── LongTaskCollector.ts     — PerformanceObserver >50ms ★
│   │   ├── FrustrationCollector.ts  — tap→error correlation ★
│   │   ├── SuspenseCollector.ts     — boundary fallback duration ★
│   │   └── ActivityCollector.ts     — wasted pre-render detection ★
│   │
│   ├── processors/
│   │   ├── ConsentGate.ts           — GDPR consent check before export
│   │   ├── Sanitizer.ts            — PII stripping, data redaction
│   │   ├── AdaptiveSampler.ts      — battery/CPU-aware sampling
│   │   ├── Enricher.ts             — device, app, session metadata
│   │   └── Fingerprinter.ts        — normalized stack hash for dedup
│   │
│   ├── storage/
│   │   ├── EventStore.ts            — SQLite buffer, priority queue
│   │   └── ConfigStore.ts           — persistent config cache
│   │
│   ├── transport/
│   │   ├── Transport.ts             — offline-first batch upload
│   │   └── OTelExporter.ts          — OTLP wire protocol export
│   │
│   ├── router/                   ← SignalRouter (AI dispatch)
│   │   ├── SignalRouter.ts          — main orchestrator
│   │   ├── DedupEngine.ts          — hash-based dedup + token bucket
│   │   ├── CorrelationEngine.ts    — 5s window incident grouping
│   │   ├── ConfidenceScorer.ts     — three-tier scoring + self-calibration
│   │   ├── ContextBuilder.ts       — crash context assembly
│   │   ├── DispatchEngine.ts       — auto-fix / suggest / notify
│   │   ├── FeedbackTracker.ts      — outcome logging + pattern learning
│   │   └── PatternLibrary.ts       — crash→fix pattern database
│   │
│   └── integrations/
│       ├── DashboardBridge.ts       — real-time WebSocket to ERNE dashboard
│       ├── ExpoDevToolsPlugin.ts   — dev tools tab integration
│       └── TerminalReporter.ts     — inline warnings in Metro
│
├── ios/                          ← Swift (Expo Module API)
│   ├── MonitorModule.swift          — native module entry point
│   ├── CrashHandler.swift           — signal-safe crash handler
│   │                                  (pre-allocated buffers, write() only,
│   │                                   reconstruct on next launch)
│   ├── ANRDetector.swift            — watchdog thread, main thread monitoring
│   ├── NativeMetrics.swift          — CPU, memory, thermal, battery
│   ├── DualThreadFPS.swift          — native vs JS thread FPS ★
│   ├── FabricCommitTracker.swift    — diff→mutation latency ★
│   ├── ReplayCapture.swift          — snapshot + gesture pairs + privacy mask
│   ├── LayoutSnapshot.swift         — UI hierarchy capture
│   └── SpanSnapshot.swift           — cross-session span persistence
│
├── android/                      ← Kotlin (Expo Module API)
│   ├── MonitorModule.kt
│   ├── CrashHandler.kt             — UncaughtExceptionHandler + NDK signals
│   ├── ANRDetector.kt              — main thread watchdog (5s threshold)
│   ├── NativeMetrics.kt
│   ├── DualThreadFPS.kt            — native vs JS thread FPS ★
│   ├── FabricCommitTracker.kt      — diff→mutation latency ★
│   ├── ReplayCapture.kt
│   ├── LayoutSnapshot.kt
│   └── SpanSnapshot.kt
│
├── plugin/                       ← Expo Config Plugin
│   └── withErneMonitor.ts           — auto-configure native projects
│                                     (Podfile hooks, Gradle deps,
│                                      AppDelegate/MainApplication init,
│                                      ProGuard rules, dSYM upload)
│
├── schemas/                      ← Single Source of Truth (Callstack pattern)
│   └── events.monitor.ts           — event type definitions
│       ↓ ts-morph + codegen
│       ├── src/types/events.generated.ts
│       ├── ios/EventTypes.generated.swift
│       └── android/EventTypes.generated.kt
│
└── package.json
```

**★** = unique to ERNE, no competitor has this

### Collector Interface

```typescript
interface Collector {
  readonly name: string;
  readonly platform: 'all' | 'ios' | 'android';
  readonly mode: 'dev' | 'prod' | 'all';
  readonly priority: number;

  init(config: MonitorConfig): void | Promise<void>;
  start(): void;
  stop(): void;
  dispose(): void;
}

// Third-party extensibility
monitor.use(myCustomCollector);
```

---

## 4. SignalRouter — AI Agent Dispatch

### Architecture

```
EventStore
    ↓
DedupEngine
  hash(type+screen+message) → token bucket (10 events/min)
  crash-loop detector (3 crashes in 5s → SDK disable + meta-event)
    ↓
CorrelationEngine
  5-second window + same screen → single incident
  earliest event = probable root cause
    ↓
ConfidenceScorer
  deterministic crash (clear stack) → 0.85+ → AUTO-FIX
  performance regression           → 0.5-0.85 → SUGGEST
  ambiguous ANR / vague signal     → <0.5 → NOTIFY
  
  Self-calibration: accept/reject rate → threshold adjustment
  Decay: confidence(t) = base * e^(-λ * churn_since_fix)
    ↓
ContextBuilder
  Assembles: stack trace (symbolicated)
           + breadcrumbs (last 100)
           + git blame on crash-site lines
           + React component tree (fiber walk)
           + state snapshot (Zustand/Redux)
           + network requests (last 30s)
           + similar past fixes (pattern library match)
    ↓
DispatchEngine (Three-Tier)
  AUTO-FIX (>0.85):
    1. Plan-first → generate diagnosis/plan
    2. Scope check (≤5 files, reject broader)
    3. Generate fix on isolated branch
    4. Test gate → run existing tests
    5. Present PR/diff for review (never auto-commit to main)

  SUGGEST (0.5-0.85):
    Diagnosis + suggested approach → dashboard + terminal

  NOTIFY (<0.5):
    Enriched context → terminal inline warning (non-blocking)
    ↓
FeedbackTracker
  Record: {signal_type, confidence, action, developer_response, outcome}
  Reward: merged=1.0, edited_then_merged=0.3-0.7, reverted=-1.0
  → PatternLibrary update (AST-level diff patterns)
  → Confidence recalibration
  → MTTR metrics (agent vs human comparison)
```

### Routing Rules

| Signal | Agent/Skill | Default Mode | Threshold |
|--------|-------------|-------------|-----------|
| Fatal crash | `investigate` | auto-fix | always |
| Non-fatal crash | `code-reviewer` | suggest | >3 occurrences |
| ANR detected | `performance-profiler` | suggest | >5s block |
| Frame drops >20% | `performance-profiler` | notify | sustained 10s |
| Re-renders >10x | `code-reviewer` | suggest | per component |
| Network 5xx >3 | `senior-developer` | notify | per endpoint |
| A11y violation | `code-reviewer` | batch | session end |
| Memory >80% | `performance-profiler` | notify | sustained 30s |
| Startup >3s | `performance-profiler` | suggest | cold start |
| Frustration signal | `visual-debugger` | notify | tap→error <3s |
| Suspense >2s | `performance-profiler` | notify | per boundary |
| Fabric commit >16ms | `performance-profiler` | batch | session end |
| State bloat >1MB | `senior-developer` | notify | per store |

### Safety Mechanisms

- **Crash-loop breaker:** 3 crashes in 5 seconds → disable SDK, report meta-event, re-enable on next cold start
- **Token bucket:** 10 events/minute per signal type, prevents storms
- **Scope cap:** auto-fix limited to ≤5 files, broader changes rejected
- **Test gate:** fix only presented if existing tests pass
- **Isolated branch:** never touch main, always separate branch/PR
- **Escalation:** 2 rejected fixes for same pattern → downgrade to notify-only
- **Circuit breaker:** SDK internal errors >5 in 60s → disable non-critical collectors

---

## 5. Data Pipeline

### Consent Gate (GDPR)

```
App launch → SDK buffers locally (SQLite) → NO transmission
    ↓
User grants consent → ConsentGate opens → flush buffer → start transport
User denies consent → purge buffer → disable export (local-only mode)

Per-category consent:
  - crashes: boolean      (usually always allowed)
  - analytics: boolean    (performance, network)
  - replay: boolean       (screenshots, session replay)

DSAR support:
  - monitor.exportUserData(userId) → JSON dump
  - monitor.deleteUserData(userId) → purge from local + remote
```

### EventStore (SQLite)

```
Priority queue:
  CRITICAL: crashes, ANRs         → flush immediately
  HIGH:     network errors, OOM   → flush every 30s
  NORMAL:   performance, renders  → flush every 60s
  LOW:      a11y, custom events   → flush every 5min

Constraints:
  - Size cap: 50MB with LRU eviction (never evict crashes)
  - Retention: auto-purge after 7 days
  - Crash persistence: sync write via pre-allocated buffer
    (signal-safe, survives process death)
```

### Transport (Offline-First)

```
EventStore → batch (gzip compressed)
    ↓
Connectivity check:
  WiFi      → flush immediately
  Cellular  → batch (60s interval)
  Offline   → hold, retry on reconnect

Failure handling:
  - Exponential backoff with jitter (1s, 2s, 4s, 8s... max 5min)
  - Max 3 retries per batch, then re-queue
  - Network error → increment retry counter, not event counter
```

### OTel Export

```
Internal events → OTLP wire protocol
  Crashes   → OTel Logs (severity: FATAL/ERROR)
  Spans     → OTel Traces (W3C trace context)
  Metrics   → OTel Metrics (FPS, memory, startup time)
  Sessions  → OTel root span with child events

Compatible with: Grafana, Honeycomb, Datadog, Jaeger, custom backends
```

---

## 6. Schema Codegen (Callstack Pattern)

Single source of truth for all event types:

```typescript
// schemas/events.monitor.ts

export interface CrashEvent {
  message: string;
  stack: string;
  componentStack?: string;
  isFatal: boolean;
  breadcrumbs: Breadcrumb[];
  fingerprint: string;
}

export interface NetworkEvent {
  url: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  statusCode: number;
  duration: number;
  requestSize?: number;
  responseSize?: number;
}

export interface FrameDropEvent {
  droppedFrames: number;
  expectedFrames: number;
  jsThreadFPS: number;
  nativeThreadFPS: number;
  location: string;
}

export interface RenderEvent {
  componentName: string;
  renderCount: number;
  renderDuration: number;
  isUnnecessary: boolean;
  trigger: string;
}

export interface FrustrationEvent {
  tapTarget: string;
  tapTimestamp: number;
  errorType: string;
  errorMessage: string;
  delayMs: number;
}

// ... all 30 event types defined here
```

Codegen pipeline:
```
events.monitor.ts
    ↓ ts-morph AST parse
    ↓ 
    ├── events.generated.ts     (TS types + runtime validators)
    ├── EventTypes.generated.swift  (Swift Codable structs)
    └── EventTypes.generated.kt    (Kotlin data classes)
```

---

## 7. Performance Budget

| Metric | Budget | Measurement |
|--------|--------|-------------|
| CPU | <2% baseline | Reassure perf tests with/without SDK |
| Memory | <5MB additional | `dumpsys meminfo` / Instruments |
| Battery | <1% per hour | Device lab testing |
| Bundle (JS) | <50KB gzipped | CI size assertion |
| Bundle (native) | <2MB per platform | Archive size check |
| Startup impact | <100ms | TTI delta measurement |
| Network | <1 req/minute (background) | Transport config |

### Adaptive Degradation

```
Battery low (<20%)     → reduce sampling to 10%, disable replay
CPU high (>80%)        → skip non-critical collectors
Network poor           → increase batch interval to 5min
Memory pressure        → flush EventStore, reduce ring buffer to 50
```

---

## 8. Developer Experience

### Setup (Zero-Config)

```bash
# Install
npx expo install @erne/monitor

# Auto-configure (interactive wizard)
npx @erne/monitor init
# → detects project stack (ERNE already has detectProject())
# → generates monitor.config.ts
# → adds config plugin to app.json
# → verifies with test event
```

### Minimal Integration

```typescript
// app/_layout.tsx
import { MonitorProvider } from '@erne/monitor';

export default function Layout() {
  return (
    <MonitorProvider>
      <Stack />
    </MonitorProvider>
  );
}
```

That's it. Everything else is auto-instrumented via Babel plugin and config plugin.

### Configuration

```typescript
// monitor.config.ts
import { defineMonitorConfig } from '@erne/monitor';

export default defineMonitorConfig({
  collectors: {
    crash: true,
    network: true,
    render: 'dev',
    frameDrop: 'dev',
    state: 'dev',
    a11y: 'dev',
    memory: true,
    startup: true,
    replay: 'dev',
  },

  routing: {
    crash: { agent: 'investigate', mode: 'auto-fix' },
    reRender: { agent: 'code-reviewer', mode: 'suggest', threshold: 10 },
    a11y: { enabled: false },
  },

  sampling: { prod: 0.1, dev: 1.0 },

  consent: {
    crashes: true,
    analytics: false,
    replay: false,
  },

  ai: {
    crashExplainer: true,
    autoFix: 'suggest',
    maxFilesPerFix: 5,
  },

  transport: {
    endpoint: null,           // null = local only (Phase 1)
    otelEndpoint: null,       // OTel collector URL (Phase 3)
    batchInterval: 60_000,
    maxBatchSize: 100,
  },
});
```

### Debug vs Release (Automatic)

```
__DEV__ === true:
  - All collectors enabled
  - Verbose console logging
  - No network transmission (local only)
  - Dashboard real-time bridge active
  - Terminal inline warnings in Metro
  - Expo Dev Tools tab active

__DEV__ === false:
  - Only prod-mode collectors
  - Silent capture
  - Batched upload with sampling
  - No console output
```

---

## 9. Dashboard Integration

### ERNE Dashboard — "Runtime" Tab

```
┌──────────────────────────────────────────────────────┐
│  Runtime Monitor                    🟢 Connected     │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Health Grid (traffic lights + sparklines)            │
│  ┌─────────┬─────────┬─────────┬─────────┬────────┐ │
│  │ Crashes │ FPS     │ Memory  │ Network │ Starts │ │
│  │  🔴 1   │ 🟡 54   │ 🟢 42MB │ 🟢 100% │ 🟢 1.2s│ │
│  └─────────┴─────────┴─────────┴─────────┴────────┘ │
│                                                      │
│  Live Signals (reverse-chronological)                │
│  ┌──────────────────────────────────────────────────┐│
│  │ 🔴 CRASH TypeError at Profile:42          2s ago ││
│  │   → investigate agent dispatched                 ││
│  │   → AI: "missing optional chaining on            ││
│  │          user.settings.name — new accounts       ││
│  │          have no settings object"                 ││
│  │   [Apply Fix] [Dismiss] [Create Issue]           ││
│  │                                                  ││
│  │ 🟡 PERF  12 re-renders on UserList        30s   ││
│  │   → suggestion: add useMemo on filtered results  ││
│  │   [Show Details] [Snooze]                        ││
│  │                                                  ││
│  │ 🟢 NET   GET /api/users → 200 (234ms)    1m    ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  Breadcrumb Timeline (crash context)                 │
│  ┌──────────────────────────────────────────────────┐│
│  │ 🧭 /home → /profile                      -5s   ││
│  │ 🌐 GET /api/user/123 → 200               -4s   ││
│  │ 📦 userStore.setUser(data)                -3s   ││
│  │ 👆 Tap: Button[Settings]                  -2s   ││
│  │ 🔄 ProfileScreen rendered (3rd time)      -1s   ││
│  │ 💥 CRASH: TypeError                       now   ││
│  └──────────────────────────────────────────────────┘│
│                                                      │
│  AI Insights                                         │
│  • agent fix success rate: 73%                       │
│  • median time-to-fix: 4.2min (vs 35min manual)     │
│  • pattern library: 12 learned patterns              │
└──────────────────────────────────────────────────────┘
```

### Expo Dev Tools Plugin

Real-time monitoring tab in Expo dev tools with:
- Live events stream
- Performance swimlanes (JS thread / UI thread / Network)
- Re-render heatmap on component tree
- Network waterfall
- Breadcrumb timeline

---

## 10. Testing Strategy

### SDK Self-Testing

| Layer | Tool | What |
|-------|------|------|
| Unit | Jest | Collectors, processors, SignalRouter logic |
| Integration | Local relay server | Capture events, assert payload structure |
| E2E | Maestro + fixture app | Inject crashes, verify capture + display |
| Performance | Reassure | SDK overhead regression testing |
| Native | XCTest / JUnit | Crash handlers, ANR detection, metrics |
| CI Matrix | GitHub Actions | RN versions × architecture × platform |

### Chaos Testing

```
CrashInjector.triggerJSCrash()       → verify CrashCollector captures
CrashInjector.triggerNativeCrash()   → verify signal-safe handler persists
CrashInjector.triggerANR(6000)       → verify ANRDetector fires at 5s
CrashInjector.triggerCrashLoop()     → verify circuit breaker activates
NetworkDegrader.simulateOffline()    → verify EventStore queues + flushes
```

### Synthetic Events

```typescript
import { generateSyntheticEvent } from '@erne/monitor/testing';

const crash = generateSyntheticEvent('crash', { isFatal: true });
// Tagged with _synthetic: true, filtered from real metrics
// Used for: dashboard rendering tests, pipeline validation, alert rule testing
```

### SDK Self-Monitoring

```
Internal error counter (not recursive — does NOT use own pipeline)
_diagnostics channel: dropped events, queue depth, flush failures
Circuit breaker: >5 internal errors in 60s → disable non-critical features
```

---

## 11. Phased Rollout

### Dependency Graph

```
Phase 1a ──→ Phase 1b ──→ Phase 1c ──→ Phase 2a ──→ Phase 3
(Foundation)  (Intelligence) (AI)        (Native Core) (Backend)
                                             │
                                             ├──→ Phase 2b (parallel with Phase 3)
                                             │    (Native Advanced)
                                             │
                                                         ├──→ Phase 4
                                                              (Advanced Intelligence)
```

**Critical path:** 1a → 1b → 1c → 2a → 3
**Parallelizable:** Phase 2b runs alongside Phase 3 (independent)

### Phase 1a: Foundation + Core Collectors (MVP)

**Goal:** "ERNE sees what happens in your app"
**Depends on:** Nothing — this is the starting point

Build order (sequenced by dependency):
1. `MonitorClient` — singleton, init/start/stop lifecycle
2. `Config` — defineMonitorConfig, dynamic config
3. `PlatformBridge` — interface for platform adapters
4. `SignalBus` — typed event emitter (all collectors emit here)
5. `SessionManager` — 5min inactivity = new session
6. `EventStore` — SQLite buffer with priority queue
7. `CrashCollector` — ErrorUtils + Promise rejections (highest value)
8. `NetworkCollector` — fetch/XHR monkey-patch (second highest value)
9. `NavigationCollector` — Expo Router / React Navigation auto-track
10. `CustomEventCollector` — developer-defined events
11. `Sanitizer` — PII stripping, data redaction
12. `Enricher` — device, app, session metadata
13. `TerminalReporter` — Metro inline warnings (sufficient output for MVP)
14. `MonitorProvider` — React component wrapper

**Why this order:**
- Foundation (1-6) is required by everything else
- Crash + Network (7-8) deliver highest value with minimal effort
- Navigation (9) is needed for breadcrumbs in Phase 1b
- Terminal reporter (13) is the simplest output — dashboard not needed yet

**Backend:** SQLite only (local). Zero infrastructure required.
**Deliverable:** `npm install @erne/monitor` → wrap app → see crashes + network in terminal

### Phase 1b: Intelligence Collectors + Dashboard

**Goal:** "ERNE sees and visualizes runtime intelligence"
**Depends on:** Phase 1a (foundation + core collectors must be stable)

Build order:
15. `BreadcrumbCollector` — ring buffer, last 100 actions ★ (needs crash + network + navigation from 1a)
16. `RenderCollector` — re-render detection ★ (independent)
17. `FrameDropCollector` — requestAnimationFrame delta ★ (independent)
18. `StartupCollector` — cold/warm/hot OTel spans ★ (independent)
19. `MemoryCollector` — periodic sampling (independent)
20. `LongTaskCollector` — PerformanceObserver >50ms ★ (independent)
21. `Fingerprinter` — normalized stack hash for dedup (needs CrashCollector)
22. `AdaptiveSampler` — battery/CPU-aware sampling
23. `ConsentGate` — GDPR consent check (must exist before Transport in Phase 3)
24. `DashboardBridge` — WebSocket real-time to ERNE dashboard
25. ERNE Dashboard "Runtime" tab — health grid, live signals, breadcrumb timeline

**Why this order:**
- BreadcrumbCollector (15) can now consume events from crash, network, navigation
- Performance collectors (16-20) are independent — can be built in parallel
- Fingerprinter (21) needs CrashCollector data to deduplicate
- Dashboard (24-25) now has enough data to be meaningful

**Deliverable:** Dashboard shows real-time crashes, breadcrumbs, re-renders, FPS, startup time

### Phase 1c: AI Integration + Advanced Collectors

**Goal:** "ERNE sees, analyzes, and suggests fixes"
**Depends on:** Phase 1b (breadcrumbs, fingerprinting, dashboard must work)

Build order:
26. `TouchBoundaryCollector` — component-path tap tracking (independent)
27. `FrustrationCollector` — tap→error correlation ★ (needs TouchBoundary + CrashCollector)
28. `StateCollector` — Zustand/Redux middleware ★ (independent)
29. `SuspenseCollector` — boundary fallback duration ★ (independent, React 19)
30. `ActivityCollector` — wasted pre-render detection ★ (independent, React 19)
31. `ImageCollector` — load time, cache miss, oversized ★ (independent)
32. `A11yCollector` — runtime accessibility violations ★ (independent)
33. `StorageCollector` — AsyncStorage/SQLite/SecureStore pressure ★ (independent)
34. SignalRouter (full system):
    - `DedupEngine` — hash-based dedup + token bucket
    - `CorrelationEngine` — 5s window incident grouping (needs 3+ collector types)
    - `ConfidenceScorer` — three-tier scoring + self-calibration
    - `ContextBuilder` — assembles crash context (needs breadcrumbs + state + network)
    - `DispatchEngine` — auto-fix / suggest / notify (needs ERNE agents)
    - `FeedbackTracker` — outcome logging + pattern learning
    - `PatternLibrary` — crash→fix pattern database
35. Schema codegen — ts-morph → Swift/Kotlin types (preparation for Phase 2)
36. Babel auto-instrumentation plugin — zero-config collector injection
37. `npx @erne/monitor init` — interactive setup wizard + verify step

**Why this order:**
- Advanced collectors (26-33) are mostly independent, can be parallelized
- FrustrationCollector (27) needs TouchBoundary (26) — build Touch first
- SignalRouter (34) is the capstone — needs everything else working
- Schema codegen (35) prepares native types for Phase 2
- Setup wizard (37) is polish — comes last

**Deliverable:** crash → AI analysis → fix suggestion in dashboard + terminal

### Phase 2a: Native Core

**Goal:** "Production-grade crash and performance monitoring"
**Depends on:** Phase 1c (schema codegen must exist for type generation)

Build order:
38. Expo Module API setup — MonitorModule.swift/kt entry points
39. Schema codegen execution — generate Swift Codable + Kotlin data classes
40. `CrashHandler.swift/kt` — signal-safe, pre-allocated buffers, write() only, reconstruct on next launch
41. `ANRDetector.swift/kt` — watchdog thread, main thread monitoring (5s threshold)
42. `NativeMetrics.swift/kt` — CPU, memory, thermal state, battery
43. `SpanSnapshot.swift/kt` — cross-session span persistence
44. Expo Config Plugin — `withErneMonitor.ts` (Podfile hooks, Gradle deps, AppDelegate init, ProGuard rules)

**Why this order:**
- Module setup (38-39) before any native code
- CrashHandler (40) is highest value native feature
- Config plugin (44) last — needs to know all native dependencies

**Deliverable:** Native crashes captured, ANRs detected, system metrics visible

### Phase 2b: Native Advanced (parallel with Phase 3)

**Goal:** "Deep native insights + developer tools"
**Depends on:** Phase 2a (native module infrastructure must work)
**Can run parallel with:** Phase 3 (no shared dependencies)

Build order:
45. `DualThreadFPS.swift/kt` — native vs JS thread FPS ★
46. `FabricCommitTracker.swift/kt` — React diff→native mutation latency ★
47. `ReplayCapture.swift/kt` — snapshot + gesture pairs + privacy masking
48. `LayoutSnapshot.swift/kt` — UI hierarchy capture
49. Hermes CPU profiler integration — per-span profiling
50. Source map auto-upload — EAS Build plugin hook
51. `ExpoDevToolsPlugin` — real-time monitoring tab in Expo dev tools
52. `BugReporter` — shake → screenshot annotation → submit
53. `VisualRepro` — low-res screenshot on every navigation

### Phase 3: Production Backend

**Goal:** "Cloud-scale monitoring for production apps"
**Depends on:** Phase 2a (native crash handling for production-ready SDK)
**Can run parallel with:** Phase 2b

Build order:
54. `Transport` — offline-first batch upload (gzip, exponential backoff, connectivity-aware)
55. `OTelExporter` — OTLP wire protocol (spans, logs, metrics)
56. PostgreSQL — schema + migrations (config, users, apps, API keys)
57. ClickHouse — schema + materialized views (events, spans, sessions, metrics)
58. Ingest service — event receiver (HTTP endpoint)
59. Ingest workers — async processing (symbolication, enrichment)
60. Symbolication service — dSYM + ProGuard mapping upload + resolution
61. Alerting engine — threshold-based, email + Slack
62. Data retention / cleanup — configurable TTL, auto-purge

### Phase 4: Advanced Intelligence

**Goal:** "Self-improving, cross-project intelligence"
**Depends on:** Phase 3 (backend for persistence and cross-project data)

63. `PatternLibrary` server-side persistence — crash→fix mappings stored in PostgreSQL
64. Cross-project learning — opt-in, anonymized AST-level patterns
65. On-device ML — ExecuTorch anomaly detection model on background worklet
66. OTA pattern/model updates — JSON rules via expo-updates, .pte via ResourceFetcher
67. MTTR/DORA metrics dashboard — agent vs human resolution comparison
68. Plugin/extension marketplace — third-party collector registry
69. RSC monitoring — Expo Router server component error/latency tracking
70. Metro auto-instrumentation — build-time module injection via serializer config

---

## 12. Reference Projects Analyzed

| Project | What We Learned |
|---------|----------------|
| **Measure.sh** | Backend architecture (8 Go services, ClickHouse, Iggy queue), native SDK patterns, data ingestion pipeline, symbolication flow |
| **Callstack Brownfield** | Single-source-of-truth codegen (ts-morph → Swift/Kotlin), JSI/C++ shared state, convention-based discovery, conditional pipeline composition, AST-based code analysis |
| **Sentry RN SDK** | Breadcrumbs system, TouchEventBoundary, Hermes profiler integration, signal-safe crash handlers, offline envelope transport, error fingerprinting |
| **Embrace.io** | OTel-native session model, span snapshots for cross-session traces, cold/warm startup classification |
| **Datadog RUM** | Frustration signals (tap→error correlation), dual-thread FPS monitoring |
| **Instabug** | In-app bug reporting with screenshot annotation, visual repro steps |

---

## 13. Competitive Advantages

| Feature | Sentry | Crashlytics | Datadog | Embrace | **ERNE** |
|---------|--------|-------------|---------|---------|----------|
| Crash reporting | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance tracing | ✅ | ❌ | ✅ | ✅ | ✅ |
| Session replay | ✅ | ❌ | ✅ | ❌ | ✅ |
| AI crash analysis | Basic | Gemini (Android) | ❌ | ❌ | **Full** ★ |
| AI auto-fix | ❌ | ❌ | ❌ | ❌ | **✅** ★ |
| Re-render detection | ❌ | ❌ | ❌ | ❌ | **✅** ★ |
| Fabric commit tracking | ❌ | ❌ | ❌ | ❌ | **✅** ★ |
| Suspense tracking | ❌ | ❌ | ❌ | ❌ | **✅** ★ |
| Frustration signals | ❌ | ❌ | ✅ | ❌ | **✅** |
| Dual-thread FPS | ❌ | ❌ | ✅ | ❌ | **✅** |
| OTel export | ❌ | ❌ | ✅ | ✅ | **✅** |
| Zero-config setup | Partial | ✅ | Partial | Partial | **✅** |
| IDE-native | ❌ | ❌ | ❌ | ❌ | **✅** ★ |
| Self-learning | ❌ | ❌ | ❌ | ❌ | **✅** ★ |
| Free self-hosted | ❌ | ❌ | ❌ | ❌ | **✅** ★ |

**★** = ERNE exclusive, no competitor offers this

---

## 14. Privacy & Compliance

- **Consent-first:** No data transmission before user consent
- **Per-category consent:** crashes, analytics, replay — independent toggles
- **PII stripping:** emails, phone numbers, auth headers auto-redacted
- **Privacy manifest:** Apple nutrition labels — "Diagnostics: Crash Data" only
- **No device identifiers:** no IDFA, no IDFV without explicit opt-in
- **Data retention:** configurable, auto-purge after N days
- **DSAR compliance:** export/delete user data API
- **On-device first:** Phase 1 stores everything locally, no cloud dependency

---

## 15. Open Questions

1. **Pricing model:** Free for self-hosted? Per-project for cloud? Event-based (Sentry model, hated by users)?
2. **Multi-app support:** Can one backend serve multiple apps? Workspace/team model?
3. **React Native version support:** Minimum RN version? New Architecture only?
4. **Community collectors:** marketplace for third-party collectors? Review process?
