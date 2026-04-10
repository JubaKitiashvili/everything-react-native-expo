# @erne/monitor — Implementation Tracker

> ★ ყოველი სესიის დასაწყისში ეს ფაილი პირველი წაიკითხე. ★

**Last updated:** 2026-04-11
**Current Phase:** Phase 1b (SDK collectors/processors done; dashboard integration pending)
**Active Task:** Tasks 24 (DashboardBridge) + 25 (Runtime tab) — next session
**Overall Progress:** 23/70 tasks (Phase 1a 14/14 ✅ · Phase 1b 9/11)

---

## Status Dashboard

| Phase | Progress | Status | Deliverable |
|-------|----------|--------|-------------|
| 1a Foundation | 14/14 | ✅ Done | crashes + network in terminal |
| 1b Intelligence | 9/11 | 🔄 In progress | real-time dashboard |
| 1c AI Integration | 0/12 | 🔒 Blocked by 1b | AI fix suggestions |
| 2a Native Core | 0/7 | 🔒 Blocked by 1c | native crash/ANR monitoring |
| 2b Native Advanced | 0/9 | 🔒 Blocked by 2a | replay, profiler, dev tools |
| 3 Backend | 0/9 | 🔒 Blocked by 2a | production backend |
| 4 Intelligence | 0/8 | 🔒 Blocked by 3 | self-learning AI |

---

## Active Task

> **None** — ready to begin Phase 1a, Task #1: MonitorClient

### Pre-Start Checklist
- [ ] Read PROTOCOLS.md
- [ ] Review phase-1a-foundation.md
- [ ] Verify no blockers in Blockers & Decisions section

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

---

## Plan Adherence

Track coverage of the design spec. Updated at end of each phase.

| Spec Section | Covered By | Status |
|-------------|------------|--------|
| §1 Vision | README.md | ✅ Documented |
| §2 Architecture | architecture/*.md | ✅ Documented |
| §3 SDK Architecture | Phase 1a-1c | 🔄 Phase 1a complete (MonitorClient, Config, PlatformBridge, SessionManager, SignalBus, collectors) |
| §4 SignalRouter | Phase 1c | ⬜ Not started |
| §5 Data Pipeline | Phase 1a-1b, 3 | 🔄 EventStore + SignalBus + Sanitizer + Enricher shipped; full pipeline routing lands in 1b |
| §6 Schema Codegen | Phase 1c | ⬜ Not started |
| §7 Performance Budget | Every task | 🔄 Bundle size not yet measured — deferred to Phase 1a integration pass with Expo demo |
| §8 Developer Experience | Phase 1c | 🔄 defineMonitorConfig + MonitorProvider shipped; zero-config CLI wizard lands in 1c |
| §9 Dashboard | Phase 1b | 🔄 TerminalReporter (dev surface) shipped; real-time dashboard tab in 1b |
| §10 Testing Strategy | Every task | ✅ 173 unit tests across 16 suites; integration tests in 1b |
| §11 Phased Rollout | phases/*.md | ✅ Documented |
| §13 Competitive Advantages | Phase 1c-2b | ⬜ Not started |
| §14 Privacy & Compliance | Phase 1b (ConsentGate) | 🔄 Sanitizer shipped; ConsentGate lands in 1b |

---

## Session History

| Date | Session # | Phase | Tasks Completed | Notes |
|------|-----------|-------|-----------------|-------|
| 2026-04-10 | 1 | Planning | — | Design spec created. 6 projects analyzed (Measure.sh, Callstack Brownfield, Sentry, Embrace, Datadog, Instabug). 3 rounds of improvement analysis. 70 tasks planned across 7 phases. |
| 2026-04-11 | 2 | 1a | Bootstrap, Task 1 (MonitorClient) | Option A monorepo chosen. packages/monitor/ bootstrapped (package.json, tsconfig strict, jest config, dirs, entry stub). MonitorClient implemented with singleton + priority-ordered lifecycle + rollback. 14 tests passing. tsc clean. |
| 2026-04-11 | 2 (cont.) | 1a | Tasks 2–14 + SQLite adapter | Completed all Phase 1a tasks in a single autonomous session per Juba's instruction ("გადი ბოლომდე, ინსტრუქციის მიხედვით"). Config with validation and deep-freeze; PlatformBridge with DI JS impl; SignalBus with error isolation and snapshot dispatch; SessionManager with 5-min AppState inactivity; EventStore with pluggable backend (Memory + Sqlite adapters); CrashCollector chaining ErrorUtils + rejection tracker + sync fatal persist; NetworkCollector with transparent fetch/XHR patching; NavigationCollector with adapter-based auto-detect; CustomEventCollector with trackEvent validation; Sanitizer with email/phone/header/URL scrubbing; Enricher with cached static + dynamic context; TerminalReporter rate-limited dev surface; MonitorProvider + createMonitorRuntime end-to-end wiring. 173 tests across 16 suites, tsc clean. Deferred for Phase 1a integration pass: bundle size measurement and Expo demo app (both require a real RN runtime). |

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
