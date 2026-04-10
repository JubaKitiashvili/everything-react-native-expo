# @erne/monitor — Glossary

> Terminology used across all documentation. Read when a term is unclear.

---

## Core Concepts

| Term | Definition |
|------|-----------|
| **MonitorClient** | Singleton that manages SDK lifecycle (init, start, stop). Entry point for everything. |
| **Collector** | A module that captures one type of runtime data (crashes, network, renders, etc.). Implements the `Collector` interface with `init()`, `start()`, `stop()`, `dispose()`. |
| **SignalBus** | Central typed event emitter. All collectors emit events here. All processors subscribe here. |
| **MonitorEvent** | A single data point captured by a collector. Has `type`, `timestamp`, `sessionId`, `data`. |
| **MonitorProvider** | React component wrapping the app root. Initializes MonitorClient on mount. |

## Pipeline Components

| Term | Definition |
|------|-----------|
| **ConsentGate** | GDPR processor. Blocks data transmission until user grants consent. Per-category (crashes, analytics, replay). |
| **Sanitizer** | Processor that strips PII (emails, phone numbers, auth headers) from events before storage. |
| **AdaptiveSampler** | Processor that reduces collection frequency based on battery, CPU, and configured sampling rates. |
| **Enricher** | Processor that adds device, app, session metadata to every event. |
| **Fingerprinter** | Processor that generates deterministic hashes from crash stack traces for dedup. |
| **EventStore** | SQLite-based local event buffer with priority queue. Persists events on device. |
| **Transport** | Sends batched events from EventStore to remote backend. Offline-first with exponential backoff. |
| **OTelExporter** | Exports events in OpenTelemetry Protocol (OTLP) format for compatibility with any OTel backend. |

## SignalRouter Components

| Term | Definition |
|------|-----------|
| **SignalRouter** | The "brain" — processes runtime events and dispatches ERNE AI agents to analyze/fix issues. |
| **DedupEngine** | Prevents duplicate alerts. Uses hash-based dedup keys + token bucket (10 events/min). Includes crash-loop detection. |
| **CorrelationEngine** | Groups related events into single incidents. Uses 5-second time window + same screen heuristic. |
| **ConfidenceScorer** | Assigns confidence score (0-1) to each signal. Determines dispatch tier: AUTO-FIX (>0.85), SUGGEST (0.5-0.85), NOTIFY (<0.5). |
| **ContextBuilder** | Assembles rich context for AI analysis: stack trace + breadcrumbs + git blame + component tree + state + network history. |
| **DispatchEngine** | Routes signals to ERNE agents based on confidence tier. Manages plan-first architecture, scope cap, test gate. |
| **FeedbackTracker** | Records developer accept/reject decisions. Feeds reward signal back to ConfidenceScorer for self-calibration. |
| **PatternLibrary** | Database of crash→fix patterns learned from past fixes. Stores AST-level diff patterns, not raw text. |

## Dispatch Tiers

| Tier | Confidence | Behavior |
|------|-----------|----------|
| **AUTO-FIX** | >0.85 | Generate plan → scope check → generate fix → test gate → present PR on isolated branch |
| **SUGGEST** | 0.5-0.85 | Generate diagnosis + suggested approach → show in dashboard + terminal |
| **NOTIFY** | <0.5 | Enriched context → terminal inline warning (non-blocking) |

## Data Types

| Term | Definition |
|------|-----------|
| **Breadcrumb** | A single user action in the trail leading to an event. Has type, category, message, timestamp. Ring buffer of 100. |
| **Frustration Signal** | Correlation between a user tap and a subsequent error within 3 seconds. Indicates UX problem. |
| **Span Snapshot** | An in-progress OTel span persisted to disk when app backgrounds, to be completed in a future session. |
| **Fabric Commit** | The time between React's virtual DOM diff and the native view mutation. Measured by FabricCommitTracker. |

## Architecture Patterns (from research)

| Term | Definition |
|------|-----------|
| **Single Source of Truth** | Callstack pattern: one TypeScript schema file generates types for all platforms (TS + Swift + Kotlin). |
| **Convention-Based Discovery** | File naming conventions trigger automatic behavior (e.g., `*.monitor.ts` auto-discovered by codegen). |
| **Signal-Safe Handler** | Crash handler that only uses async-signal-safe functions (write, _exit). No malloc, no ObjC runtime. Pre-allocated buffers. |
| **Token Bucket** | Rate limiter: N tokens per time window. Each event consumes a token. Empty bucket = events dropped. |
| **Crash-Loop Breaker** | Safety mechanism: 3 crashes in 5 seconds → disable SDK → report meta-event → re-enable on next cold start. |
| **Plan-First Architecture** | AI generates a diagnosis/plan before code. Developer can reject the plan without any code being generated. Cheapest checkpoint. |

## Abbreviations

| Abbrev | Full |
|--------|------|
| **OTel** | OpenTelemetry |
| **OTLP** | OpenTelemetry Protocol |
| **PII** | Personally Identifiable Information |
| **GDPR** | General Data Protection Regulation |
| **DSAR** | Data Subject Access Request |
| **ADR** | Architecture Decision Record |
| **MTTR** | Mean Time To Resolution |
| **DORA** | DevOps Research and Assessment (metrics) |
| **CEP** | Complex Event Processing |
| **EMA** | Exponential Moving Average |
| **FPS** | Frames Per Second |
| **ANR** | Application Not Responding |
| **TTI** | Time To Interactive |
| **rAF** | requestAnimationFrame |
| **JSI** | JavaScript Interface (RN New Architecture) |
| **RSC** | React Server Components |
