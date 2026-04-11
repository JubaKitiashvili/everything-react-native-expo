# @erne/monitor — Implementation Documentation

> ERNE Runtime Intelligence SDK — monitoring, analysis, and auto-remediation for React Native & Expo

**Current Status:** 37/70 tasks complete (Phase 1 done end-to-end) · 349 tests across 38 suites · tsc strict clean · live-verified on iPhone 17 Pro with a real Expo SDK 55 / RN 0.83 / React 19 production app. See [TRACKER.md](./TRACKER.md) for the live state.

| Phase | Progress | Status |
|---|---|---|
| Phase 1a Foundation | 14/14 | ✅ Done |
| Phase 1b Intelligence | 11/11 | ✅ Done |
| Phase 1c AI Integration | 12/12 | ✅ Done |
| Phase 2a Native Core | 0/7 | ⬜ Ready |
| Phase 2b Native Advanced | 0/9 | 🔒 Blocked by 2a |
| Phase 3 Backend | 0/9 | 🔒 Blocked by 2a |
| Phase 4 Intelligence | 0/8 | 🔒 Blocked by 3 |

## Quick Navigation

| Document | Purpose |
|----------|---------|
| [**TRACKER.md**](./TRACKER.md) | ★ Start here every session — current state, tasks, progress |
| [**PROTOCOLS.md**](./PROTOCOLS.md) | Rules and procedures for implementation |
| [**BOOTSTRAP.md**](./BOOTSTRAP.md) | Project setup — run BEFORE Task 1 |
| [**GLOSSARY.md**](./GLOSSARY.md) | Terminology dictionary — all terms defined |
| [**RISKS.md**](./RISKS.md) | Risk register — 13 known risks with mitigations |
| [**design-spec.md**](./design-spec.md) | Full design specification (source of truth) |

### Architecture Documents

| Document | Covers |
|----------|--------|
| [SDK Architecture](./architecture/sdk-architecture.md) | Package structure, directory layout, collector interface |
| [SignalRouter](./architecture/signal-router.md) | AI agent dispatch, confidence scoring, feedback loops |
| [Data Pipeline](./architecture/data-pipeline.md) | Consent gate, EventStore, transport, OTel export |
| [Schema Codegen](./architecture/schema-codegen.md) | ts-morph codegen, Callstack pattern |
| [Dashboard Integration](./architecture/dashboard-integration.md) | ERNE dashboard, Expo DevTools, terminal reporter |

### Phase Implementation Plans

| Phase | Tasks | Depends On | Deliverable |
|-------|-------|------------|-------------|
| [Phase 1a](./phases/phase-1a-foundation.md) | 14 | — | Crashes + network in terminal |
| [Phase 1b](./phases/phase-1b-intelligence.md) | 11 | 1a | Real-time dashboard |
| [Phase 1c](./phases/phase-1c-ai-integration.md) | 12 | 1b | AI fix suggestions |
| [Phase 2a](./phases/phase-2a-native-core.md) | 7 | 1c | Native crash/ANR monitoring |
| [Phase 2b](./phases/phase-2b-native-advanced.md) | 9 | 2a | Replay, profiler, dev tools |
| [Phase 3](./phases/phase-3-backend.md) | 9 | 2a | Production backend |
| [Phase 4](./phases/phase-4-intelligence.md) | 8 | 3 | Self-learning AI |

### Research & Analysis

| Document | Source |
|----------|--------|
| [Measure.sh Analysis](./research/measure-sh-analysis.md) | Backend architecture, native SDK, data pipeline |
| [Callstack Brownfield](./research/callstack-brownfield-analysis.md) | Codegen, JSI, architecture patterns |
| [Competitive Analysis](./research/competitive-analysis.md) | Sentry, Embrace, Datadog, Instabug |
| [Best Practices](./research/best-practices.md) | OTel, GDPR, offline-first, testing |

## Architecture Summary

```
@erne/monitor
  ├── @erne/monitor-core         (Pure TS, platform-agnostic)
  ├── @erne/monitor-react-native (Expo Module API adapter)
  └── @erne/monitor              (meta-package + config plugin)

30 Collectors → SignalBus → ConsentGate → Pipeline → EventStore
                                                         ├── Dashboard
                                                         ├── SignalRouter → AI Agents
                                                         ├── Transport → Backend
                                                         └── DevTools Plugin
```

## Competitive Position

10 features no competitor has (★):
1. AI auto-fix (crash → PR)
2. Re-render detection
3. Fabric commit latency tracking
4. Suspense boundary tracking
5. Activity wasted-work detection
6. Self-calibrating confidence scoring
7. Crash→fix pattern library
8. IDE-native experience
9. Dual-thread FPS (ERNE + Datadog only)
10. Free self-hosted option
