# Measure.sh Deep Analysis

Research summary from analyzing the Measure.sh open-source mobile monitoring platform.

## Backend Architecture

Measure.sh runs **8 Go microservices**, each with a focused responsibility:

| Service            | Role                                                        |
| ------------------ | ----------------------------------------------------------- |
| `api`              | REST API gateway, serves dashboard queries, auth, projects  |
| `ingest`           | HTTP endpoint for SDK payloads, validates and enqueues       |
| `ingest-worker x3` | Consume from message queue, transform and write to stores   |
| `alerts`           | Evaluates alert rules against metrics, dispatches notifications |
| `cleanup`          | TTL-based data retention, prunes expired events and sessions |
| `symboloader`      | Processes uploaded dSYM/mapping files, indexes symbol tables |
| `metering`         | Usage tracking per project (event counts, session counts)    |

### Key Insight: Decoupled Ingest Pipeline

The ingest service does NOT write directly to the database. It validates payloads and pushes them onto an **Apache Iggy** message queue. Three independent ingest-worker instances consume from the queue in parallel. This decoupling means:

- Ingest can absorb traffic spikes without back-pressure on the database
- Workers can be scaled independently
- Failed writes can be retried from the queue without data loss
- The API service is never blocked by write-heavy ingest traffic

## Database Layer

| Database         | Purpose                                              |
| ---------------- | ---------------------------------------------------- |
| PostgreSQL 16    | Projects, users, alert rules, symbol metadata, auth  |
| ClickHouse 25    | Event storage, session analytics, time-series metrics |
| Valkey (Redis)   | Rate limiting, caching, session deduplication         |
| Apache Iggy      | Message queue between ingest and workers              |

### Materialized Views

ClickHouse materialized views pre-compute common analytics queries:

- Crash-free session rates (rolling window)
- Error frequency by group (hourly buckets)
- Performance percentiles (p50, p95, p99) for app startup, screen load, network latency
- User impact scores (unique users affected per issue)

This avoids expensive aggregation at query time and keeps the dashboard responsive even with billions of events.

## Storage Layer

| Storage              | Purpose                                      |
| -------------------- | -------------------------------------------- |
| MinIO/S3             | Symbol files (dSYM, Proguard mappings), crash attachments |
| Sentry Symbolicator  | Stack frame symbolication using uploaded symbols |

Symbolicator runs as a sidecar service. When a crash arrives with unsymbolicated frames, the worker calls Symbolicator with the frame addresses and build UUID. Symbolicator looks up the matching symbol file in S3 and returns human-readable stack traces.

## React Native SDK

The RN SDK is a **thin JavaScript layer** that delegates all heavy lifting to native SDKs:

- **No local storage in JS** -- events are buffered and batched on the native side
- **NativeModules bridge** -- JS calls into Objective-C (iOS) and Java/Kotlin (Android) native modules
- Navigation tracking via monkey-patching React Navigation lifecycle events
- Touch tracking via a top-level gesture responder wrapper
- Network interception via XMLHttpRequest/fetch patching
- Console capture via overriding console.log/warn/error

### SDK Design Decisions

- Events are serialized to JSON on the JS side but queued and batched on the native side
- Crash handlers are installed in native code (signal handlers on iOS, UncaughtExceptionHandler on Android)
- The JS layer has no persistent state -- if the app crashes, the native queue survives
- Session management (start, end, background/foreground transitions) is handled natively

## Frontend Dashboard

- **Framework**: Next.js 14 (App Router)
- **Styling**: Tailwind CSS
- **Charts**: Nivo (D3-based charting library)
- **10 dashboard views**:
  1. Overview (crash-free rate, session count, top issues)
  2. Crashes (grouped by stack trace fingerprint)
  3. ANRs (Application Not Responding)
  4. Errors (handled exceptions)
  5. Performance (app startup, screen load times)
  6. Network (HTTP request latency, error rates)
  7. Sessions (individual session timeline)
  8. Alerts (rule management and history)
  9. Settings (project configuration, team members)
  10. Symbols (upload status, mapping files)

## MCP Integration

Measure.sh exposes an MCP (Model Context Protocol) server that allows AI agents to:

- Query crash groups and individual events
- Read session timelines with full breadcrumb context
- Access performance metrics and trends
- Search events by user ID, device, OS version

This is notable because it means an AI agent can investigate production issues directly against the monitoring data without needing the dashboard UI.

## Key Lessons for ERNE Monitor

1. **Decouple ingest from processing** -- message queue absorbs spikes, enables independent scaling
2. **Materialized views for analytics** -- pre-compute common queries, keep dashboard fast
3. **Native-first SDK** -- JS is just a bridge, all persistence and crash handling lives in native code
4. **Symbolicator as a service** -- don't build your own, use Sentry's battle-tested implementation
5. **MCP integration** -- enabling AI agents to query monitoring data is a differentiator
6. **Separate OLTP and OLAP** -- PostgreSQL for config/auth, ClickHouse for event analytics
