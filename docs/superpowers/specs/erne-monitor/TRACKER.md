# @erne/monitor — Implementation Tracker

> ★ ყოველი სესიის დასაწყისში ეს ფაილი პირველი წაიკითხე. ★

**Last updated:** 2026-04-11
**Current Phase:** Phase 1a — Foundation
**Active Task:** Task 8 — NetworkCollector (next)
**Overall Progress:** 7/70 tasks

---

## Status Dashboard

| Phase | Progress | Status | Deliverable |
|-------|----------|--------|-------------|
| 1a Foundation | 7/14 | 🔄 In progress | crashes + network in terminal |
| 1b Intelligence | 0/11 | 🔒 Blocked by 1a | real-time dashboard |
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
| 8 | NetworkCollector | ⬜ | | | |
| 9 | NavigationCollector | ⬜ | | | |
| 10 | CustomEventCollector | ⬜ | | | |
| 11 | Sanitizer | ⬜ | | | |
| 12 | Enricher | ⬜ | | | |
| 13 | TerminalReporter | ⬜ | | | |
| 14 | MonitorProvider | ⬜ | | | |

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

---

## Plan Adherence

Track coverage of the design spec. Updated at end of each phase.

| Spec Section | Covered By | Status |
|-------------|------------|--------|
| §1 Vision | README.md | ✅ Documented |
| §2 Architecture | architecture/*.md | ✅ Documented |
| §3 SDK Architecture | Phase 1a-1c | ⬜ Not started |
| §4 SignalRouter | Phase 1c | ⬜ Not started |
| §5 Data Pipeline | Phase 1a-1b, 3 | ⬜ Not started |
| §6 Schema Codegen | Phase 1c | ⬜ Not started |
| §7 Performance Budget | Every task | ⬜ Not started |
| §8 Developer Experience | Phase 1c | ⬜ Not started |
| §9 Dashboard | Phase 1b | ⬜ Not started |
| §10 Testing Strategy | Every task | ⬜ Not started |
| §11 Phased Rollout | phases/*.md | ✅ Documented |
| §13 Competitive Advantages | Phase 1c-2b | ⬜ Not started |
| §14 Privacy & Compliance | Phase 1b (ConsentGate) | ⬜ Not started |

---

## Session History

| Date | Session # | Phase | Tasks Completed | Notes |
|------|-----------|-------|-----------------|-------|
| 2026-04-10 | 1 | Planning | — | Design spec created. 6 projects analyzed (Measure.sh, Callstack Brownfield, Sentry, Embrace, Datadog, Instabug). 3 rounds of improvement analysis. 70 tasks planned across 7 phases. |
| 2026-04-11 | 2 | 1a | Bootstrap, Task 1 (MonitorClient) | Option A monorepo chosen. packages/monitor/ bootstrapped (package.json, tsconfig strict, jest config, dirs, entry stub). MonitorClient implemented with singleton + priority-ordered lifecycle + rollback. 14 tests passing. tsc clean. |
