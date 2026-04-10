# SDK Architecture

> Package structure, directory layout, collector interface, exports, and tree shaking for @erne/monitor.

---

## Package Structure

The SDK is split into three packages following a core/adapter pattern that enables future portability (Flutter, KMP, web) without rewriting business logic.

```
@erne/monitor-core          <- Pure TS, platform-agnostic
@erne/monitor-react-native  <- RN adapter (Expo Module API, native crash handlers)
@erne/monitor               <- Meta-package re-exporting both + config plugin
```

### Why Three Packages

| Package | Contents | Platform | Size Budget |
|---------|----------|----------|-------------|
| `@erne/monitor-core` | Event schema, buffer, transport, SignalRouter, processors | Any JS runtime | <30KB gzip |
| `@erne/monitor-react-native` | Native modules (Swift/Kotlin), Expo Module API bindings, platform-specific collectors | React Native | <2MB native per platform |
| `@erne/monitor` | Meta-package, config plugin, Babel plugin, CLI (`npx @erne/monitor init`) | React Native + Expo | Wrapper only |

Developers install `@erne/monitor` and get everything. Library authors or advanced users can depend on `@erne/monitor-core` alone for custom integrations.

---

## Subpath Exports (Tree-Shakeable)

Each subpath is independently importable. Bundlers (Metro) tree-shake unused subpaths, keeping production bundles minimal.

```jsonc
// package.json exports map
{
  ".":             "core + crash reporting (~15KB)",
  "./performance": "render timing, FPS, startup spans",
  "./network":     "request/response logging",
  "./ai":          "SignalRouter + agent dispatch",
  "./replay":      "session replay + screenshots",
  "./dev":         "dev-only collectors (re-renders, state, a11y)",
  "./testing":     "synthetic events, chaos testing utilities"
}
```

### Import Examples

```typescript
// Minimal — crash reporting only (production)
import { MonitorProvider } from '@erne/monitor';

// Add performance monitoring
import '@erne/monitor/performance';

// Add AI dispatch (SignalRouter)
import '@erne/monitor/ai';

// Dev-only collectors (stripped in production builds)
if (__DEV__) {
  require('@erne/monitor/dev');
}

// Testing utilities
import { generateSyntheticEvent, CrashInjector } from '@erne/monitor/testing';
```

### Bundle Impact by Subpath

```
@erne/monitor (base)        ~15KB gzip   <- crash + core
  + /performance            ~8KB gzip    <- FPS, render, startup
  + /network                ~5KB gzip    <- fetch/XHR intercept
  + /ai                     ~12KB gzip   <- SignalRouter, dispatch
  + /replay                 ~10KB gzip   <- screenshots, gesture replay
  + /dev                    ~0KB prod    <- tree-shaken in release
                            ─────────
Total (all features):       ~50KB gzip   <- within budget
```

---

## Directory Structure

```
@erne/monitor
├── src/                          <- JS/TS Layer
│   ├── core/
│   │   ├── MonitorClient.ts         Singleton, init/start/stop lifecycle
│   │   ├── Config.ts                SDK configuration + dynamic config
│   │   ├── SessionManager.ts        Session tracking (5min inactivity = new)
│   │   ├── SignalBus.ts             Central event bus, typed emitter
│   │   └── PlatformBridge.ts        Interface for platform adapters
│   │
│   ├── collectors/               <- Data collectors (plugin-based)
│   │   ├── CrashCollector.ts        ErrorUtils + Promise rejections
│   │   ├── NetworkCollector.ts      fetch/XHR monkey-patch
│   │   ├── NavigationCollector.ts   Expo Router / React Navigation auto-track
│   │   ├── RenderCollector.ts       Re-render detection
│   │   ├── FrameDropCollector.ts    requestAnimationFrame delta
│   │   ├── StateCollector.ts        Zustand/Redux middleware
│   │   ├── ImageCollector.ts        Load time, cache miss, oversized
│   │   ├── A11yCollector.ts         Runtime accessibility violations
│   │   ├── StartupCollector.ts      Cold/warm/hot OTel spans
│   │   ├── MemoryCollector.ts       Periodic sampling
│   │   ├── StorageCollector.ts      AsyncStorage/SQLite/SecureStore
│   │   ├── CustomEventCollector.ts  Developer-defined events
│   │   ├── BreadcrumbCollector.ts   Ring buffer (last 100 actions)
│   │   ├── TouchBoundaryCollector.ts Component-path tap tracking
│   │   ├── LongTaskCollector.ts     PerformanceObserver >50ms
│   │   ├── FrustrationCollector.ts  Tap-to-error correlation
│   │   ├── SuspenseCollector.ts     Boundary fallback duration
│   │   └── ActivityCollector.ts     Wasted pre-render detection
│   │
│   ├── processors/
│   │   ├── ConsentGate.ts           GDPR consent check before export
│   │   ├── Sanitizer.ts            PII stripping, data redaction
│   │   ├── AdaptiveSampler.ts      Battery/CPU-aware sampling
│   │   ├── Enricher.ts             Device, app, session metadata
│   │   └── Fingerprinter.ts        Normalized stack hash for dedup
│   │
│   ├── storage/
│   │   ├── EventStore.ts            SQLite buffer, priority queue
│   │   └── ConfigStore.ts           Persistent config cache
│   │
│   ├── transport/
│   │   ├── Transport.ts             Offline-first batch upload
│   │   └── OTelExporter.ts          OTLP wire protocol export
│   │
│   ├── router/                   <- SignalRouter (AI dispatch)
│   │   ├── SignalRouter.ts          Main orchestrator
│   │   ├── DedupEngine.ts          Hash-based dedup + token bucket
│   │   ├── CorrelationEngine.ts    5s window incident grouping
│   │   ├── ConfidenceScorer.ts     Three-tier scoring + self-calibration
│   │   ├── ContextBuilder.ts       Crash context assembly
│   │   ├── DispatchEngine.ts       Auto-fix / suggest / notify
│   │   ├── FeedbackTracker.ts      Outcome logging + pattern learning
│   │   └── PatternLibrary.ts       Crash-to-fix pattern database
│   │
│   └── integrations/
│       ├── DashboardBridge.ts       Real-time WebSocket to ERNE dashboard
│       ├── ExpoDevToolsPlugin.ts   Dev tools tab integration
│       └── TerminalReporter.ts     Inline warnings in Metro
│
├── ios/                          <- Swift (Expo Module API)
│   ├── MonitorModule.swift          Native module entry point
│   ├── CrashHandler.swift           Signal-safe crash handler
│   ├── ANRDetector.swift            Watchdog thread, main thread monitoring
│   ├── NativeMetrics.swift          CPU, memory, thermal, battery
│   ├── DualThreadFPS.swift          Native vs JS thread FPS
│   ├── FabricCommitTracker.swift    Diff-to-mutation latency
│   ├── ReplayCapture.swift          Snapshot + gesture pairs + privacy mask
│   ├── LayoutSnapshot.swift         UI hierarchy capture
│   └── SpanSnapshot.swift           Cross-session span persistence
│
├── android/                      <- Kotlin (Expo Module API)
│   ├── MonitorModule.kt
│   ├── CrashHandler.kt             UncaughtExceptionHandler + NDK signals
│   ├── ANRDetector.kt              Main thread watchdog (5s threshold)
│   ├── NativeMetrics.kt
│   ├── DualThreadFPS.kt            Native vs JS thread FPS
│   ├── FabricCommitTracker.kt      Diff-to-mutation latency
│   ├── ReplayCapture.kt
│   ├── LayoutSnapshot.kt
│   └── SpanSnapshot.kt
│
├── plugin/                       <- Expo Config Plugin
│   └── withErneMonitor.ts           Auto-configure native projects
│
├── schemas/                      <- Single Source of Truth
│   └── events.monitor.ts           Event type definitions
│       (codegen outputs)
│       ├── src/types/events.generated.ts
│       ├── ios/EventTypes.generated.swift
│       └── android/EventTypes.generated.kt
│
└── package.json
```

---

## Collector Interface

Every data collector implements a standard interface, enabling plugin-based extensibility.

```typescript
interface Collector {
  /** Unique identifier (e.g., 'crash', 'network', 'render') */
  readonly name: string;

  /** Platform filter — skip registration on non-matching platforms */
  readonly platform: 'all' | 'ios' | 'android';

  /** Mode filter — 'dev' collectors are stripped from production builds */
  readonly mode: 'dev' | 'prod' | 'all';

  /** Priority for initialization order (lower = earlier) */
  readonly priority: number;

  /** Initialize with SDK config. May be async for native module setup. */
  init(config: MonitorConfig): void | Promise<void>;

  /** Start collecting data. Called after all collectors are initialized. */
  start(): void;

  /** Pause collection (e.g., app backgrounded). */
  stop(): void;

  /** Release all resources. Called on SDK teardown. */
  dispose(): void;
}
```

### Collector Registration

Collectors self-register via the MonitorClient singleton. Third-party collectors use the same interface.

```typescript
// Built-in registration (internal)
class CrashCollector implements Collector {
  readonly name = 'crash';
  readonly platform = 'all';
  readonly mode = 'all';
  readonly priority = 0; // highest priority — initialized first

  init(config: MonitorConfig) {
    // Install ErrorUtils handler
    // Install unhandledrejection handler
  }

  start() {
    // Activate crash capture
  }

  stop() {
    // Deactivate (but keep handler installed for safety)
  }

  dispose() {
    // Restore original handlers
  }
}

// Third-party extensibility
import { monitor } from '@erne/monitor';

monitor.use(myCustomCollector);
```

### Collector Lifecycle

```
MonitorClient.init(config)
    |
    v
For each collector (sorted by priority):
    collector.init(config)    <- configure, attach native bridges
    |
    v
MonitorClient.start()
    |
    v
For each collector:
    collector.start()         <- begin emitting events to SignalBus
    |
    v
(App runs, collectors emit events)
    |
    v
MonitorClient.stop()
    |
    v
For each collector (reverse order):
    collector.stop()          <- pause collection
    collector.dispose()       <- release resources
```

### Collector-to-SignalBus Flow

```
Collector                    SignalBus                   Processors
   |                            |                           |
   |-- emit(event) ----------->|                           |
   |                            |-- ConsentGate check ---->|
   |                            |                           |-- Sanitize
   |                            |                           |-- Sample
   |                            |                           |-- Enrich
   |                            |                           |-- Fingerprint
   |                            |                           |
   |                            |<-- processed event -------|
   |                            |
   |                            |-- route to:
   |                            |     EventStore (persist)
   |                            |     DashboardBridge (real-time)
   |                            |     SignalRouter (AI dispatch)
   |                            |     Transport (upload)
```

---

## MonitorClient Singleton

The central orchestrator that manages the SDK lifecycle.

```typescript
class MonitorClient {
  private static instance: MonitorClient | null = null;
  private collectors: Collector[] = [];
  private signalBus: SignalBus;
  private eventStore: EventStore;
  private config: MonitorConfig;
  private state: 'idle' | 'initializing' | 'running' | 'stopped' = 'idle';

  static getInstance(): MonitorClient {
    if (!MonitorClient.instance) {
      MonitorClient.instance = new MonitorClient();
    }
    return MonitorClient.instance;
  }

  async init(config: MonitorConfig): Promise<void> {
    this.state = 'initializing';
    this.config = config;

    // Initialize core systems
    this.signalBus = new SignalBus();
    this.eventStore = new EventStore(config.storage);

    // Register and initialize collectors based on config
    const enabledCollectors = this.resolveCollectors(config);
    for (const collector of enabledCollectors) {
      await collector.init(config);
      this.collectors.push(collector);
    }
  }

  start(): void {
    this.state = 'running';
    for (const collector of this.collectors) {
      collector.start();
    }
  }

  stop(): void {
    this.state = 'stopped';
    for (const collector of [...this.collectors].reverse()) {
      collector.stop();
      collector.dispose();
    }
  }

  /** Register a third-party collector */
  use(collector: Collector): void {
    if (this.state === 'running') {
      collector.init(this.config);
      collector.start();
    }
    this.collectors.push(collector);
  }
}
```

---

## Debug vs Release Behavior

The SDK automatically adapts based on the `__DEV__` flag.

```
__DEV__ === true (development):
  +------------------------------------------+
  | All collectors enabled (dev + prod)      |
  | Verbose console logging                  |
  | No network transmission (local only)     |
  | Dashboard real-time bridge active        |
  | Terminal inline warnings in Metro        |
  | Expo Dev Tools tab active                |
  | Sampling rate: 1.0 (capture everything)  |
  +------------------------------------------+

__DEV__ === false (production):
  +------------------------------------------+
  | Only prod-mode collectors                |
  | Silent capture (no console output)       |
  | Batched upload with sampling             |
  | Dashboard bridge disabled               |
  | Sampling rate: configurable (default 0.1)|
  +------------------------------------------+
```

---

## Config Plugin (Expo)

The `withErneMonitor` config plugin auto-configures native projects during `npx expo prebuild`.

```typescript
// plugin/withErneMonitor.ts
import { ConfigPlugin, withAppDelegate, withMainApplication } from 'expo/config-plugins';

const withErneMonitor: ConfigPlugin = (config) => {
  // iOS
  config = withAppDelegate(config, (mod) => {
    // Insert MonitorModule.start() in didFinishLaunchingWithOptions
    return mod;
  });

  // Android
  config = withMainApplication(config, (mod) => {
    // Insert MonitorModule.start() in onCreate
    return mod;
  });

  // Podfile hooks for dSYM upload
  // Gradle deps for NDK crash handler
  // ProGuard rules to keep crash handler symbols

  return config;
};
```

---

## Minimal Integration

After installation and config plugin setup, integration requires a single component wrapper:

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

`MonitorProvider` handles:
- Calling `MonitorClient.init()` with resolved config
- Calling `MonitorClient.start()` after mount
- Calling `MonitorClient.stop()` on unmount
- Providing monitor context to child components (for imperative access)
- Installing the Babel auto-instrumentation hooks (if not already installed via config plugin)
