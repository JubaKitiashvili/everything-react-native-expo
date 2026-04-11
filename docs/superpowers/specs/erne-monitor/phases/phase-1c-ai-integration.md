# Phase 1c: AI Integration + Advanced Collectors

> **Status: ✅ Complete (12/12)** — closed 2026-04-12. 8 advanced collectors + SignalRouter composite (7 sub-components, 20 built-in patterns) + schema codegen + Babel auto-instrumentation + `npx @erne/monitor init`. Phase 2a unblocked.

**Goal:** "ERNE sees, analyzes, and suggests fixes"
**Depends on:** Phase 1b (intelligence collectors + dashboard must be stable)
**Deliverable:** AI-powered fix suggestions, full SignalRouter pipeline, auto-instrumentation, init wizard

---

## Success Criteria

- [ ] TouchBoundaryCollector tracks tap events with component path context
- [ ] FrustrationCollector correlates rapid taps with subsequent errors
- [ ] StateCollector captures Zustand/Redux state transitions via middleware
- [ ] SuspenseCollector and ActivityCollector detect React 19 boundary issues
- [ ] ImageCollector reports oversized images, cache misses, and slow loads
- [ ] A11yCollector detects runtime accessibility violations
- [ ] StorageCollector tracks AsyncStorage/SQLite/SecureStore pressure
- [ ] SignalRouter full pipeline processes events through dedup, correlation, confidence, context, dispatch, and feedback
- [ ] Schema codegen generates Swift and Kotlin types from TypeScript definitions
- [ ] Babel plugin auto-instruments components without manual code changes
- [ ] `npx @erne/monitor init` scaffolds config and provider in under 30 seconds
- [ ] All Phase 1a and 1b tests still pass (regression check)
- [ ] SDK adds <50KB total to JS bundle (cumulative 1a + 1b + 1c)

---

## Tasks

### Task 26: TouchBoundaryCollector

**Depends on:** SignalBus (#4) only

**Description:** Tracks tap events on interactive elements with full component path context. Captures which component the user tapped, where it is in the tree, and the coordinates. This data feeds the FrustrationCollector and provides breadcrumb context for crash reports.

**Files to create:**
- `src/collectors/TouchBoundaryCollector.ts`
- `src/collectors/TouchBoundaryCollector.test.ts`

**Acceptance criteria:**
- [ ] Wraps the app root with a transparent touch responder (Pressable or PanResponder)
- [ ] Captures: componentName, componentPath, coordinates (x, y), timestamp
- [ ] Resolves component name from accessibility label, testID, or displayName (in that priority)
- [ ] Debounced — batches touch events within 100ms window to avoid spam
- [ ] Does not interfere with existing gesture handlers or Pressable components
- [ ] Mode: 'all' (active in dev and prod)
- [ ] Low overhead — touch handler completes in <1ms

**Integration points:** Emits to SignalBus. FrustrationCollector (#27) correlates taps with errors. BreadcrumbCollector (#15) adds tap events to breadcrumb trail.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 27: FrustrationCollector

**Depends on:** TouchBoundaryCollector (#26), CrashCollector (#7)

**Description:** Detects user frustration signals by correlating rapid taps (rage taps), taps followed by errors, and dead taps (tap on non-interactive element). Emits high-confidence frustration events that the SignalRouter can use to generate actionable suggestions.

**Files to create:**
- `src/collectors/FrustrationCollector.ts`
- `src/collectors/FrustrationCollector.test.ts`

**Acceptance criteria:**
- [ ] Detects rage tap: 3+ taps on same target within 2 seconds
- [ ] Detects dead tap: tap on element with no onPress handler
- [ ] Detects error tap: tap followed by crash/error within 1 second
- [ ] Scores frustration level: low (1 signal), medium (2 signals), high (3+ signals)
- [ ] Reports: frustrationLevel, signals[], componentPath, sessionContext
- [ ] Subscribes to both touch and crash events from SignalBus
- [ ] Sliding window — correlates events within a 5-second window

**Integration points:** Subscribes to SignalBus (touch + crash events). SignalRouter (#34) uses frustration events for prioritized dispatch.
**Spec reference:** §4 SignalRouter — CorrelationEngine

---

### Task 28: StateCollector

**Depends on:** SignalBus (#4) only

**Description:** Captures state management transitions via middleware for Zustand and Redux Toolkit. Records state shape changes (not full state dumps) to provide context for crash reports and re-render analysis.

**Files to create:**
- `src/collectors/StateCollector.ts`
- `src/collectors/state/zustand-middleware.ts`
- `src/collectors/state/redux-middleware.ts`
- `src/collectors/StateCollector.test.ts`

**Acceptance criteria:**
- [ ] Auto-detects Zustand and Redux Toolkit via optional imports (no hard dependency)
- [ ] Zustand middleware: tracks action name, changed keys, timestamp
- [ ] Redux middleware: tracks action type, changed slice keys, timestamp
- [ ] Does NOT capture full state values (privacy) — only keys that changed
- [ ] Configurable: opt-in store names to monitor (not all stores by default)
- [ ] Rate-limited: max 50 state events per second (drops excess)
- [ ] Graceful degradation if neither Zustand nor Redux is installed

**Integration points:** Emits to SignalBus. BreadcrumbCollector (#15) uses state changes as context. RenderCollector (#16) can correlate re-renders with state changes.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 29: SuspenseCollector

**Depends on:** SignalBus (#4) only

**Description:** Monitors React Suspense boundary fallback duration. Detects when Suspense boundaries are triggered, how long fallbacks are shown, and whether they resolve or error. Critical for React 19 apps using the `use()` hook pattern.

**Files to create:**
- `src/collectors/SuspenseCollector.ts`
- `src/collectors/SuspenseCollector.test.ts`

**Acceptance criteria:**
- [ ] Wraps Suspense boundaries with a monitoring component (SuspenseMonitor)
- [ ] Tracks: boundaryName, fallbackDuration, resolvedComponent, timestamp
- [ ] Warns when fallback is shown for >3 seconds (configurable threshold)
- [ ] Detects nested Suspense boundaries and reports depth
- [ ] Reports error boundaries that catch Suspense errors
- [ ] Mode: 'dev' only (instrumentation overhead in prod)
- [ ] Exports `<MonitoredSuspense>` wrapper for opt-in usage

**Integration points:** Emits to SignalBus. DashboardBridge (#24) shows Suspense health in dashboard.
**Spec reference:** §3 SDK Architecture — Collectors, §13 Competitive Advantages (React 19)

---

### Task 30: ActivityCollector

**Depends on:** SignalBus (#4) only

**Description:** Detects wasted pre-renders in React 19's `<Activity>` component. When `<Activity mode="hidden">` components render despite being hidden, this collector flags the wasted work. Unique to ERNE — no competitor tracks this.

**Files to create:**
- `src/collectors/ActivityCollector.ts`
- `src/collectors/ActivityCollector.test.ts`

**Acceptance criteria:**
- [ ] Monitors React 19 Activity component mode transitions (visible ↔ hidden)
- [ ] Detects renders that occur while Activity mode is 'hidden' (wasted work)
- [ ] Reports: componentName, wastedRenderCount, renderDuration, mode
- [ ] Tracks transition timing: how long to go from hidden → visible
- [ ] Suggests optimization: "Component X renders 5 times while hidden"
- [ ] Mode: 'dev' only
- [ ] Gracefully no-ops if React version < 19.2 (Activity not available)

**Integration points:** Emits to SignalBus. RenderCollector (#16) can cross-reference wasted render data.
**Spec reference:** §3 SDK Architecture — Collectors, §13 Competitive Advantages (React 19)

---

### Task 31: ImageCollector

**Depends on:** SignalBus (#4) only

**Description:** Monitors image loading performance across expo-image and React Native Image. Detects oversized images (dimensions much larger than display size), cache misses, slow loads, and failed loads. Provides actionable suggestions for optimization.

**Files to create:**
- `src/collectors/ImageCollector.ts`
- `src/collectors/ImageCollector.test.ts`

**Acceptance criteria:**
- [ ] Intercepts expo-image and RN Image onLoad/onError callbacks
- [ ] Detects oversized images: source dimensions >2x display dimensions
- [ ] Tracks: uri, loadDuration, cacheHit (memory/disk/miss), sourceSize, displaySize
- [ ] Reports slow loads (>500ms) and failed loads with error reason
- [ ] Warns for non-WebP/AVIF formats in production builds
- [ ] Batched reporting — aggregates per unique URI, not per instance
- [ ] Mode: 'all' (load time in prod, oversized detection dev-only)

**Integration points:** Emits to SignalBus. SignalRouter (#34) generates image optimization suggestions.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 32: A11yCollector

**Depends on:** SignalBus (#4) only

**Description:** Runtime accessibility violation detection. Checks interactive elements for missing labels, insufficient touch target sizes, missing roles, and contrast issues. Runs periodic audits and reports violations with component paths.

**Files to create:**
- `src/collectors/A11yCollector.ts`
- `src/collectors/A11yCollector.test.ts`

**Acceptance criteria:**
- [ ] Detects missing accessibilityLabel on Pressable/TouchableOpacity
- [ ] Detects touch targets smaller than 44x44 points
- [ ] Detects missing accessibilityRole on interactive elements
- [ ] Detects images without accessibilityLabel
- [ ] Reports: violationType, componentPath, severity (error/warning/info), suggestion
- [ ] Runs audit on screen transition (new screen = new audit)
- [ ] Mode: 'dev' only (uses layout inspection APIs)
- [ ] Does not false-positive on decorative elements with `importantForAccessibility="no"`

**Integration points:** Emits to SignalBus. Dashboard (#25) shows A11y violations tab.
**Spec reference:** §3 SDK Architecture — Collectors, §13 Competitive Advantages

---

### Task 33: StorageCollector

**Depends on:** SignalBus (#4) only

**Description:** Monitors storage subsystem pressure across AsyncStorage, expo-sqlite, and expo-secure-store. Detects excessive reads/writes, storage quota approaching limits, and slow operations.

**Files to create:**
- `src/collectors/StorageCollector.ts`
- `src/collectors/StorageCollector.test.ts`

**Acceptance criteria:**
- [ ] Monkey-patches AsyncStorage get/set/remove to track operation count and duration
- [ ] Monitors expo-sqlite via database change listener for write frequency
- [ ] Tracks expo-secure-store operations (optional, if present)
- [ ] Reports: operationType, storageBackend, duration, keyCount, estimatedSize
- [ ] Warns on: >100 ops/second, single value >500KB, total AsyncStorage >10MB
- [ ] Graceful degradation — works even if only AsyncStorage is installed
- [ ] Restores original implementations on stop()
- [ ] Mode: 'all' (operation counting in prod, detailed tracking dev-only)

**Integration points:** Emits to SignalBus. SignalRouter (#34) suggests storage optimization patterns.
**Spec reference:** §3 SDK Architecture — Collectors

---

### Task 34: SignalRouter (Full System)

**Depends on:** Fingerprinter (#21), all collectors from Phase 1a-1c

**Description:** The intelligence core of @erne/monitor. Processes raw collector events through a multi-stage pipeline: dedup, correlate, score confidence, build context, dispatch to appropriate output, and track feedback. This is the brain that turns raw signals into actionable developer intelligence.

**Files to create:**
- `src/signal-router/SignalRouter.ts`
- `src/signal-router/DedupEngine.ts`
- `src/signal-router/CorrelationEngine.ts`
- `src/signal-router/ConfidenceScorer.ts`
- `src/signal-router/ContextBuilder.ts`
- `src/signal-router/DispatchEngine.ts`
- `src/signal-router/FeedbackTracker.ts`
- `src/signal-router/PatternLibrary.ts`
- `src/signal-router/SignalRouter.test.ts`
- `src/signal-router/DedupEngine.test.ts`
- `src/signal-router/CorrelationEngine.test.ts`
- `src/signal-router/ConfidenceScorer.test.ts`
- `src/signal-router/ContextBuilder.test.ts`
- `src/signal-router/DispatchEngine.test.ts`
- `src/signal-router/FeedbackTracker.test.ts`
- `src/signal-router/PatternLibrary.test.ts`

**Acceptance criteria:**

DedupEngine:
- [ ] Groups events by fingerprint (from Fingerprinter #21)
- [ ] Merges duplicate crash events — increments count instead of creating new entries
- [ ] Time window: events within 5 seconds with same fingerprint are duplicates
- [ ] Passes unique events downstream, drops duplicates

CorrelationEngine:
- [ ] Links related events across collectors (e.g., tap → error → crash)
- [ ] Time-window correlation: events within 2 seconds of each other
- [ ] Causal chain detection: A caused B if A.timestamp < B.timestamp and same screen
- [ ] Outputs correlation groups with confidence score

ConfidenceScorer:
- [ ] Scores each signal/suggestion 0-100 based on evidence strength
- [ ] Factors: number of correlated signals, pattern match strength, recurrence count
- [ ] Threshold: only dispatch signals with confidence >= 60
- [ ] Configurable threshold via MonitorConfig

ContextBuilder:
- [ ] Assembles full context for each dispatched signal
- [ ] Includes: breadcrumbs (last 20), device state, current screen, recent state changes
- [ ] Attaches source code location (file, line, column) when available
- [ ] Generates human-readable summary string

DispatchEngine:
- [ ] Routes processed signals to appropriate outputs: terminal, dashboard, EventStore
- [ ] Priority routing: critical → all outputs, low → EventStore only
- [ ] Rate limiting: max 10 dispatches per minute per output channel
- [ ] Supports pluggable output adapters

FeedbackTracker:
- [ ] Tracks whether dispatched suggestions were acted on (applied/dismissed/ignored)
- [ ] Persists feedback to EventStore for pattern improvement
- [ ] API: `monitor.feedback(signalId, 'helpful' | 'not-helpful')`
- [ ] Used by PatternLibrary to improve future scoring

PatternLibrary:
- [ ] Built-in library of known React Native issue patterns
- [ ] Patterns: missing keys in FlatList, anonymous functions in render, oversized images, etc.
- [ ] Each pattern: regex/AST match, confidence score, suggestion text, fix hint
- [ ] Extensible — developers can add custom patterns
- [ ] Minimum 20 built-in patterns at launch

**Integration points:** Subscribes to SignalBus (all events). Dispatches to TerminalReporter (#13), DashboardBridge (#24), EventStore (#6).
**Spec reference:** §4 SignalRouter (entire section)

---

### Task 35: Schema Codegen

**Depends on:** All event types defined in Phase 1a-1c collectors

**Description:** Uses ts-morph to read TypeScript event interfaces and generate matching Swift structs and Kotlin data classes. These generated types are consumed by the native module in Phase 2a to ensure type safety across the JS-native bridge.

**Files to create:**
- `scripts/codegen/schema-codegen.ts`
- `scripts/codegen/swift-generator.ts`
- `scripts/codegen/kotlin-generator.ts`
- `scripts/codegen/templates/swift.hbs`
- `scripts/codegen/templates/kotlin.hbs`
- `src/types/events.ts` (canonical event type definitions)
- `scripts/codegen/schema-codegen.test.ts`

**Acceptance criteria:**
- [ ] Reads all event interfaces from `src/types/events.ts` using ts-morph
- [ ] Generates Swift structs with Codable conformance
- [ ] Generates Kotlin data classes with @Serializable annotation
- [ ] Handles: primitives, optionals, arrays, nested objects, enums, union types
- [ ] Maps TS types to platform types: `string→String`, `number→Double/Float`, `boolean→Bool`
- [ ] Generates to `ios/generated/` and `android/generated/` directories
- [ ] Includes header comment: "Auto-generated by @erne/monitor schema-codegen — do not edit"
- [ ] Runnable via `npm run codegen` script
- [ ] Idempotent — running twice produces identical output
- [ ] Validates that all event types are covered (no orphaned TS types)

**Integration points:** Phase 2a (#39) consumes generated types. CI runs codegen on every change to events.ts.
**Spec reference:** §6 Schema Codegen

---

### Task 36: Babel Auto-Instrumentation Plugin

**Depends on:** All collectors from Phase 1a-1c

**Description:** Babel plugin that automatically instruments React components with monitoring hooks. Injects render tracking, touch boundary wrapping, and Suspense monitoring without requiring developers to modify their code.

**Files to create:**
- `babel-plugin/index.ts`
- `babel-plugin/visitors/component-visitor.ts`
- `babel-plugin/visitors/suspense-visitor.ts`
- `babel-plugin/visitors/image-visitor.ts`
- `babel-plugin/utils.ts`
- `babel-plugin/index.test.ts`

**Acceptance criteria:**
- [ ] Wraps functional components with render tracking profiler
- [ ] Injects touch boundary around top-level Pressable/TouchableOpacity
- [ ] Wraps `<Suspense>` with `<MonitoredSuspense>` for fallback tracking
- [ ] Adds component displayName to anonymous arrow function components
- [ ] Configurable via babel options: `{ include: ['src/'], exclude: ['node_modules/'] }`
- [ ] Opt-out per component via `// @erne-monitor-ignore` comment
- [ ] Zero runtime overhead when monitor is not initialized
- [ ] Does not modify component behavior or output
- [ ] Works with React Compiler (does not conflict with auto-memoization)
- [ ] Sourcemaps are preserved correctly

**Integration points:** Metro bundler loads plugin via babel.config.js. All collectors benefit from auto-instrumentation.
**Spec reference:** §8 Developer Experience — Auto-Instrumentation

---

### Task 37: `npx @erne/monitor init` Wizard

**Depends on:** MonitorProvider (#14), Config (#2), Babel plugin (#36)

**Description:** Interactive CLI wizard that scaffolds @erne/monitor into an existing Expo/React Native project. Detects project setup, installs dependencies, creates config, wraps app root with MonitorProvider, and adds babel plugin config.

**Files to create:**
- `cli/init.ts`
- `cli/detect-project.ts`
- `cli/scaffold-config.ts`
- `cli/scaffold-provider.ts`
- `cli/scaffold-babel.ts`
- `cli/prompts.ts`
- `cli/init.test.ts`

**Acceptance criteria:**
- [ ] Detects: Expo Router vs React Navigation, TypeScript vs JavaScript, app entry point
- [ ] Detects existing state management (Zustand, Redux) for StateCollector config
- [ ] Installs `@erne/monitor` and peer dependencies via detected package manager (npm/yarn/pnpm)
- [ ] Creates `monitor.config.ts` with sensible defaults based on detected stack
- [ ] Wraps app root with `<MonitorProvider>` (modifies _layout.tsx or App.tsx)
- [ ] Adds babel plugin to `babel.config.js`
- [ ] Interactive prompts: consent categories, collector selection, AI features on/off
- [ ] Dry-run mode: `--dry-run` flag shows what would change without modifying files
- [ ] Idempotent — running twice does not duplicate wrapping or config
- [ ] Completes in under 30 seconds on a standard project
- [ ] Prints post-init summary with "what's next" instructions

**Integration points:** Entry point for all new users. References MonitorProvider (#14), Config (#2), Babel plugin (#36).
**Spec reference:** §8 Developer Experience — Init Wizard

---

## Phase Completion Checklist

- [ ] All 12 tasks (26-37) are complete
- [ ] All Phase 1a tests still pass (regression check)
- [ ] All Phase 1b tests still pass (regression check)
- [ ] All Phase 1c tests pass
- [ ] SignalRouter processes events end-to-end: collector → dedup → correlate → score → context → dispatch
- [ ] Schema codegen produces valid Swift and Kotlin types
- [ ] Babel plugin auto-instruments without breaking existing code
- [ ] Init wizard works on fresh Expo project and existing project
- [ ] PatternLibrary contains minimum 20 built-in patterns
- [ ] Bundle size < 50KB gzipped (cumulative 1a + 1b + 1c)
- [ ] Plan adherence audit — spec §3, §4, §6, §8, §13 covered
- [ ] Tag: `git tag monitor-phase-1c-complete`
- [ ] TRACKER.md updated, Phase 2a unblocked
