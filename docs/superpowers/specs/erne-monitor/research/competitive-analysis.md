# Competitive Analysis

Research summary from analyzing Sentry, Embrace, Datadog, and Instabug -- the four major mobile monitoring platforms used in React Native projects.

## Sentry React Native SDK

### Architecture

- **TouchEventBoundary**: wraps the app root to capture touch events as breadcrumbs. Records component name, coordinates, and testID for every tap. Used to reconstruct "what the user was doing" before a crash.
- **Hermes Profiler Integration**: captures JavaScript profiling data (CPU flamegraphs) tied to transactions. Enables developers to see which JS functions were executing during a slow screen load.
- **Signal-Safe Crash Handlers**: native crash handlers installed via `sigaction` (iOS) and `UncaughtExceptionHandler` (Android). These handlers are signal-safe -- they avoid heap allocation, locks, and I/O during crash capture, writing only to a pre-allocated memory-mapped file.
- **Envelope Transport**: events are serialized into Sentry's envelope format (a multipart container that can hold events, attachments, sessions, and profiles in a single payload). Sent via HTTP POST with gzip compression.
- **Breadcrumbs**: automatic breadcrumbs for navigation events, network requests, console output, and UI interactions. Each breadcrumb has a category, message, level, and timestamp.
- **RewriteFrames Integration**: source map integration that rewrites stack frame file paths from device-local paths to repository-relative paths. Required for correct source map resolution.

### Strengths

- Most mature RN SDK, largest community
- Excellent source map support with Hermes bytecode chaining
- Performance monitoring with custom instrumentation API
- Session replay (beta) with privacy masking

### Weaknesses

- Complex setup for Hermes + source maps (multiple steps, easy to misconfigure)
- Alert fatigue -- default rules produce too many notifications
- Event-based pricing can spike unexpectedly
- No JS-to-native correlation (a JS error and a native crash from the same root cause appear as separate issues)

## Embrace

### Architecture

- **OTel-Native Sessions**: Embrace is built on OpenTelemetry from the ground up. Sessions are represented as OTel traces with spans for each lifecycle phase (cold start, warm start, screen load, background, foreground).
- **Span Snapshots**: when a session ends or the app backgrounds, Embrace takes a "snapshot" of all active spans. If the app crashes or is killed, these snapshots are recovered on next launch to reconstruct partial traces across sessions.
- **Cold/Warm Startup Classification**: automatically classifies app launches:
  - **Cold**: process was not in memory, full initialization required
  - **Warm**: process was in memory but activity was destroyed, partial initialization
  - **Hot**: process and activity were in memory, minimal initialization

### Strengths

- OTel compatibility means data can be exported to any OTel-compatible backend
- Session-centric view (not just individual errors)
- Startup performance tracking is automatic and accurate
- User timeline shows the full session journey

### Weaknesses

- Smaller community than Sentry
- Dashboard is less polished than Sentry's
- Limited RN-specific features compared to Sentry's dedicated RN SDK
- Pricing is session-based, which can be expensive for high-DAU apps

## Datadog RUM (Real User Monitoring)

### Architecture

- **Frustration Signals**: Datadog correlates user actions with outcomes. A "frustrated tap" is detected when a tap event is immediately followed by an error or a long wait (>1s with no response). This surfaces issues that cause user frustration, not just technical errors.
- **Dual-Thread FPS**: measures FPS on both the JS thread and the UI thread independently. This distinguishes between JS-caused jank (heavy computation blocking the JS thread) and native-caused jank (layout/rendering on the UI thread).
- **Error Taps**: tracks when users tap on elements that produce errors, creating a direct link between user action and error. Goes beyond simple error counting to show "this button causes errors for 12% of users who tap it."

### Strengths

- Integrates with Datadog's full observability stack (APM, logs, infrastructure)
- Frustration signals surface high-impact issues
- Dual-thread FPS is unique and valuable for RN
- Strong correlation between frontend errors and backend traces

### Weaknesses

- Expensive -- Datadog pricing is famously high
- SDK is heavier than alternatives (~200KB JS)
- RN support is a secondary focus (web and native are primary)
- Setup requires Datadog infrastructure (not standalone)

## Instabug

### Architecture

- **Shake-to-Report**: users shake the device to trigger a bug report flow. Captures a screenshot, allows annotation (draw on the screenshot to highlight issues), and collects device state, console logs, and network requests automatically.
- **Screenshot Annotation**: built-in drawing tools let users circle, arrow, and highlight the exact UI issue. This visual context is attached to the bug report.
- **Visual Repro Steps**: automatically records the sequence of screens and interactions leading up to the bug report. Displayed as a visual timeline in the dashboard.
- **Bi-Directional Communication**: developers can reply to bug reports directly from the dashboard. Users see the reply in-app. Creates a conversation thread attached to the bug report.

### Strengths

- Best-in-class bug reporting UX for end users
- Visual repro steps reduce "how to reproduce" back-and-forth
- Bi-directional communication closes the feedback loop
- Low engineering effort to integrate (primarily a user-facing tool)

### Weaknesses

- Not a full monitoring platform (no APM, limited crash analytics)
- Relies on user-initiated reports (misses crashes that prevent reporting)
- Limited automated detection compared to Sentry/Datadog
- No OTel compatibility

## Common Developer Complaints (Across All Platforms)

These complaints surfaced repeatedly in developer surveys, GitHub issues, and forum discussions:

### 1. Alert Fatigue

> "I get 50 alerts a day and ignore all of them."

Default alert configurations are too sensitive. Developers disable alerts entirely, which means real issues go unnoticed. The solution is intelligent alerting that considers:
- Rate of change (sudden spike vs. gradual increase)
- User impact (1 user vs. 1000 users)
- Severity (crash vs. handled error)
- Historical context (is this a known flaky area?)

### 2. Broken Source Maps

> "Half my crash reports show minified stack traces."

Source map configuration for Hermes + React Native is fragile. Common failure modes:
- Hermes bytecode requires two-stage source map chaining (bytecode -> JS -> TS)
- EAS Build and local builds produce source maps in different locations
- Version mismatches between uploaded source maps and deployed bundles
- No feedback when source maps are wrong -- crashes just show garbled frames

### 3. No JS-to-Native Correlation

> "I see a native crash and a JS error that I suspect are related, but they're separate issues."

Current platforms treat JS errors and native crashes as independent event streams. A native crash caused by a JS bridge call appears as an unrelated issue. Developers manually correlate by timestamp, which is tedious and error-prone.

### 4. Event-Based Pricing Surprises

> "We shipped a bug that logged 10M events in one day and got a $5K bill."

Event-based pricing punishes bugs. A logging loop, an infinite re-render, or a retry storm can produce millions of events in hours. Developers want:
- Client-side rate limiting (cap events per session)
- Server-side spike protection (auto-throttle above threshold)
- Predictable pricing (session-based or flat-rate)

### 5. What Developers Actually Want

Across all platforms, three requests appear consistently:

| Request                              | Description                                                    |
| ------------------------------------ | -------------------------------------------------------------- |
| **"Tell me WHY"**                    | Don't just show the error -- explain the likely cause and context |
| **"Fix it for me"**                  | Generate a fix or at least a starting point for the fix         |
| **"Auto-group across layers"**       | Correlate JS errors, native crashes, and network failures that share a root cause |

## Key Lessons for ERNE Monitor

1. **Frustration signals** (Datadog) are more actionable than raw error counts -- surface issues by user impact, not volume
2. **OTel compatibility** (Embrace) is the future -- build on OTel primitives so data can flow anywhere
3. **Visual repro steps** (Instabug) dramatically reduce debugging time -- session replay with gesture overlay
4. **Dual-thread FPS** (Datadog) is essential for RN -- JS thread and UI thread jank have different causes and different fixes
5. **Intelligent alerting** is a gap across all platforms -- ERNE Monitor can differentiate here
6. **Source map reliability** is table stakes -- if source maps don't work perfectly, nothing else matters
7. **JS-to-native correlation** is an unsolved problem -- solving it would be a significant differentiator
8. **AI-powered "tell me WHY"** is the most-requested feature -- this is where ERNE's agent architecture provides a natural advantage
