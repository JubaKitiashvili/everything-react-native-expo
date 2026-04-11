# @erne/monitor — Risk Register

> Known risks, their likelihood, impact, and mitigation strategies.

**Status pass 2026-04-12** (Phase 1 complete):
- **Mitigated in shipped code**: Risks 1, 2, 3, 5, 11, 12, 13
- **Deferred to their phase**: Risks 4 (needs real SQLite runtime), 6/7/9 (Phase 2), 10 (Phase 3)
- **Partially validated**: Risk 8 (bundle size not yet measured end-to-end)

---

## Technical Risks

### Risk 1: ErrorUtils API Changes

**Likelihood:** Medium | **Impact:** High | **Phase:** 1a

React Native may change `ErrorUtils.setGlobalHandler()` in future versions. This is undocumented internal API.

**Mitigation:**
- Abstract behind `PlatformBridge` interface
- CI matrix tests against multiple RN versions
- Watch RN changelog for changes
- Fallback to `window.onerror` style handlers

---

### Risk 2: Hermes Promise Rejection Tracking

**Likelihood:** Medium | **Impact:** Medium | **Phase:** 1a

Hermes's `enablePromiseRejectionTracker` is engine-specific. V8/JSC have different APIs.

**Mitigation:**
- Detect engine at runtime via `typeof HermesInternal`
- Provide fallbacks for non-Hermes environments
- Test on both Hermes and JSC (if JSC builds still exist)

---

### Risk 3: fetch/XHR Monkey-Patching Conflicts

**Likelihood:** High | **Impact:** Medium | **Phase:** 1a

Other libraries (Sentry, Axios interceptors, React Query devtools) also patch fetch/XHR. Multiple patches can conflict.

**Mitigation:**
- Chain to existing handlers (don't replace)
- Use `Object.defineProperty` guards to detect if already patched
- Provide config option to disable network collector if conflicts arise
- Test alongside Sentry to verify coexistence

---

### Risk 4: SQLite Performance on High-Frequency Events

**Likelihood:** Medium | **Impact:** Medium | **Phase:** 1a

Re-render events can fire 100s of times per second. Writing each to SQLite may cause bottleneck.

**Mitigation:**
- Batch writes (buffer in memory, flush every 100 events or 1s)
- Use WAL mode for SQLite (concurrent reads while writing)
- Debounce high-frequency collectors (RenderCollector, FrameDropCollector)
- Profile early, set performance budget thresholds

---

### Risk 5: React Profiler API Overhead

**Likelihood:** Medium | **Impact:** Medium | **Phase:** 1b

React Profiler adds measurable overhead. In dev mode it's acceptable, but if accidentally left on in prod it could slow the app.

**Mitigation:**
- RenderCollector mode = 'dev' only (enforced by config)
- Double-check `__DEV__` guard in collector init
- CI test that prod build doesn't include dev-only collectors

---

### Risk 6: Native Crash Handler Reliability

**Likelihood:** High | **Impact:** Critical | **Phase:** 2a

Signal handlers (SIGSEGV, SIGABRT) run in a severely restricted context. Bugs in crash handling code can cause double-faults (crash in crash handler = total data loss).

**Mitigation:**
- Study Measure.sh and PLCrashReporter implementations
- Use ONLY async-signal-safe functions (write, _exit)
- Pre-allocate all buffers at SDK init (no malloc in handler)
- Test with deliberate crash injection (chaos testing)
- Consider using proven libraries (KSCrash, PLCrashReporter) instead of writing from scratch

---

### Risk 7: App Store Rejection

**Likelihood:** Low | **Impact:** Critical | **Phase:** 2a

Apple may reject apps using private APIs or collecting undisclosed data.

**Mitigation:**
- Never use private APIs (no method swizzling of private UIKit methods)
- Declare "Diagnostics: Crash Data" in privacy manifest
- No IDFA/IDFV collection without ATT consent
- Privacy review before App Store submission
- Test with App Store validation tools

---

### Risk 8: Bundle Size Exceeds Budget

**Likelihood:** Medium | **Impact:** Medium | **Phase:** 1c

30 collectors + SignalRouter + EventStore + codegen types could exceed 50KB gzipped.

**Mitigation:**
- Subpath exports with tree shaking — users only pay for what they import
- CI assertion on bundle size per subpath
- Lazy initialization of non-critical collectors
- Code splitting for SignalRouter components

---

### Risk 9: Expo Dev Tools Plugin API Instability

**Likelihood:** High | **Impact:** Low | **Phase:** 2b

Expo Dev Tools plugin API is relatively new and may change.

**Mitigation:**
- This is a nice-to-have, not critical path
- Build as optional integration, not core dependency
- Keep dev tools plugin code isolated (easy to update/replace)

---

### Risk 10: ClickHouse Operations Complexity

**Likelihood:** Medium | **Impact:** Medium | **Phase:** 3

Self-hosting ClickHouse requires expertise. Schema migrations, materialized view management, disk space planning.

**Mitigation:**
- Phase 3 is far out — can evaluate alternatives (DuckDB, TimescaleDB)
- Provide Docker Compose with sensible defaults
- Document operational runbooks
- OTel export as escape hatch (send to managed ClickHouse or Grafana Cloud)

---

## Process Risks

### Risk 11: Plan Drift

**Likelihood:** High | **Impact:** High | **All Phases**

Over 70 tasks — easy to lose track, skip items, or drift from spec.

**Mitigation:**
- TRACKER.md — session cockpit, task checklist
- PROTOCOLS.md — Plan Adherence Check at every task completion
- Phase Completion Audit — full spec review before next phase
- Red flags list in PROTOCOLS §11

---

### Risk 12: Scope Creep During Implementation

**Likelihood:** High | **Impact:** Medium | **All Phases**

"While I'm here, let me also add..." leads to tasks growing beyond spec.

**Mitigation:**
- PROTOCOLS §3 Round 3: "Did we implement ONLY what the spec says?"
- If new feature is genuinely needed → document as new task, don't fold in
- Architecture Decision Record for any spec changes

---

### Risk 13: Cross-Phase Integration Failures

**Likelihood:** Medium | **Impact:** High | **Phase transitions**

Code built in Phase 1a may not integrate cleanly with Phase 1b additions.

**Mitigation:**
- Integration Health table in TRACKER.md
- Run ALL tests from ALL completed phases at every task completion
- Phase Completion Protocol includes full integration test
- Design interfaces early (PlatformBridge, Collector, SignalBus) — stable contracts

---

## Decision Log

Track key decisions that affect risk mitigation here:

| Date | Decision | Risk Affected |
|------|----------|---------------|
| — | — | — |
