# Phase 3: Production Backend

**Goal:** "Cloud-scale monitoring for production apps"
**Depends on:** Phase 2a (SDK must have stable event format and transport interface)
**Deliverable:** Offline-first event upload, OTLP-compatible export, PostgreSQL + ClickHouse storage, ingest pipeline, symbolication, alerting, and data lifecycle management
**Parallel with:** Phase 2b (native advanced) — backend receives events from SDK regardless of native module status

---

## Success Criteria

- [ ] Events queue offline and flush reliably when connectivity resumes
- [ ] OTelExporter produces valid OTLP/HTTP payloads accepted by any OTLP-compatible backend
- [ ] PostgreSQL stores metadata, app configs, alert rules, and user data
- [ ] ClickHouse stores high-volume event data with sub-second aggregation queries
- [ ] Ingest service accepts batched events, validates, and routes to storage
- [ ] Ingest workers process background jobs (symbolication, fingerprinting, alerting)
- [ ] Symbolication service resolves production stack traces using uploaded source maps
- [ ] Alerting engine fires notifications on configurable thresholds
- [ ] Data retention automatically cleans up expired events without manual intervention
- [ ] End-to-end: crash in production app reaches alert notification within 60 seconds

---

## Tasks

### Task 54: Transport — Offline-First Batch Upload

**Depends on:** EventStore (#6), ConsentGate (#23)

Client-side transport layer that batches events and handles offline/online transitions.

**Files to create:**
- `src/transport/BatchTransport.ts`
- `src/transport/BatchTransport.test.ts`
- `src/transport/RetryQueue.ts`
- `src/transport/RetryQueue.test.ts`

**Acceptance criteria:**
- [ ] Batches events from EventStore by configurable interval (default 30s) and max batch size (default 50)
- [ ] Detects network connectivity via `NetInfo` — queues when offline
- [ ] On reconnect: flushes queued batches in order, oldest first
- [ ] Exponential backoff on server errors: 1s, 2s, 4s, 8s, max 60s
- [ ] Retry queue persisted to EventStore — survives app restart
- [ ] Payload compressed with gzip before transmission
- [ ] Critical events (crashes) flush immediately, bypassing batch timer
- [ ] Respects ConsentGate — only transmits consented categories
- [ ] Reports transport health: `{ pending, failed, lastFlushTime }`

**Integration points:** EventStore (#6) provides events. ConsentGate (#23) gates transmission. Ingest service (#58) receives batches.

---

### Task 55: OTelExporter — OTLP Wire Protocol

**Depends on:** BatchTransport (#54)

Exports monitor events as OpenTelemetry-compatible signals (traces, metrics, logs).

**Files to create:**
- `src/transport/OTelExporter.ts`
- `src/transport/OTelExporter.test.ts`
- `src/transport/otel/TraceMapper.ts`
- `src/transport/otel/MetricMapper.ts`
- `src/transport/otel/LogMapper.ts`

**Acceptance criteria:**
- [ ] Maps crash events to OTel log records with severity `ERROR`/`FATAL`
- [ ] Maps navigation events to OTel spans (screen-to-screen traces)
- [ ] Maps FPS/memory/startup metrics to OTel gauge/histogram metrics
- [ ] Produces valid OTLP/HTTP JSON payloads per OpenTelemetry spec
- [ ] Configurable endpoint — works with Grafana, Jaeger, Datadog, or ERNE backend
- [ ] Adds resource attributes: `service.name`, `service.version`, `device.id`, `os.type`
- [ ] Supports both push (OTLP/HTTP) and pull (Prometheus exposition format) for metrics
- [ ] Can be used standalone without ERNE backend (send to any OTLP collector)

**Integration points:** BatchTransport (#54) handles delivery. Ingest service (#58) accepts OTLP format natively.

---

### Task 56: PostgreSQL Schema + Migrations

**Depends on:** None (can be designed independently)

Relational schema for metadata, configuration, users, alert rules, and app registrations.

**Files to create:**
- `server/db/migrations/001_initial_schema.sql`
- `server/db/migrations/002_alert_rules.sql`
- `server/db/schema.ts` (Drizzle ORM or raw SQL type definitions)
- `server/db/seed.ts`

**Acceptance criteria:**
- [ ] Tables: `apps`, `app_versions`, `source_maps`, `alert_rules`, `alert_history`, `api_keys`
- [ ] `apps`: id, name, bundle_id, platform, created_at, config_json
- [ ] `app_versions`: id, app_id, version, build_number, created_at
- [ ] `source_maps`: id, app_version_id, platform, bundle_id, map_url, uploaded_at
- [ ] `alert_rules`: id, app_id, metric, operator, threshold, channel, enabled
- [ ] `alert_history`: id, rule_id, triggered_at, resolved_at, payload_json
- [ ] `api_keys`: id, app_id, key_hash, scopes, created_at, last_used_at
- [ ] Migration runner: up/down for each migration, tracks applied state
- [ ] Indexes on foreign keys and common query patterns

**Integration points:** Ingest service (#58) reads app/version data. Alerting engine (#61) reads/writes alert rules and history. Source map upload (#50) writes to source_maps.

---

### Task 57: ClickHouse Schema + Materialized Views

**Depends on:** None (can be designed independently)

High-volume event storage optimized for time-series aggregation queries.

**Files to create:**
- `server/clickhouse/migrations/001_events_table.sql`
- `server/clickhouse/migrations/002_materialized_views.sql`
- `server/clickhouse/queries.ts` (typed query builders)

**Acceptance criteria:**
- [ ] Main table `events`: ReplacingMergeTree, partitioned by `toYYYYMM(timestamp)`, ordered by `(app_id, event_type, timestamp)`
- [ ] Columns: `app_id`, `event_type`, `timestamp`, `session_id`, `fingerprint`, `severity`, `screen`, `data` (JSON), `device_json`, `enrichment_json`
- [ ] Materialized view: `crash_counts_hourly` — crash count per app/fingerprint/hour
- [ ] Materialized view: `perf_metrics_5min` — p50/p95/p99 of FPS, startup, network latency per 5-minute bucket
- [ ] Materialized view: `error_rate_hourly` — network error rate per app/endpoint/hour
- [ ] TTL: raw events 90 days, aggregated views 1 year (configurable)
- [ ] Codec: LZ4 compression on data/JSON columns
- [ ] Query helpers: typed functions for common dashboard queries (crash trend, perf trend, top errors)

**Integration points:** Ingest workers (#59) write events. Dashboard queries read aggregated views. Data retention (#62) manages TTL policies.

---

### Task 58: Ingest Service

**Depends on:** PostgreSQL schema (#56), ClickHouse schema (#57)

HTTP service that accepts event batches from SDK clients, validates, and routes to storage.

**Files to create:**
- `server/ingest/server.ts`
- `server/ingest/validator.ts`
- `server/ingest/router.ts`
- `server/ingest/server.test.ts`

**Acceptance criteria:**
- [ ] HTTP endpoint: `POST /v1/events` accepts gzip-compressed JSON batches
- [ ] HTTP endpoint: `POST /v1/otlp/traces`, `/v1/otlp/metrics`, `/v1/otlp/logs` for OTLP format
- [ ] Authenticates via API key in `X-ERNE-Key` header (looked up from PostgreSQL)
- [ ] Validates event schema — rejects malformed events with 400 + error details
- [ ] Rate limiting: per-app, configurable (default 1000 events/minute)
- [ ] Enqueues validated events to job queue for async processing (does not write to ClickHouse synchronously)
- [ ] Returns `202 Accepted` with receipt ID for successful batches
- [ ] Health check endpoint: `GET /health` with dependency status
- [ ] Handles backpressure: returns `429` with `Retry-After` header when queue is full

**Integration points:** BatchTransport (#54) and OTelExporter (#55) send to this service. Ingest workers (#59) consume the job queue. PostgreSQL (#56) for API key auth.

---

### Task 59: Ingest Workers

**Depends on:** Ingest service (#58), ClickHouse schema (#57)

Background workers that process enqueued events: enrich, fingerprint, store, and trigger alerts.

**Files to create:**
- `server/workers/eventProcessor.ts`
- `server/workers/crashProcessor.ts`
- `server/workers/metricsAggregator.ts`
- `server/workers/workers.test.ts`

**Acceptance criteria:**
- [ ] Consumes events from job queue (Redis/BullMQ or similar)
- [ ] Event processor: writes validated events to ClickHouse in batches (insert every 1s or 1000 events)
- [ ] Crash processor: applies server-side fingerprinting, deduplicates, triggers symbolication job
- [ ] Metrics aggregator: pre-computes 1-minute rollups for dashboard real-time view
- [ ] Dead letter queue for events that fail processing after 3 retries
- [ ] Horizontally scalable — multiple worker instances with partition-based consumption
- [ ] Emits processing metrics: events/second, queue depth, error rate

**Integration points:** Ingest service (#58) produces jobs. ClickHouse (#57) receives writes. Symbolication service (#60) handles crash frames. Alerting engine (#61) evaluates rules.

---

### Task 60: Symbolication Service

**Depends on:** Source map upload (#50), PostgreSQL schema (#56)

Resolves minified/bundled stack traces to original source locations using uploaded source maps.

**Files to create:**
- `server/symbolication/service.ts`
- `server/symbolication/sourceMapResolver.ts`
- `server/symbolication/cache.ts`
- `server/symbolication/service.test.ts`

**Acceptance criteria:**
- [ ] Accepts crash event with raw stack frames + `bundleId` + `appVersion`
- [ ] Looks up source map from PostgreSQL `source_maps` table by version/platform/bundleId
- [ ] Resolves each frame: `{ file, line, column }` in minified code to original source location
- [ ] Handles Hermes bytecode source maps (HBC format)
- [ ] Caches parsed source maps in memory (LRU, max 100 maps, ~500MB cap)
- [ ] Returns symbolicated stack trace with: original file path, line, column, function name
- [ ] Handles missing source maps gracefully — returns raw frames with `symbolicated: false`
- [ ] Processing time target: <200ms per crash event (cached source map)

**Integration points:** Crash processor worker (#59) calls this service. Source map upload (#50) populates the source map store. Dashboard displays symbolicated traces.

---

### Task 61: Alerting Engine

**Depends on:** PostgreSQL schema (#56), ClickHouse schema (#57)

Evaluates alert rules against incoming events and metrics, fires notifications on threshold breach.

**Files to create:**
- `server/alerting/engine.ts`
- `server/alerting/evaluator.ts`
- `server/alerting/channels/slack.ts`
- `server/alerting/channels/webhook.ts`
- `server/alerting/channels/email.ts`
- `server/alerting/engine.test.ts`

**Acceptance criteria:**
- [ ] Evaluates rules: `metric` `operator` `threshold` over `window` (e.g., crash_count > 10 in 5min)
- [ ] Supported metrics: crash_count, crash_rate, error_rate, p95_startup, p95_fps_drop, new_fingerprint
- [ ] Operators: `>`, `<`, `>=`, `<=`, `==`, `change_pct` (percentage change vs previous window)
- [ ] Notification channels: Slack webhook, generic HTTP webhook, email (SMTP)
- [ ] Alert deduplication: same rule does not fire again within cooldown period (default 15min)
- [ ] Alert resolution: auto-resolves when metric returns below threshold
- [ ] Records alert history in PostgreSQL with trigger/resolve timestamps
- [ ] Supports per-app alert rules with different thresholds

**Integration points:** Ingest workers (#59) trigger evaluation after event processing. PostgreSQL (#56) stores rules and history. Dashboard manages alert configuration.

---

### Task 62: Data Retention / Cleanup

**Depends on:** ClickHouse schema (#57), PostgreSQL schema (#56)

Automated data lifecycle management — purges expired events and manages storage costs.

**Files to create:**
- `server/maintenance/retention.ts`
- `server/maintenance/cleanup.ts`
- `server/maintenance/retention.test.ts`

**Acceptance criteria:**
- [ ] Configurable retention policies per app: raw events (default 90 days), aggregated (default 1 year)
- [ ] Runs as scheduled job (cron) — daily at low-traffic hour
- [ ] ClickHouse: drops expired partitions (efficient, no row-by-row delete)
- [ ] PostgreSQL: cleans up orphaned source maps, expired API keys, old alert history
- [ ] Never deletes data newer than retention period (safety check)
- [ ] Logs cleanup results: partitions dropped, rows deleted, space reclaimed
- [ ] Dry-run mode: shows what would be deleted without executing
- [ ] Emits metrics: storage_used_bytes, events_total, cleanup_duration

**Integration points:** ClickHouse (#57) and PostgreSQL (#56) are the cleanup targets. Dashboard shows storage usage metrics.

---

## Phase Completion Checklist

- [ ] All 9 tasks (54-62) are complete
- [ ] All SDK tests still pass (Phase 1a, 1b, 2a regression check)
- [ ] End-to-end test: crash on device reaches ClickHouse within 60 seconds
- [ ] End-to-end test: crash triggers alert notification within 90 seconds
- [ ] Symbolication resolves production stack traces correctly
- [ ] Offline → online transition flushes all queued events without data loss
- [ ] OTLP export accepted by at least one external collector (Grafana/Jaeger)
- [ ] Data retention job runs without errors on test dataset
- [ ] Ingest service handles 1000 events/second sustained load
- [ ] Plan adherence audit — spec transport, backend, and operations sections covered
- [ ] Tag: `git tag monitor-phase-3-complete`
- [ ] TRACKER.md updated, Phase 4 unblocked
