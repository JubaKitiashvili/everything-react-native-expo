# Phase 4: Advanced Intelligence

**Goal:** "Self-improving, cross-project intelligence"
**Depends on:** Phase 3 (production backend must be operational for server-side persistence and data pipelines)
**Deliverable:** Server-persisted pattern library, cross-project learning, on-device ML anomaly detection, OTA model updates, DORA metrics, plugin marketplace, RSC monitoring, and Metro auto-instrumentation

---

## Success Criteria

- [ ] PatternLibrary persists learned patterns server-side and loads them on SDK init
- [ ] Cross-project learning aggregates anonymized patterns across opt-in projects
- [ ] On-device ExecuTorch model detects performance anomalies without network round-trip
- [ ] OTA updates deliver new patterns and ML models without app store release
- [ ] MTTR/DORA dashboard visualizes team health metrics from monitor + git data
- [ ] Plugin marketplace allows third-party collector/processor extensions
- [ ] RSC monitoring tracks Expo Router server component render times and data fetching
- [ ] Metro auto-instrumentation injects monitor hooks at build time without manual code changes

---

## Tasks

### Task 63: PatternLibrary Server Persistence

**Depends on:** PostgreSQL schema (#56), existing PatternLibrary (Phase 1c/2a)

Persists the learned pattern library to the server so patterns survive across app installs and are shared across team members.

**Files to create:**
- `server/patterns/store.ts`
- `server/patterns/sync.ts`
- `server/patterns/store.test.ts`
- `src/intelligence/PatternSync.ts`
- `src/intelligence/PatternSync.test.ts`

**Acceptance criteria:**
- [ ] Server stores patterns in PostgreSQL: `patterns` table with `app_id`, `pattern_type`, `pattern_data`, `confidence`, `sample_count`, `created_at`, `updated_at`
- [ ] SDK syncs local pattern library to server on session end (debounced, max 1 sync/hour)
- [ ] SDK fetches latest patterns from server on cold start (cached locally for offline)
- [ ] Merge strategy: server patterns with higher confidence win, new local patterns upload
- [ ] Team sharing: all team members for the same `app_id` see the same pattern library
- [ ] Versioned — pattern schema changes handled via migration, old clients degrade gracefully

**Integration points:** PatternLibrary (Phase 1c) provides local patterns. PostgreSQL (#56) stores server-side. BatchTransport (#54) handles sync delivery.

---

### Task 64: Cross-Project Learning (Opt-In, Anonymized)

**Depends on:** PatternLibrary server persistence (#63)

Aggregates performance patterns and crash signatures across multiple projects to build a shared knowledge base.

**Files to create:**
- `server/intelligence/crossProject.ts`
- `server/intelligence/anonymizer.ts`
- `server/intelligence/crossProject.test.ts`

**Acceptance criteria:**
- [ ] Strictly opt-in — requires explicit `config.ai.crossProjectLearning: true`
- [ ] Anonymization: strips app name, user data, proprietary code paths before aggregation
- [ ] Aggregates: common crash patterns (e.g., "OOM in FlatList with >1000 items"), performance baselines (e.g., "p50 cold start for Expo SDK 55 is 1.2s"), known bad library versions
- [ ] Shared patterns tagged with confidence score and sample count
- [ ] SDK receives relevant cross-project patterns as suggestions (not auto-applied)
- [ ] Privacy: no raw events leave the project boundary — only aggregated, anonymized patterns
- [ ] Admin can disable cross-project patterns per-app from dashboard

**Integration points:** PatternLibrary server (#63) feeds patterns. Anonymizer strips identifying data. SDK receives suggestions via PatternSync (#63).

---

### Task 65: On-Device ML — ExecuTorch Anomaly Detection

**Depends on:** Phase 2a native module, FrameDropCollector (#17), MemoryCollector (#19)

Runs a lightweight ML model on-device to detect performance anomalies without requiring network connectivity.

**Files to create:**
- `src/intelligence/AnomalyDetector.ts`
- `src/intelligence/AnomalyDetector.test.ts`
- `models/anomaly-detector.pte` (pre-trained ExecuTorch model)
- `src/intelligence/ModelLoader.ts`

**Acceptance criteria:**
- [ ] Uses `react-native-executorch` `useExecutorchModule` for model inference
- [ ] Input features: FPS history (last 60s), memory trend, network error rate, render count
- [ ] Output: anomaly score (0-1) + predicted anomaly type (memory_leak, render_storm, network_degradation)
- [ ] Inference runs every 10 seconds, <5ms per inference on mid-range devices
- [ ] Alerts only when anomaly score exceeds configurable threshold (default 0.8)
- [ ] Model bundled with SDK (~500KB), loaded lazily on first anomaly check
- [ ] Graceful fallback to rule-based detection if ExecuTorch is not available
- [ ] Emits anomaly events to SignalBus for dashboard and alerting

**Integration points:** OTA model updates (#66) deliver improved models. FrameDropCollector, MemoryCollector, NetworkCollector provide input features. SignalBus receives anomaly events.

---

### Task 66: OTA Pattern/Model Updates

**Depends on:** PatternLibrary server (#63), AnomalyDetector (#65)

Delivers updated patterns and ML models to the SDK without requiring an app store release.

**Files to create:**
- `src/intelligence/OTAUpdater.ts`
- `src/intelligence/OTAUpdater.test.ts`
- `server/ota/manifest.ts`
- `server/ota/manifest.test.ts`

**Acceptance criteria:**
- [ ] Server publishes versioned manifests: `{ patternVersion, modelVersion, patternUrl, modelUrl, checksum }`
- [ ] SDK checks for updates on cold start and every 24 hours (configurable)
- [ ] Downloads only when new version available (ETag/version comparison)
- [ ] Validates downloaded files via SHA-256 checksum before applying
- [ ] Atomic update — old version remains active until new version is fully downloaded and validated
- [ ] Respects app's bandwidth constraints — defers downloads on cellular if configured
- [ ] Model updates: replaces `.pte` file and reloads ExecuTorch module
- [ ] Pattern updates: merges new patterns into local PatternLibrary

**Integration points:** AnomalyDetector (#65) receives updated models. PatternSync (#63) receives updated patterns. `expo-updates` compatibility — does not conflict with existing OTA update flow.

---

### Task 67: MTTR/DORA Metrics Dashboard

**Depends on:** ClickHouse schema (#57), alerting engine (#61)

Visualizes Mean Time To Recovery, deployment frequency, and other DORA metrics by correlating monitor data with release/deploy events.

**Files to create:**
- `server/metrics/dora.ts`
- `server/metrics/dora.test.ts`
- Dashboard UI: DORA metrics panel

**Acceptance criteria:**
- [ ] MTTR: time from first crash occurrence to resolution (crash count drops to 0 for that fingerprint)
- [ ] Change Failure Rate: percentage of app versions that introduce new crash fingerprints
- [ ] Deployment Frequency: tracked via `app_versions` table entries
- [ ] Lead Time for Changes: time from version creation to first production event (approximation)
- [ ] Trend charts: weekly/monthly DORA metric trends per app
- [ ] Correlates app version releases with crash rate changes (deploy markers on timeline)
- [ ] Exportable as JSON/CSV for external reporting
- [ ] Dashboard panel integrated into existing ERNE dashboard

**Integration points:** ClickHouse (#57) provides event aggregations. PostgreSQL (#56) provides version/deploy data. Alert history (#61) contributes to MTTR calculation.

---

### Task 68: Plugin/Extension Marketplace

**Depends on:** MonitorClient (#1), Collector interface

Allows third-party and community-built collectors, processors, and integrations to be installed and configured.

**Files to create:**
- `src/plugins/PluginRegistry.ts`
- `src/plugins/PluginRegistry.test.ts`
- `src/plugins/PluginLoader.ts`
- `server/marketplace/registry.ts`

**Acceptance criteria:**
- [ ] Plugin interface: `{ name, version, type: 'collector' | 'processor' | 'integration', init, dispose }`
- [ ] Plugin registration via config: `config.plugins: ['@erne/plugin-redux', '@erne/plugin-graphql']`
- [ ] Dynamic loading: plugins resolved from `node_modules` at init
- [ ] Sandboxing: plugins cannot access other plugins' state, only SignalBus and public APIs
- [ ] Server-side registry: lists available plugins with description, version, download count
- [ ] Validation: plugins must pass schema validation and basic health check on registration
- [ ] Example plugins: Redux state change tracker, GraphQL query monitor, Zustand action logger

**Integration points:** MonitorClient (#1) loads plugins at init. SignalBus (#4) is the primary plugin integration point. Server registry provides discovery.

---

### Task 69: RSC Monitoring — Expo Router Server Components

**Depends on:** NavigationCollector (#9), NetworkCollector (#8)

Monitors React Server Component rendering performance in Expo Router projects with RSC enabled.

**Files to create:**
- `src/collectors/RSCCollector.ts`
- `src/collectors/RSCCollector.test.ts`

**Acceptance criteria:**
- [ ] Detects RSC-enabled Expo Router projects (checks `reactServerComponentRoutes` config)
- [ ] Tracks server component render time (time from navigation to RSC payload received)
- [ ] Tracks RSC payload size per route
- [ ] Monitors `router.reload()` calls and their response times
- [ ] Detects RSC streaming waterfall issues (sequential server component fetches)
- [ ] Reports: `routeName`, `serverRenderTime`, `payloadSize`, `streamingChunks`, `cacheStatus`
- [ ] Graceful no-op in non-RSC projects (zero overhead)
- [ ] Correlates with client-side navigation timing for full picture

**Integration points:** NavigationCollector (#9) provides route change events. NetworkCollector (#8) captures RSC fetch requests. Dashboard displays RSC performance panel.

---

### Task 70: Metro Auto-Instrumentation

**Depends on:** MonitorClient (#1), all collectors

Metro bundler plugin that automatically injects monitor instrumentation at build time, eliminating manual setup code.

**Files to create:**
- `src/plugins/withMetroInstrumentation.ts` (Metro config plugin)
- `src/plugins/babel/monitorTransform.ts` (Babel transform)
- `src/plugins/metro.test.ts`

**Acceptance criteria:**
- [ ] Metro config plugin: adds Babel transform to project's Metro pipeline
- [ ] Auto-wraps app entry point with `MonitorProvider` if not already present
- [ ] Auto-instruments component exports with render tracking (opt-in per directory)
- [ ] Auto-adds breadcrumb tracking to `onPress` handlers (configurable)
- [ ] Configurable via `erne.monitor` field in `app.json` or `package.json`
- [ ] Preserves source maps — instrumented code maps back to original source
- [ ] Zero runtime overhead when monitor is disabled (transforms compile to no-ops)
- [ ] Does not conflict with React Compiler or other Babel plugins

**Integration points:** Replaces manual `MonitorProvider` setup (#14). Works alongside source map upload (#50). Config plugin integrates with existing Expo config plugin system.

---

## Phase Completion Checklist

- [ ] All 8 tasks (63-70) are complete
- [ ] All previous phase tests still pass (full regression suite)
- [ ] PatternLibrary syncs between device and server without data loss
- [ ] Cross-project patterns are properly anonymized (verified by privacy audit)
- [ ] On-device ML detects synthetic anomalies in test suite with >90% accuracy
- [ ] OTA update delivers new model and patterns without app restart
- [ ] DORA dashboard renders meaningful metrics from real app data
- [ ] At least 2 example plugins load and function via marketplace registry
- [ ] RSC monitoring works with Expo Router server components example
- [ ] Metro auto-instrumentation produces correct output on sample project
- [ ] Plan adherence audit — spec intelligence, extensibility, and platform sections covered
- [ ] Tag: `git tag monitor-phase-4-complete`
- [ ] TRACKER.md updated, monitor v1.0 release criteria evaluated
