# SDK Best Practices Research

Research summary from analyzing monitoring SDK design patterns, mobile observability standards, and production-grade implementation techniques.

## OTel Compatibility

### Why OTel Matters

OpenTelemetry is becoming the universal standard for observability data. SDKs that export OTel-compatible data can feed into any backend (Grafana, Jaeger, Datadog, custom ClickHouse).

### Implementation Approach

- Export events as **OTel spans** (traces), **OTel logs** (errors, breadcrumbs), and **OTel metrics** (counters, histograms)
- Use the **OTLP wire protocol** (protobuf over HTTP/gRPC) for transport
- Map mobile concepts to OTel primitives:
  - App session = root trace
  - Screen load = child span
  - Network request = child span with HTTP semantic conventions
  - Error = log record attached to active span
  - FPS/memory = metric with resource attributes
- Include OTel resource attributes: `service.name`, `device.model`, `os.name`, `os.version`, `app.version`, `deployment.environment`

### Practical Constraints

- Full OTel SDK is too heavy for mobile (~500KB). Use a lightweight exporter that produces OTLP-compatible payloads without the full SDK
- Batch spans/logs before export to reduce HTTP overhead
- Support both OTLP/HTTP (JSON) for development and OTLP/gRPC (protobuf) for production

## Session Replay

### Approach: Snapshot-Based

- Capture UI snapshots at **1fps** on state change (not continuous video)
- Trigger snapshot on: navigation event, tap, scroll end, error, network response
- Overlay gesture data (tap coordinates, swipe vectors) on snapshots
- **Mask by default** -- all text inputs, images, and custom views are masked unless explicitly unmasked
- Store snapshots as compressed diff sequences (only changed regions), not full frames

### Privacy Architecture

| Data Type        | Default Behavior | Override             |
| ---------------- | ---------------- | -------------------- |
| Text inputs      | Masked           | `data-unmask="true"` |
| Images           | Placeholder      | `data-unmask="true"` |
| System UI        | Visible          | N/A                  |
| Navigation       | Visible          | N/A                  |
| Gestures         | Coordinates only | N/A                  |

### Storage Considerations

- 1fps snapshots for a 5-minute session: ~2-5MB compressed
- Store only the last N minutes (configurable, default 60s before error)
- Discard replay data for sessions without errors (to save storage)

## Error Fingerprinting

### Two-Stage Approach

**Stage 1: Local (on-device)**

Generate a normalized stack hash:
1. Strip memory addresses and line numbers from stack frames
2. Normalize file paths (remove build-specific prefixes)
3. Remove frame indices
4. Hash the top N frames (typically 5-10) using SHA-256
5. Include error type/message class (but not dynamic message content)

This fingerprint is sent with the error event and used for initial grouping.

**Stage 2: Server (semantic grouping)**

The server performs deeper analysis:
- Compare fingerprints with fuzzy matching (frames may shift by 1-2 positions between builds)
- Group errors that share the same root cause but differ in surface-level frames
- Use symbolicated stack traces for final grouping (unsymbolicated frames may produce different hashes for the same error)
- Merge groups when source map resolution reveals they are identical

### Hermes-Specific Considerations

Hermes bytecode offsets are not stable across builds. Fingerprinting must:
- Symbolicate before hashing (or defer fingerprinting to the server)
- Use function names + relative offsets, not absolute bytecode positions
- Handle the two-stage source map chain: bytecode -> compiled JS -> source TS

## Breadcrumbs

### Ring Buffer Design

- Fixed-size ring buffer of **100 entries** (configurable)
- When full, oldest entries are evicted
- Thread-safe writes (atomic operations or lock-free queue)
- Serialized and attached to error/crash events on capture

### Breadcrumb Categories

| Category     | Auto-Captured | Examples                                        |
| ------------ | ------------- | ----------------------------------------------- |
| `navigation` | Yes           | Screen transitions, tab changes, modal open/close |
| `network`    | Yes           | HTTP request start/complete/error, status code   |
| `ui.tap`     | Yes           | Button press, list item tap (with component name) |
| `state`      | Manual        | Store mutations, auth state changes              |
| `console`    | Yes           | console.log/warn/error output                    |
| `lifecycle`  | Yes           | App foreground/background, memory warning        |

### Breadcrumb Data Structure

```
{
  timestamp: number        // monotonic clock (not wall clock)
  category: string         // from table above
  message: string          // human-readable description
  level: 'debug' | 'info' | 'warning' | 'error'
  data: Record<string, unknown>  // category-specific metadata
}
```

## Performance Budget

The SDK itself must not degrade the app it monitors. Target budgets:

| Metric         | Budget    | Measurement Method                              |
| -------------- | --------- | ----------------------------------------------- |
| CPU overhead   | < 2%      | Profile with and without SDK, compare CPU time  |
| RAM overhead   | < 5MB     | Measure resident set size delta                 |
| Battery impact | < 1%      | 24-hour battery drain test with/without SDK     |
| JS bundle size | < 50KB    | Measure gzipped JS bundle contribution          |
| Startup delay  | < 50ms    | Measure TTI delta with/without SDK              |
| Network        | < 100KB/h | Measure outbound bytes in normal usage          |

### Achieving the Budget

- Batch events and send in a single HTTP request every 30s (not per-event)
- Use protobuf for wire format (50-80% smaller than JSON)
- Sample high-frequency events (FPS, memory) at 1Hz, not every frame
- Defer SDK initialization to after first meaningful paint
- Use native threads for event processing (never block JS thread)

## Offline-First Architecture

### Priority Queue

Events are stored in a local priority queue with three levels:

| Priority | Event Types                        | Retention    |
| -------- | ---------------------------------- | ------------ |
| Critical | Crashes, ANRs, fatal errors        | Until sent   |
| Normal   | Handled errors, performance events | 24 hours     |
| Low      | Breadcrumbs, debug logs            | 4 hours      |

### Flushing Strategy

- **Connectivity-aware**: check network reachability before attempting flush
- **Exponential backoff**: on failure, wait 1s, 2s, 4s, 8s, ... up to 5 minutes
- **Batch size cap**: max 500KB per request to avoid timeouts on slow connections
- **Flush triggers**: every 30s, on app background, on significant event (crash)
- **Deduplication**: events include a UUID; server deduplicates on ingest

### Storage

- SQLite or file-based storage on the native side (not AsyncStorage)
- Encrypted at rest using platform keychain-derived key
- Size-capped: max 10MB local storage, oldest low-priority events evicted first

## GDPR Compliance

### Deferred Initialization

The SDK must support **deferred init** for consent management:

```
1. App launches
2. SDK loads but does NOT capture or transmit anything
3. Consent dialog shown to user
4. User accepts → SDK.start() begins capture
5. User declines → SDK remains dormant, no data collected
```

### Per-Category Consent

Support granular consent categories:

| Category     | Description                        | Default |
| ------------ | ---------------------------------- | ------- |
| `crashes`    | Crash reports and ANRs             | Opt-in  |
| `performance`| App startup, screen load, FPS      | Opt-in  |
| `analytics`  | User behavior, navigation patterns | Opt-in  |
| `replay`     | Session replay snapshots           | Opt-in  |

### Hard Rules

- **No transmission before consent** -- not even anonymous device info
- **DSAR support** (Data Subject Access Request): ability to export all data for a user ID and delete it on request
- **Data minimization**: collect only what is needed for the consented categories
- **Anonymization**: user identifiers are hashed before storage; raw user IDs never leave the device unless explicitly set by the developer

## Source Maps

### EAS Build Integration

- **Config plugin hook**: automatically runs after EAS Build completes
- Extracts source maps from the build output (`.jsbundle.map` for iOS, `index.android.bundle.map` for Android)
- Handles Hermes bytecode source map chaining:
  1. Hermes compiler produces `bytecode.hbc` + `bytecode.hbc.map` (bytecode -> compiled JS)
  2. Metro bundler produces `bundle.map` (compiled JS -> source TS/TSX)
  3. Both maps must be chained to resolve bytecode offsets to source locations
- Uploads chained source map + build metadata (version, build number, commit SHA) to the monitoring backend
- Associates uploaded maps with the specific app version for correct symbolication

### Validation

- Verify source map coverage: check that all JS frames in a test crash resolve correctly
- Warn if source map is incomplete (common when using `require()` for lazy modules)
- Fail the build if source map upload fails (configurable -- can be set to warn-only)

## Edge Cases

### Crash During Crash

If the app crashes while the crash handler is running:

- Use **signal-safe handlers** only: no heap allocation, no locks, no I/O
- Write crash data to a **pre-allocated memory-mapped file** (allocated at SDK init)
- On next launch, read the memory-mapped file and send the crash report
- If the memory-mapped file is corrupted (double crash), discard it gracefully

### Crash Loops

If the app crashes repeatedly on startup:

- Track crash count in native persistent storage (SharedPreferences / NSUserDefaults)
- If 3 crashes occur within 5 seconds of launch, **disable the SDK** on next launch
- Surface a "crash loop detected" event to the backend (from the disabled state)
- Provide a developer API to manually re-enable after the underlying bug is fixed
- This prevents the SDK from contributing to the crash loop (e.g., if SDK init itself is the cause)

### Clock Skew

Mobile device clocks can be wrong (user-set, timezone issues, no NTP sync):

- Use **monotonic clock** (`performance.now()` / `CACurrentMediaTime()` / `SystemClock.elapsedRealtime()`) for event ordering within a session
- Use wall clock for absolute timestamps but include device clock offset if detectable
- Server normalizes timestamps on ingest using server receive time as anchor

## AI Auto-Fix Architecture

### Plan-First Approach

When ERNE Monitor detects an error and attempts an auto-fix:

1. **Analyze**: gather full context (error, breadcrumbs, stack trace, source code, recent commits)
2. **Plan**: generate an implementation plan before writing any code
3. **Scope cap**: maximum 5 files modified per auto-fix (prevents runaway changes)
4. **Implement**: apply the fix in an isolated branch
5. **Test gate**: run the project's test suite; if tests fail, discard the fix
6. **Review**: present the fix as a PR with full context for human review

### Guardrails

- Never auto-merge -- always create a PR for human review
- Never modify files outside the project's source directory
- Never change dependency versions
- Include a "confidence score" (0-100) with every auto-fix attempt
- Below threshold (default 60): suggest investigation steps instead of a fix

## Self-Learning System

### Outcome Tracking

For every auto-fix attempt, track the outcome:

| Outcome          | Description                                    |
| ---------------- | ---------------------------------------------- |
| `accepted`       | Developer merged the fix PR                    |
| `modified`       | Developer edited the fix before merging        |
| `rejected`       | Developer closed the fix PR                    |
| `auto-reverted`  | Fix was merged but later reverted              |

### Confidence Decay

- Initial confidence for a new error pattern: 50 (baseline)
- Each `accepted` outcome for similar patterns: +10
- Each `rejected` outcome: -15
- Each `auto-reverted`: -25
- Confidence decays by 5% per month without new data (patterns may become stale)

### Crash-to-Fix Pattern Library

Build a local knowledge base of crash patterns and their fixes:

```
Pattern: "TypeError: Cannot read property 'X' of undefined"
  + Stack frame in useEffect callback
  + Component mounted/unmounted rapidly
  
Fix pattern: Add cleanup function to useEffect, guard with mounted ref
Confidence: 87 (based on 23 accepted fixes)
```

This library is:
- Project-specific (different projects have different patterns)
- Stored locally in `.erne/monitor/patterns/`
- Exported anonymously to improve global pattern matching (opt-in)
- Versioned alongside the project (git-tracked)

## Key Lessons for ERNE Monitor

1. **OTel as the foundation** -- build on OTel primitives, support OTLP export, but keep the SDK lightweight
2. **Mask by default for replay** -- privacy must be the default, not an opt-in
3. **Two-stage fingerprinting** -- local hash for speed, server semantic grouping for accuracy
4. **Strict performance budget** -- the SDK must be invisible to the user experience
5. **Offline-first with priority** -- crashes must never be lost, debug logs can be
6. **Deferred init for GDPR** -- no data capture before explicit consent
7. **Source map reliability is critical** -- invest heavily in the Hermes source map chain
8. **Signal-safe crash handlers** -- native crash capture must survive hostile conditions
9. **Crash loop protection** -- the SDK must not make things worse
10. **Plan-first auto-fix** -- AI fixes need guardrails, test gates, and human review
11. **Outcome tracking for self-learning** -- track what works and what doesn't, let confidence scores guide future attempts
