# Phase 1a: Foundation + Core Collectors (MVP)

**Goal:** "ERNE sees what happens in your app"
**Depends on:** Nothing — this is the starting point
**Deliverable:** `npm install @erne/monitor` → wrap app → see crashes + network in terminal
**Backend:** SQLite only (local). Zero infrastructure required.

---

## Success Criteria

- [ ] MonitorClient initializes without errors in a fresh Expo project
- [ ] CrashCollector captures JS exceptions and unhandled promise rejections
- [ ] NetworkCollector intercepts fetch/XHR requests with timing data
- [ ] NavigationCollector tracks screen transitions (Expo Router)
- [ ] All events persist to SQLite and survive app restart
- [ ] Terminal reporter shows colored warnings in Metro bundler output
- [ ] MonitorProvider wraps app with zero config needed
- [ ] All tests pass, TypeScript clean, lint clean
- [ ] SDK adds <20KB to JS bundle (Phase 1a subset of 50KB total budget)

---

## Tasks

### Task 1: MonitorClient

**Description:** Core singleton that manages SDK lifecycle. Entry point for everything.

**Files to create:**
- `src/core/MonitorClient.ts`
- `src/core/MonitorClient.test.ts`

**Interface:**
```typescript
class MonitorClient {
  private static instance: MonitorClient | null;
  
  static init(config: MonitorConfig): MonitorClient;
  static getInstance(): MonitorClient;
  
  start(): void;
  stop(): void;
  isRunning(): boolean;
  
  registerCollector(collector: Collector): void;
  getCollectors(): Collector[];
}
```

**Acceptance criteria:**
- [ ] Singleton — calling init() twice throws
- [ ] start() initializes all registered collectors in priority order
- [ ] stop() disposes all collectors in reverse order
- [ ] isRunning() reflects actual state
- [ ] Thread-safe initialization (race condition protection)

**Integration points:** None — this is the root component
**Spec reference:** §3 SDK Architecture

---

### Task 2: Config

**Description:** Configuration system with defaults, overrides, and runtime dynamic config.

**Files to create:**
- `src/core/Config.ts`
- `src/core/Config.test.ts`

**Interface:**
```typescript
interface MonitorConfig {
  collectors: Record<string, boolean | 'dev' | 'prod'>;
  sampling: { dev: number; prod: number };
  consent: { crashes: boolean; analytics: boolean; replay: boolean };
  ai: { crashExplainer: boolean; autoFix: 'suggest' | 'apply' | 'off'; maxFilesPerFix: number };
  transport: { endpoint: string | null; batchInterval: number; maxBatchSize: number };
}

function defineMonitorConfig(overrides: Partial<MonitorConfig>): MonitorConfig;
function resolveCollectorMode(config: MonitorConfig, name: string): boolean;
```

**Acceptance criteria:**
- [ ] Sensible defaults for every field (spec §8)
- [ ] `defineMonitorConfig()` merges partial overrides with defaults
- [ ] `resolveCollectorMode()` checks `__DEV__` for 'dev'/'prod' modes
- [ ] Config is immutable after creation (frozen)
- [ ] Invalid config values throw descriptive errors

**Integration points:** MonitorClient reads config
**Spec reference:** §8 Developer Experience

---

### Task 3: PlatformBridge

**Description:** Interface abstracting platform-specific APIs. JS implementation for Phase 1, native override in Phase 2.

**Files to create:**
- `src/core/PlatformBridge.ts`
- `src/core/JSPlatformBridge.ts`
- `src/core/PlatformBridge.test.ts`

**Interface:**
```typescript
interface PlatformBridge {
  getDeviceInfo(): DeviceInfo;
  getAppInfo(): AppInfo;
  getMemoryUsage(): MemoryInfo | null;  // null if unavailable in JS
  getConnectionType(): 'wifi' | 'cellular' | 'offline' | 'unknown';
  persistCrashData(data: Uint8Array): void;  // sync, crash-safe
}
```

**Acceptance criteria:**
- [ ] Interface defined with all methods
- [ ] JSPlatformBridge implements interface using RN APIs (Platform, Dimensions, etc.)
- [ ] getMemoryUsage() returns null in JS (native override in Phase 2)
- [ ] persistCrashData() uses sync write for crash safety

**Integration points:** Enricher uses this, native module overrides in Phase 2
**Spec reference:** §3 SDK Architecture

---

### Task 4: SignalBus

**Description:** Typed event emitter. All collectors emit events here. Processors subscribe.

**Files to create:**
- `src/core/SignalBus.ts`
- `src/core/SignalBus.test.ts`

**Interface:**
```typescript
type MonitorEventType = 'crash' | 'network' | 'navigation' | 'render' | 'custom' | ...;

interface MonitorEvent {
  type: MonitorEventType;
  timestamp: number;       // performance.now() for ordering
  wallTime: number;        // Date.now() as metadata
  sessionId: string;
  data: unknown;
}

class SignalBus {
  emit(event: MonitorEvent): void;
  on(type: MonitorEventType, handler: (event: MonitorEvent) => void): () => void;
  onAll(handler: (event: MonitorEvent) => void): () => void;
  off(type: MonitorEventType, handler: Function): void;
  clear(): void;
}
```

**Acceptance criteria:**
- [ ] Type-safe event emission and subscription
- [ ] Supports wildcard subscription (onAll)
- [ ] Returns unsubscribe function from on()
- [ ] Uses monotonic clock (performance.now()) for event ordering
- [ ] Handles subscriber errors without crashing bus (try/catch per handler)
- [ ] clear() removes all subscriptions

**Integration points:** Every collector emits here, every processor subscribes
**Spec reference:** §5 Data Pipeline

---

### Task 5: SessionManager

**Description:** Tracks user sessions. New session after 5 minutes of inactivity.

**Files to create:**
- `src/core/SessionManager.ts`
- `src/core/SessionManager.test.ts`

**Interface:**
```typescript
class SessionManager {
  getCurrentSessionId(): string;
  startNewSession(): string;
  onSessionChange(callback: (sessionId: string) => void): () => void;
  getSessionDuration(): number;  // milliseconds
}
```

**Acceptance criteria:**
- [ ] Generates UUID v4 session IDs
- [ ] Auto-detects inactivity via AppState changes (background → foreground after 5min)
- [ ] Persists current session ID (survives JS reload but not app kill)
- [ ] Emits session change events
- [ ] getSessionDuration() returns time since session start

**Integration points:** Enricher adds sessionId to every event
**Spec reference:** §3 SDK Architecture

---

### Task 6: EventStore

**Description:** SQLite-based event buffer with priority queue. Persists events locally.

**Files to create:**
- `src/storage/EventStore.ts`
- `src/storage/EventStore.test.ts`

**Interface:**
```typescript
type EventPriority = 'critical' | 'high' | 'normal' | 'low';

class EventStore {
  init(): Promise<void>;
  insert(event: MonitorEvent, priority: EventPriority): Promise<void>;
  insertSync(event: MonitorEvent, priority: EventPriority): void;  // for crashes
  
  drain(priority: EventPriority, limit: number): Promise<MonitorEvent[]>;
  drainAll(limit: number): Promise<MonitorEvent[]>;  // highest priority first
  
  count(): Promise<number>;
  size(): Promise<number>;  // bytes
  
  prune(maxAge: number): Promise<number>;  // delete events older than maxAge ms
  pruneBySize(maxBytes: number): Promise<number>;  // LRU eviction, never evict crashes
  
  close(): Promise<void>;
}
```

**Acceptance criteria:**
- [ ] Uses expo-sqlite for storage
- [ ] Priority queue — drain returns highest priority first
- [ ] insertSync() for crash events (no async, no promise)
- [ ] Size cap at 50MB with LRU eviction (crashes never evicted)
- [ ] Auto-prune events older than 7 days
- [ ] Handles concurrent reads/writes safely
- [ ] close() cleans up database connection

**Integration points:** SignalBus → processors → EventStore. Transport reads from EventStore.
**Spec reference:** §5 Data Pipeline — EventStore

---

### Task 7: CrashCollector

**Description:** Captures JS exceptions and unhandled promise rejections.

**Files to create:**
- `src/collectors/CrashCollector.ts`
- `src/collectors/CrashCollector.test.ts`

**Interface:**
```typescript
class CrashCollector implements Collector {
  readonly name = 'crash';
  readonly platform = 'all';
  readonly mode = 'all';
  readonly priority = 0;  // highest — init first
  
  init(config: MonitorConfig): void;
  start(): void;   // hooks into ErrorUtils + Promise rejection tracker
  stop(): void;    // restores original handlers
  dispose(): void;
}
```

**Acceptance criteria:**
- [ ] Hooks into `ErrorUtils.setGlobalHandler()` (chains, doesn't replace)
- [ ] Captures unhandled promise rejections via Hermes tracker
- [ ] Emits CrashEvent with: message, stack, componentStack, isFatal
- [ ] Uses EventStore.insertSync() for fatal crashes (survives process death)
- [ ] Restores original handlers on stop() (no side effects)
- [ ] Handles the case where ErrorUtils doesn't exist (web fallback)

**Integration points:** Emits to SignalBus. BreadcrumbCollector (Phase 1b) consumes crash events.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 8: NetworkCollector

**Description:** Intercepts HTTP requests and responses with timing data.

**Files to create:**
- `src/collectors/NetworkCollector.ts`
- `src/collectors/NetworkCollector.test.ts`

**Acceptance criteria:**
- [ ] Monkey-patches global `fetch` and `XMLHttpRequest`
- [ ] Captures: url, method, statusCode, duration, requestSize, responseSize
- [ ] Filters out SDK's own requests (transport URLs)
- [ ] Filters out Metro bundler / dev server requests in __DEV__
- [ ] Restores original fetch/XHR on stop()
- [ ] Handles request errors (network failure, timeout)
- [ ] Does not modify request/response behavior (transparent proxy)

**Integration points:** Emits to SignalBus. BreadcrumbCollector (Phase 1b) consumes network events.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 9: NavigationCollector

**Description:** Auto-tracks screen transitions for Expo Router and React Navigation.

**Files to create:**
- `src/collectors/NavigationCollector.ts`
- `src/collectors/NavigationCollector.test.ts`

**Acceptance criteria:**
- [ ] Auto-detects Expo Router vs React Navigation
- [ ] Tracks: screen name, timestamp, transition duration
- [ ] Handles nested navigators (tab → stack → screen)
- [ ] Does not require manual screen tracking calls
- [ ] Falls back to manual `trackScreenView()` if auto-detect fails

**Integration points:** Emits to SignalBus. BreadcrumbCollector and StartupCollector use navigation events.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 10: CustomEventCollector

**Description:** Developer-defined events with typed attributes.

**Files to create:**
- `src/collectors/CustomEventCollector.ts`
- `src/collectors/CustomEventCollector.test.ts`

**Interface:**
```typescript
// Public API exposed on MonitorClient
monitor.trackEvent(name: string, attributes?: Record<string, string | number | boolean>): void;
```

**Acceptance criteria:**
- [ ] Accepts event name + optional typed attributes
- [ ] Validates attribute types (string, number, boolean only)
- [ ] Limits: name < 100 chars, max 50 attributes, attribute values < 1000 chars
- [ ] Emits to SignalBus as type 'custom'

**Integration points:** Emits to SignalBus.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 11: Sanitizer

**Description:** Strips PII from events before storage or transmission.

**Files to create:**
- `src/processors/Sanitizer.ts`
- `src/processors/Sanitizer.test.ts`

**Acceptance criteria:**
- [ ] Strips email addresses (regex pattern)
- [ ] Strips phone numbers (international formats)
- [ ] Redacts specified HTTP headers (Authorization, Cookie, etc.)
- [ ] Redacts URL query parameters containing 'token', 'key', 'secret', 'password'
- [ ] Configurable — user can add custom patterns
- [ ] Replaces with `[REDACTED]`, not empty string (preserves structure)

**Integration points:** Subscribes to SignalBus, transforms events before EventStore
**Spec reference:** §14 Privacy & Compliance

---

### Task 12: Enricher

**Description:** Adds device, app, and session metadata to every event.

**Files to create:**
- `src/processors/Enricher.ts`
- `src/processors/Enricher.test.ts`

**Acceptance criteria:**
- [ ] Adds: sessionId, deviceInfo (via PlatformBridge), appVersion, buildNumber
- [ ] Adds: platform (ios/android/web), isEmulator, connectionType
- [ ] Caches static info (device model doesn't change mid-session)
- [ ] Refreshes dynamic info (connection type, memory) on each event

**Integration points:** Uses PlatformBridge, SessionManager. Runs after Sanitizer.
**Spec reference:** §5 Data Pipeline

---

### Task 13: TerminalReporter

**Description:** Outputs monitor events as colored inline warnings in Metro terminal.

**Files to create:**
- `src/integrations/TerminalReporter.ts`
- `src/integrations/TerminalReporter.test.ts`

**Acceptance criteria:**
- [ ] Only active when `__DEV__ === true`
- [ ] Formats events with color codes: 🔴 crash, 🟡 warning, 🟢 info
- [ ] Shows: event type, message, screen, timestamp
- [ ] Rate-limited — max 1 output per event type per 5 seconds
- [ ] Non-blocking — never delays the JS thread

**Integration points:** Subscribes to SignalBus (after processors)
**Spec reference:** §9 Dashboard Integration

---

### Task 14: MonitorProvider

**Description:** React component that wraps app root, initializes monitoring.

**Files to create:**
- `src/MonitorProvider.tsx`
- `src/MonitorProvider.test.tsx`
- `src/index.ts` (package entry point with exports)

**Interface:**
```tsx
<MonitorProvider config={optionalConfig}>
  <App />
</MonitorProvider>

// Also export for non-component usage:
export { MonitorClient, defineMonitorConfig } from './core';
export type { MonitorConfig, Collector, MonitorEvent } from './types';
```

**Acceptance criteria:**
- [ ] Initializes MonitorClient on mount
- [ ] Stops monitoring on unmount
- [ ] Accepts optional config override
- [ ] Works with and without explicit config (has defaults)
- [ ] Does not re-initialize on re-render
- [ ] package.json entry point exports everything cleanly

**Integration points:** This is the user-facing API. Wraps everything from tasks 1-13.
**Spec reference:** §8 Developer Experience

---

## Phase Completion Checklist

- [ ] All 14 tasks are ✅
- [ ] Full test suite passes (all 14 test files)
- [ ] TypeScript clean (`tsc --noEmit`)
- [ ] Bundle size < 20KB gzipped
- [ ] Demo: fresh Expo project + `@erne/monitor` → crashes/network visible in terminal
- [ ] Plan adherence audit — spec §3, §5, §8, §14 covered
- [ ] Tag: `git tag monitor-phase-1a-complete`
- [ ] TRACKER.md updated, Phase 1b unblocked
