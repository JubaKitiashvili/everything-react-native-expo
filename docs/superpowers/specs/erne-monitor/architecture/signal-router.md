# SignalRouter Architecture

> AI agent dispatch system -- the brain that converts runtime signals into automated diagnosis, suggestions, and fixes.

---

## Overview

The SignalRouter is the capstone component of @erne/monitor. It sits between the EventStore (where all processed events land) and ERNE's existing AI agent system. Its job: determine which signals are actionable, correlate related events into incidents, score confidence, build rich context, and dispatch the right agent with the right information.

```
EventStore (processed events)
       |
       v
 +-----------+     +-----------------+     +----------------+
 | DedupEngine| --> |CorrelationEngine| --> |ConfidenceScorer|
 +-----------+     +-----------------+     +----------------+
                                                  |
                                                  v
                                          +---------------+
                                          |ContextBuilder  |
                                          +---------------+
                                                  |
                                                  v
                                          +---------------+
                                          |DispatchEngine  |
                                          +---------------+
                                                  |
                                          +-------+-------+
                                          |               |
                                          v               v
                                   +-----------+  +---------------+
                                   |Feedback   |  |PatternLibrary |
                                   |Tracker    |  |               |
                                   +-----------+  +---------------+
```

---

## Component Details

### 1. DedupEngine

Prevents event storms from overwhelming the AI dispatch system. Two mechanisms work together:

**Hash-based deduplication:**

```typescript
interface DedupEngine {
  /** Generate a dedup key from event properties */
  hash(event: MonitorEvent): string;

  /** Check if this event should be processed or suppressed */
  shouldProcess(event: MonitorEvent): boolean;

  /** Reset state (e.g., on new session) */
  reset(): void;
}
```

The hash is computed from `type + screen + message` (for crashes) or `type + component + metric` (for performance signals). Identical hashes within the dedup window are suppressed.

**Token bucket rate limiting:**

```
Bucket per signal type:
  capacity:    10 tokens
  refill rate: 10 tokens/minute

  Event arrives -> consume 1 token
  Bucket empty  -> suppress event, increment drop counter
  Drop counter  -> included in next allowed event for visibility
```

**Crash-loop detector:**

```
3 crashes within 5 seconds:
  1. Disable SDK (prevent recursive crash)
  2. Emit meta-event: { type: 'sdk.crash_loop', count: N }
  3. Persist meta-event via pre-allocated buffer (signal-safe)
  4. Re-enable on next cold start
```

```typescript
class DedupEngine {
  private buckets = new Map<string, TokenBucket>();
  private recentCrashes: number[] = [];
  private readonly CRASH_LOOP_THRESHOLD = 3;
  private readonly CRASH_LOOP_WINDOW_MS = 5000;

  hash(event: MonitorEvent): string {
    if (event.type === 'crash') {
      return `crash:${event.screen}:${event.message}`;
    }
    return `${event.type}:${event.source}:${event.metric ?? event.message}`;
  }

  shouldProcess(event: MonitorEvent): boolean {
    // Crash-loop detection (always checked first)
    if (event.type === 'crash') {
      this.recentCrashes.push(Date.now());
      this.recentCrashes = this.recentCrashes.filter(
        (t) => Date.now() - t < this.CRASH_LOOP_WINDOW_MS,
      );
      if (this.recentCrashes.length >= this.CRASH_LOOP_THRESHOLD) {
        this.triggerCrashLoopBreaker();
        return false;
      }
    }

    // Token bucket check
    const key = this.hash(event);
    const bucket = this.buckets.get(key) ?? new TokenBucket(10, 10);
    this.buckets.set(key, bucket);
    return bucket.consume();
  }
}
```

---

### 2. CorrelationEngine

Groups related events that occur within a time window into a single incident. Prevents the system from dispatching five agents for what is actually one root cause.

```typescript
interface Incident {
  id: string;
  rootCause: MonitorEvent;       // earliest event in the group
  relatedEvents: MonitorEvent[]; // all correlated events
  screen: string;                // screen where incident occurred
  timestamp: number;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface CorrelationEngine {
  /** Ingest a deduplicated event */
  ingest(event: MonitorEvent): void;

  /** Get pending incidents (called on flush interval) */
  flush(): Incident[];
}
```

**Correlation rules:**

```
Rule 1: Time window
  Events within 5 seconds of each other are candidates for correlation.

Rule 2: Same screen
  Events must share the same screen/route to be correlated.
  Exception: navigation events bridge across screens.

Rule 3: Root cause selection
  The earliest event in the correlated group is the probable root cause.
  Crashes always override non-crash events as root cause.

Rule 4: Incident lifecycle
  An incident stays open for 5 seconds after the last correlated event.
  After 5 seconds of silence, the incident is finalized and dispatched.
```

**Example correlation:**

```
t=0.0s  NetworkEvent: GET /api/user/123 -> 500
t=0.2s  StateEvent: userStore error state set
t=0.5s  RenderEvent: ErrorBoundary rendered (3 re-renders)
t=0.8s  CrashEvent: TypeError at ProfileScreen:42

Correlation result:
  Incident {
    rootCause: NetworkEvent (earliest)
    relatedEvents: [StateEvent, RenderEvent, CrashEvent]
    screen: 'ProfileScreen'
    severity: 'critical' (contains crash)
  }
```

---

### 3. ConfidenceScorer

Assigns a confidence score (0.0-1.0) to each incident, determining the dispatch tier.

**Three-tier scoring:**

```
Score >= 0.85  ->  AUTO-FIX   (generate fix, run tests, present PR)
Score 0.5-0.85 ->  SUGGEST    (diagnosis + suggested approach)
Score < 0.5    ->  NOTIFY     (enriched context, non-blocking warning)
```

**Scoring factors:**

```typescript
interface ScoringFactors {
  // Signal clarity (0-1): how deterministic is the root cause?
  signalClarity: number;

  // Stack quality (0-1): is the stack trace complete and symbolicated?
  stackQuality: number;

  // Pattern match (0-1): does this match a known fix pattern?
  patternMatch: number;

  // Historical success (0-1): agent success rate for this signal type
  historicalSuccess: number;

  // Recency penalty: confidence decays with code churn since last fix
  churnDecay: number;
}

function computeConfidence(factors: ScoringFactors): number {
  const base =
    factors.signalClarity * 0.3 +
    factors.stackQuality * 0.2 +
    factors.patternMatch * 0.25 +
    factors.historicalSuccess * 0.25;

  // Decay: confidence(t) = base * e^(-lambda * churn_since_fix)
  const lambda = 0.1;
  return base * Math.exp(-lambda * factors.churnDecay);
}
```

**Score examples:**

| Incident Type | Typical Score | Why |
|--------------|--------------|-----|
| `TypeError: Cannot read property 'x' of undefined` with clear stack | 0.90 | Deterministic, clear fix (optional chaining) |
| Performance regression (re-renders >10x) | 0.65 | Pattern known but fix varies by context |
| ANR with vague call stack | 0.35 | Ambiguous root cause |
| Memory pressure without specific leak | 0.20 | Too many possible causes |

**Self-calibration:**

```
After each dispatch:
  developer accepts fix   -> reward  +0.05 to signal type baseline
  developer edits fix     -> reward  +0.01 to +0.03 (partial credit)
  developer rejects fix   -> penalty -0.05 to signal type baseline
  developer reverts fix   -> penalty -0.10 to signal type baseline

Thresholds adjust over time:
  If accept rate for 'auto-fix' drops below 60%:
    raise AUTO-FIX threshold from 0.85 to 0.90
  If accept rate for 'suggest' exceeds 80%:
    lower AUTO-FIX threshold from 0.85 to 0.80
```

---

### 4. ContextBuilder

Assembles the complete context package that an ERNE agent needs to diagnose and fix an issue. This is the critical bridge between runtime monitoring and code intelligence.

```typescript
interface IncidentContext {
  // From crash/error
  stackTrace: SymbolicatedFrame[];
  componentStack?: string;

  // From BreadcrumbCollector (last 100 actions before incident)
  breadcrumbs: Breadcrumb[];

  // From git
  gitBlame: BlameInfo[];  // blame on crash-site lines

  // From React internals
  componentTree: FiberNode[];  // fiber walk around crash site

  // From StateCollector
  stateSnapshot: Record<string, unknown>;  // Zustand/Redux state at crash time

  // From NetworkCollector
  recentRequests: NetworkEvent[];  // last 30 seconds

  // From PatternLibrary
  similarFixes: PatternMatch[];  // past fixes for similar crashes

  // From Enricher
  device: DeviceInfo;
  app: AppInfo;
  session: SessionInfo;
}
```

**Assembly process:**

```
Incident received from CorrelationEngine
    |
    v
1. Symbolicate stack trace
   - Use source maps (dev) or dSYM/ProGuard mappings (prod)
   - Resolve to original TS/TSX file + line number
    |
    v
2. Fetch breadcrumbs
   - Last 100 events from BreadcrumbCollector ring buffer
   - Filter to relevant window (30s before incident)
    |
    v
3. Git blame
   - Run blame on crash-site file:line
   - Include: author, commit date, commit message
   - Purpose: identify who last touched the code, how recently
    |
    v
4. React component tree
   - Walk fiber tree from crash site upward
   - Capture: component names, props (sanitized), state
   - Depth: 5 levels up, 2 levels down
    |
    v
5. State snapshot
   - Capture Zustand/Redux store state at crash time
   - Sanitize: remove PII, truncate large values
    |
    v
6. Recent network requests
   - Last 30 seconds of network activity
   - Include: URL, method, status, duration, size
    |
    v
7. Pattern library lookup
   - Query PatternLibrary with incident fingerprint
   - Return: similar past fixes with AST-level diff patterns
    |
    v
8. Package as IncidentContext
   - Attach device/app/session metadata from Enricher
```

---

### 5. DispatchEngine

Executes the three-tier dispatch based on confidence score. This is where ERNE's unique value is realized -- runtime signals become automated code fixes.

#### Tier 1: AUTO-FIX (confidence >= 0.85)

```
1. Plan-first
   - Generate diagnosis document explaining the root cause
   - Generate implementation plan (files to change, approach)

2. Scope check
   - Plan must touch <= 5 files
   - Reject broader changes (downgrade to SUGGEST)

3. Generate fix
   - Create isolated git branch: fix/monitor-{incident-id}
   - Apply code changes using ERNE's code generation

4. Test gate
   - Run existing test suite against the fix
   - If tests fail -> downgrade to SUGGEST with note

5. Present for review
   - Create PR/diff for developer review
   - NEVER auto-commit to main
   - Surface in dashboard with [Apply Fix] [Dismiss] [Create Issue]
```

#### Tier 2: SUGGEST (confidence 0.5-0.85)

```
1. Generate diagnosis
   - Root cause analysis with supporting evidence
   - Suggested approach (not a full fix)

2. Deliver
   - Dashboard: card with diagnosis + suggested approach
   - Terminal: inline warning with link to dashboard
   - Actions: [Show Details] [Snooze] [Create Issue]
```

#### Tier 3: NOTIFY (confidence < 0.5)

```
1. Enrich context
   - Attach breadcrumbs, state, network for manual debugging

2. Deliver
   - Terminal: inline warning (non-blocking, yellow)
   - Dashboard: low-priority card in signal feed
   - No agent dispatched
```

**Agent selection per signal type:**

```typescript
const DISPATCH_RULES: DispatchRule[] = [
  {
    signal: 'crash.fatal',
    agent: 'investigate',
    defaultMode: 'auto-fix',
    threshold: 'always',
  },
  {
    signal: 'crash.non_fatal',
    agent: 'code-reviewer',
    defaultMode: 'suggest',
    threshold: '>3 occurrences',
  },
  {
    signal: 'anr',
    agent: 'performance-profiler',
    defaultMode: 'suggest',
    threshold: '>5s block',
  },
  // ... see Routing Rules table below
];
```

---

### 6. FeedbackTracker

Records the outcome of every dispatch to enable self-improvement.

```typescript
interface FeedbackRecord {
  incidentId: string;
  signalType: string;
  confidence: number;
  dispatchTier: 'auto-fix' | 'suggest' | 'notify';
  agentUsed: string;
  developerResponse: 'accepted' | 'edited' | 'rejected' | 'reverted' | 'ignored';
  timeToResponse: number;  // ms from dispatch to developer action
  outcome: number;         // reward score
}
```

**Reward function:**

```
merged (no edits)      ->  reward = 1.0
edited then merged     ->  reward = 0.3 to 0.7 (proportional to edit size)
rejected               ->  reward = 0.0
reverted after merge   ->  reward = -1.0
ignored (>24h)         ->  reward = 0.0 (neutral, not penalized)
```

**Feedback loop:**

```
FeedbackRecord
    |
    +---> PatternLibrary update
    |     (AST-level diff patterns: crash signature -> fix pattern)
    |
    +---> Confidence recalibration
    |     (adjust per-signal-type baselines)
    |
    +---> MTTR metrics
          (agent vs human resolution time comparison)
```

---

### 7. PatternLibrary

A database of crash-to-fix patterns learned from past dispatches. Enables the ConfidenceScorer to score higher when a matching pattern exists, and the DispatchEngine to generate more accurate fixes.

```typescript
interface Pattern {
  id: string;
  fingerprint: string;          // normalized crash signature
  signalType: string;
  astDiff: ASTDiffPattern;      // abstract syntax tree level change pattern
  successRate: number;          // historical success rate
  occurrences: number;          // times this pattern was applied
  lastUsed: number;             // timestamp
}

interface PatternLibrary {
  /** Find patterns matching an incident fingerprint */
  match(fingerprint: string): Pattern[];

  /** Record a new or updated pattern from feedback */
  learn(incident: Incident, fix: CodeDiff, outcome: number): void;

  /** Prune patterns with low success rates */
  prune(minSuccessRate: number): void;
}
```

**Pattern matching example:**

```
Crash: "TypeError: Cannot read property 'name' of undefined"
  at ProfileScreen.tsx:42

PatternLibrary lookup:
  Match: Pattern #7
    fingerprint: "TypeError:property:undefined"
    astDiff: "add optional chaining to member expression"
    successRate: 0.92
    occurrences: 14

Result: ConfidenceScorer boosts score by +0.25 (pattern match factor)
        DispatchEngine uses astDiff as fix template
```

---

## Routing Rules Table

| Signal | Agent/Skill | Default Mode | Activation Threshold |
|--------|-------------|-------------|---------------------|
| Fatal crash | `investigate` | auto-fix | always |
| Non-fatal crash | `code-reviewer` | suggest | >3 occurrences |
| ANR detected | `performance-profiler` | suggest | >5s main thread block |
| Frame drops >20% | `performance-profiler` | notify | sustained 10s |
| Re-renders >10x | `code-reviewer` | suggest | per component |
| Network 5xx >3 | `senior-developer` | notify | per endpoint |
| A11y violation | `code-reviewer` | batch | session end |
| Memory >80% | `performance-profiler` | notify | sustained 30s |
| Startup >3s | `performance-profiler` | suggest | cold start |
| Frustration signal | `visual-debugger` | notify | tap-to-error <3s |
| Suspense >2s | `performance-profiler` | notify | per boundary |
| Fabric commit >16ms | `performance-profiler` | batch | session end |
| State bloat >1MB | `senior-developer` | notify | per store |

All routing rules are configurable via `monitor.config.ts`:

```typescript
routing: {
  crash: { agent: 'investigate', mode: 'auto-fix' },
  reRender: { agent: 'code-reviewer', mode: 'suggest', threshold: 10 },
  a11y: { enabled: false }, // disable entirely
}
```

---

## Safety Mechanisms

Seven layers of protection prevent the SignalRouter from causing harm:

| Mechanism | Trigger | Action |
|-----------|---------|--------|
| **Crash-loop breaker** | 3 crashes in 5 seconds | Disable SDK, emit meta-event, re-enable on cold start |
| **Token bucket** | >10 events/minute per signal type | Suppress excess events, count drops |
| **Scope cap** | Auto-fix touches >5 files | Reject fix, downgrade to SUGGEST |
| **Test gate** | Fix fails existing tests | Reject fix, downgrade to SUGGEST with failure details |
| **Isolated branch** | Any auto-fix | Always create separate branch/PR, never touch main |
| **Escalation** | 2 rejected fixes for same pattern | Downgrade pattern to notify-only |
| **Circuit breaker** | >5 SDK internal errors in 60s | Disable non-critical collectors, preserve crash handling |

```
Safety priority (in order):
  1. Never crash the host app (crash-loop breaker)
  2. Never commit to main (isolated branch)
  3. Never break existing tests (test gate)
  4. Never overwhelm the developer (token bucket + dedup)
  5. Never repeat mistakes (escalation + feedback)
  6. Never consume excessive resources (circuit breaker)
```
