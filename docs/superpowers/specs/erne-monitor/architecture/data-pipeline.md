# Data Pipeline Architecture

> Event processing from collector output to storage, transport, and export. Covers consent, sanitization, sampling, enrichment, fingerprinting, persistence, and offline-first delivery.

---

## Pipeline Overview

Every event emitted by a collector flows through a deterministic processing pipeline before reaching storage and output channels.

```
Collector
    |
    v
SignalBus (typed event emitter)
    |
    v
ConsentGate (GDPR -- block or allow)
    |
    v
Sanitizer (PII stripping)
    |
    v
AdaptiveSampler (battery/CPU-aware)
    |
    v
Enricher (device, app, session metadata)
    |
    v
Fingerprinter (normalized hash for dedup)
    |
    v
EventStore (SQLite, priority queue, 50MB cap)
    |
    +---> DashboardBridge (WebSocket, real-time, dev only)
    +---> SignalRouter (AI agent dispatch)
    +---> Transport (offline-first batch upload)
    +---> ExpoDevToolsPlugin (dev tools tab)
```

Each processor is a pure function (or stateless transform) that receives an event and returns a modified event or `null` (to drop it). This makes the pipeline testable, composable, and easy to reason about.

---

## 1. ConsentGate

The first processor in the pipeline. Enforces GDPR/privacy requirements by blocking event transmission until user consent is granted.

### Consent Model

```typescript
interface ConsentState {
  crashes: boolean;    // crash data (usually always allowed)
  analytics: boolean;  // performance, network, render metrics
  replay: boolean;     // screenshots, session replay, gesture capture
}
```

### Lifecycle

```
App launch
    |
    v
SDK buffers ALL events locally (SQLite)
    |
    v
NO transmission occurs (ConsentGate is closed)
    |
    +--- User grants consent (per category)
    |        |
    |        v
    |    ConsentGate opens for granted categories
    |    Flush buffered events matching granted categories
    |    Start real-time transport for those categories
    |
    +--- User denies consent
    |        |
    |        v
    |    Purge buffered events for denied categories
    |    Disable export for those categories (local-only mode)
    |
    +--- User changes consent later
             |
             v
         Re-evaluate: newly granted -> flush, newly denied -> purge
```

### Category Mapping

Each event type maps to a consent category:

| Event Type | Consent Category | Rationale |
|-----------|-----------------|-----------|
| `crash`, `anr` | `crashes` | Essential for app stability |
| `network`, `performance`, `render`, `memory`, `startup` | `analytics` | Performance monitoring |
| `screenshot`, `gesture_replay`, `session_replay` | `replay` | Contains visual user data |
| `breadcrumb`, `navigation`, `state` | `analytics` | Behavioral data |
| `a11y`, `frustration` | `analytics` | UX quality data |

### DSAR Compliance

```typescript
// Data Subject Access Request support
monitor.exportUserData(userId);   // -> JSON dump of all stored events for user
monitor.deleteUserData(userId);   // -> purge from local SQLite + remote (if connected)
```

---

## 2. Sanitizer

Strips PII (Personally Identifiable Information) from events before they leave the device.

### Auto-Redaction Patterns

```typescript
class Sanitizer {
  private readonly PII_PATTERNS = [
    { name: 'email', pattern: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
    { name: 'phone', pattern: /\+?[1-9]\d{1,14}/g },
    { name: 'ssn', pattern: /\d{3}-\d{2}-\d{4}/g },
    { name: 'credit_card', pattern: /\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}/g },
    { name: 'ipv4', pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g },
  ];

  private readonly SENSITIVE_HEADERS = [
    'authorization',
    'cookie',
    'set-cookie',
    'x-api-key',
    'x-auth-token',
  ];

  sanitize(event: MonitorEvent): MonitorEvent {
    // Deep clone to avoid mutating original
    const sanitized = structuredClone(event);

    // Redact string fields
    this.redactStrings(sanitized);

    // Strip sensitive network headers
    if (sanitized.type === 'network') {
      this.redactHeaders(sanitized);
    }

    // Truncate large state snapshots
    if (sanitized.type === 'state') {
      this.truncateState(sanitized, 10_000); // 10KB max
    }

    return sanitized;
  }

  private redactStrings(obj: unknown): void {
    // Recursively walk object, replace PII matches with [REDACTED]
    for (const pattern of this.PII_PATTERNS) {
      // Replace all matches in all string values
    }
  }

  private redactHeaders(event: NetworkEvent): void {
    for (const header of this.SENSITIVE_HEADERS) {
      if (event.requestHeaders?.[header]) {
        event.requestHeaders[header] = '[REDACTED]';
      }
      if (event.responseHeaders?.[header]) {
        event.responseHeaders[header] = '[REDACTED]';
      }
    }
  }
}
```

### Developer-Defined Redaction

```typescript
// monitor.config.ts
export default defineMonitorConfig({
  sanitizer: {
    redactPaths: [
      'user.password',
      'user.token',
      'payment.cardNumber',
    ],
    redactPatterns: [
      /MY_CUSTOM_ID_\d+/g,
    ],
  },
});
```

---

## 3. AdaptiveSampler

Dynamically adjusts event sampling rate based on device conditions. Prevents the SDK from degrading app performance on resource-constrained devices.

### Adaptive Degradation Tiers

```
Tier 1: Normal (default)
  Battery: >20%
  CPU: <80%
  Network: WiFi
  -> Sample rate: config.sampling (default 1.0 dev, 0.1 prod)
  -> All collectors active
  -> Batch interval: 60s

Tier 2: Reduced
  Battery: 10-20% OR CPU: 80-90%
  -> Sample rate: 0.1 (10%)
  -> Disable replay collector
  -> Batch interval: 120s

Tier 3: Minimal
  Battery: <10% OR CPU: >90%
  -> Sample rate: 0.01 (1%)
  -> Only crash + ANR collectors
  -> Batch interval: 300s (5min)

Tier 4: Emergency
  Memory pressure warning from OS
  -> Flush EventStore immediately
  -> Reduce ring buffer from 100 to 50
  -> Disable all non-critical collectors
```

```typescript
class AdaptiveSampler {
  private currentTier: 1 | 2 | 3 | 4 = 1;

  shouldSample(event: MonitorEvent): boolean {
    // Crashes and ANRs are NEVER sampled out
    if (event.type === 'crash' || event.type === 'anr') {
      return true;
    }

    const rate = this.getSampleRate();
    return Math.random() < rate;
  }

  private getSampleRate(): number {
    switch (this.currentTier) {
      case 1: return this.config.sampling.prod; // default 0.1
      case 2: return 0.1;
      case 3: return 0.01;
      case 4: return 0;  // only crashes pass
    }
  }

  /** Called periodically by NativeMetrics to update conditions */
  updateConditions(metrics: DeviceMetrics): void {
    if (metrics.memoryPressure === 'critical') {
      this.currentTier = 4;
    } else if (metrics.battery < 10 || metrics.cpuUsage > 90) {
      this.currentTier = 3;
    } else if (metrics.battery < 20 || metrics.cpuUsage > 80) {
      this.currentTier = 2;
    } else {
      this.currentTier = 1;
    }
  }
}
```

---

## 4. Enricher

Attaches device, app, and session metadata to every event. This metadata is essential for filtering, grouping, and debugging in the dashboard and backend.

```typescript
interface EnrichedEvent extends MonitorEvent {
  // Device
  device: {
    os: string;           // 'ios' | 'android'
    osVersion: string;    // '18.2'
    model: string;        // 'iPhone 16 Pro'
    manufacturer: string; // 'Apple'
    isEmulator: boolean;
    locale: string;       // 'en-US'
    timezone: string;     // 'America/New_York'
  };

  // App
  app: {
    bundleId: string;     // 'com.myapp'
    version: string;      // '2.1.0'
    buildNumber: string;  // '42'
    environment: string;  // 'development' | 'preview' | 'production'
    updateId?: string;    // EAS Update ID (if OTA)
    runtimeVersion: string;
  };

  // Session
  session: {
    id: string;           // UUID, rotates on 5min inactivity
    startedAt: number;    // timestamp
    screenHistory: string[]; // route path history
    eventIndex: number;   // ordinal within session
  };

  // SDK
  sdk: {
    name: string;         // '@erne/monitor'
    version: string;      // '1.0.0'
    samplingTier: number; // current adaptive tier
  };
}
```

The Enricher reads device info from `expo-constants` and `expo-device` at init time (cached for the session) and attaches it to every event passing through.

---

## 5. Fingerprinter

Generates normalized hashes for crash events, enabling deduplication across sessions and devices. Two identical crashes from different users should produce the same fingerprint.

```typescript
class Fingerprinter {
  fingerprint(event: MonitorEvent): string {
    if (event.type === 'crash') {
      return this.fingerprintCrash(event as CrashEvent);
    }
    if (event.type === 'network') {
      return this.fingerprintNetwork(event as NetworkEvent);
    }
    return this.fingerprintGeneric(event);
  }

  private fingerprintCrash(event: CrashEvent): string {
    // Normalize stack: strip line numbers, memory addresses, closure names
    const normalizedStack = event.stack
      .split('\n')
      .slice(0, 5)  // top 5 frames only
      .map((frame) => this.normalizeFrame(frame))
      .join('|');

    return hash(`${event.message}|${normalizedStack}`);
  }

  private normalizeFrame(frame: string): string {
    // Remove: line:column, memory addresses, anonymous closure IDs
    // Keep: file name, function name
    return frame
      .replace(/:\d+:\d+/g, '')      // strip line:col
      .replace(/0x[0-9a-f]+/gi, '')  // strip addresses
      .replace(/<anonymous>/g, '')    // strip anonymous
      .trim();
  }
}
```

**Fingerprint stability:**

```
Same crash, different device:
  "TypeError: x of undefined at ProfileScreen:42"
  "TypeError: x of undefined at ProfileScreen:42"
  -> Same fingerprint: "abc123"

Same crash, different line (code shifted):
  "TypeError: x of undefined at ProfileScreen:42"
  "TypeError: x of undefined at ProfileScreen:45"
  -> Same fingerprint: "abc123" (line numbers stripped)

Different crash:
  "ReferenceError: y is not defined at HomeScreen:10"
  -> Different fingerprint: "def456"
```

---

## 6. EventStore (SQLite)

Persistent event buffer using SQLite. Implements a priority queue to ensure critical events (crashes) are flushed before lower-priority events.

### Schema

```sql
CREATE TABLE events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  priority INTEGER NOT NULL,    -- 0=CRITICAL, 1=HIGH, 2=NORMAL, 3=LOW
  fingerprint TEXT,
  payload TEXT NOT NULL,         -- JSON-encoded event
  session_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  transmitted_at INTEGER,        -- NULL until successfully sent
  retry_count INTEGER DEFAULT 0
);

CREATE INDEX idx_events_priority ON events(priority, created_at);
CREATE INDEX idx_events_session ON events(session_id);
CREATE INDEX idx_events_fingerprint ON events(fingerprint);
```

### Priority Queue

```
CRITICAL (priority=0): crashes, ANRs
  -> Flush immediately (within 1 second)
  -> Never evicted by LRU
  -> Written via pre-allocated buffer (signal-safe)

HIGH (priority=1): network errors, OOM
  -> Flush every 30 seconds
  -> Evicted only after 7 days

NORMAL (priority=2): performance, renders, breadcrumbs
  -> Flush every 60 seconds
  -> Standard LRU eviction

LOW (priority=3): a11y, custom events, batched signals
  -> Flush every 5 minutes
  -> First to be evicted under size pressure
```

### Constraints

```
Size cap:     50MB with LRU eviction
              (never evict CRITICAL events)

Retention:    Auto-purge after 7 days
              (configurable via monitor.config.ts)

Crash safety: CRITICAL events use synchronous write
              via pre-allocated buffer
              (signal-safe: no malloc, no locks, write() syscall only)
              Survives process death
              Reconstructed on next cold start
```

### Size Management

```typescript
class EventStore {
  private readonly MAX_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

  async checkSizeLimit(): Promise<void> {
    const currentSize = await this.getDatabaseSize();

    if (currentSize > this.MAX_SIZE_BYTES) {
      // Evict LOW priority first, then NORMAL, then HIGH
      // Never evict CRITICAL
      await this.evictByPriority(currentSize - this.MAX_SIZE_BYTES);
    }
  }

  private async evictByPriority(bytesToFree: number): Promise<void> {
    const priorities = [3, 2, 1]; // LOW, NORMAL, HIGH (never 0/CRITICAL)

    for (const priority of priorities) {
      if (bytesToFree <= 0) break;

      const evicted = await this.db.runAsync(
        `DELETE FROM events
         WHERE id IN (
           SELECT id FROM events
           WHERE priority = ? AND transmitted_at IS NOT NULL
           ORDER BY created_at ASC
           LIMIT 100
         )`,
        priority,
      );

      bytesToFree -= evicted.changes * this.estimateRowSize();
    }
  }
}
```

---

## 7. Transport (Offline-First)

Handles batched upload of events from the EventStore to the backend. Designed for unreliable mobile networks.

### Connectivity-Aware Batching

```
WiFi connected:
  -> Flush immediately (no batching delay)
  -> Max batch size: 100 events

Cellular connected:
  -> Batch interval: 60 seconds
  -> Max batch size: 50 events
  -> Compress with gzip

Offline:
  -> Hold all events in EventStore
  -> Retry on reconnect (via NetInfo listener)
  -> No data loss
```

### Failure Handling

```
Batch upload attempt
    |
    +--- Success (2xx)
    |        -> Mark events as transmitted_at = now()
    |        -> Remove from retry queue
    |
    +--- Retryable failure (5xx, timeout, network error)
    |        -> Exponential backoff with jitter:
    |           delay = min(2^attempt * 1000 + random(0,1000), 300000)
    |           Attempt 1: ~1-2s
    |           Attempt 2: ~2-3s
    |           Attempt 3: ~4-5s
    |           ...
    |           Max: 5 minutes
    |        -> Max 3 retries per batch
    |        -> After 3 failures: re-queue events, reset retry counter
    |
    +--- Permanent failure (4xx, invalid payload)
             -> Log error to _diagnostics channel
             -> Drop batch (don't retry)
             -> Increment internal error counter
```

```typescript
class Transport {
  private retryQueue: BatchJob[] = [];

  async flush(): Promise<void> {
    const events = await this.eventStore.getUnsentEvents(this.config.maxBatchSize);
    if (events.length === 0) return;

    const compressed = gzip(JSON.stringify(events));

    try {
      const response = await fetch(this.config.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Encoding': 'gzip',
          'X-ERNE-SDK-Version': SDK_VERSION,
        },
        body: compressed,
      });

      if (response.ok) {
        await this.eventStore.markTransmitted(events.map((e) => e.id));
      } else if (response.status >= 500) {
        this.scheduleRetry(events);
      }
      // 4xx = permanent failure, drop silently
    } catch (error) {
      // Network error -> retry
      this.scheduleRetry(events);
    }
  }

  private scheduleRetry(events: MonitorEvent[]): void {
    const job = this.retryQueue.find((j) => j.batchId === events[0].batchId);
    if (job && job.attempts >= 3) {
      // Re-queue events for next flush cycle
      return;
    }

    const attempt = (job?.attempts ?? 0) + 1;
    const delay = Math.min(Math.pow(2, attempt) * 1000 + Math.random() * 1000, 300_000);

    setTimeout(() => this.flush(), delay);
  }
}
```

---

## 8. OTel Export

Translates internal event formats to OpenTelemetry Protocol (OTLP) wire format. Enables compatibility with any OTel-compatible backend (Grafana, Honeycomb, Datadog, Jaeger).

### Event-to-OTel Mapping

```
Internal Event Type    ->    OTel Signal    ->    OTel Attributes
-----------------------------------------------------------------
crash (fatal/non-fatal) ->   Log            ->    severity: FATAL/ERROR
                                                  exception.type
                                                  exception.message
                                                  exception.stacktrace

span (startup, network) ->   Trace          ->    W3C trace context
                                                  span.kind: CLIENT/INTERNAL
                                                  http.method, http.status_code

metric (FPS, memory)    ->   Metric         ->    Gauge or Histogram
                                                  unit, description

session                 ->   Root Span      ->    session.id
                                                  with child spans for events
```

### Export Configuration

```typescript
// monitor.config.ts
transport: {
  endpoint: null,             // null = local only (Phase 1)
  otelEndpoint: null,         // OTel collector URL (Phase 3)
  batchInterval: 60_000,
  maxBatchSize: 100,
}
```

### OTel Exporter Implementation

```typescript
class OTelExporter {
  async export(events: EnrichedEvent[]): Promise<void> {
    const logs: OTelLog[] = [];
    const spans: OTelSpan[] = [];
    const metrics: OTelMetric[] = [];

    for (const event of events) {
      switch (event.type) {
        case 'crash':
        case 'anr':
          logs.push(this.toOTelLog(event));
          break;
        case 'startup':
        case 'network':
          spans.push(this.toOTelSpan(event));
          break;
        case 'frame_drop':
        case 'memory':
          metrics.push(this.toOTelMetric(event));
          break;
      }
    }

    // Send via OTLP HTTP (protobuf or JSON)
    await Promise.all([
      this.sendLogs(logs),
      this.sendTraces(spans),
      this.sendMetrics(metrics),
    ]);
  }

  private toOTelLog(event: CrashEvent): OTelLog {
    return {
      timeUnixNano: event.timestamp * 1_000_000,
      severityNumber: event.isFatal ? 21 : 17, // FATAL vs ERROR
      severityText: event.isFatal ? 'FATAL' : 'ERROR',
      body: { stringValue: event.message },
      attributes: [
        { key: 'exception.type', value: { stringValue: event.errorType } },
        { key: 'exception.stacktrace', value: { stringValue: event.stack } },
        { key: 'session.id', value: { stringValue: event.session.id } },
        { key: 'screen.name', value: { stringValue: event.screen } },
      ],
      resource: this.buildResource(event),
    };
  }
}
```

---

## Performance Budget Compliance

The entire pipeline must stay within these budgets:

| Metric | Budget | Enforcement |
|--------|--------|-------------|
| CPU | <2% baseline | Reassure perf tests with/without SDK |
| Memory | <5MB additional | `dumpsys meminfo` / Instruments |
| Battery | <1% per hour | Device lab testing |
| Bundle (JS) | <50KB gzipped | CI size assertion |
| Startup impact | <100ms | TTI delta measurement |
| Network | <1 req/minute (background) | Transport config |

The AdaptiveSampler is the primary mechanism for maintaining these budgets under adverse conditions. When device metrics exceed thresholds, the sampler automatically reduces pipeline load.

---

## Pipeline Invariants

1. **Consent before transmission:** No event leaves the device before ConsentGate approval. Events are always buffered locally first.
2. **PII never persisted raw:** Sanitizer runs before EventStore write. Raw PII exists only in memory, briefly.
3. **Crashes never dropped:** CRITICAL priority events bypass sampling, bypass size limits, and are written via signal-safe pre-allocated buffers.
4. **Offline resilience:** All events are persisted to SQLite before transport. Network failures cause retries, never data loss.
5. **Pipeline errors are non-recursive:** Internal SDK errors go to a `_diagnostics` channel, never through the main pipeline. This prevents error loops.
