# Launch KPIs — @erne/monitor

> Definitions for the launch KPIs we use to judge whether `@erne/monitor` is
> working as a product. **This document defines what we measure and how — it
> does not set target numbers.** Every target below is intentionally `TBD`;
> targets are set against real baselines once we have data, never fabricated up
> front.

## How these are measured

Two complementary sources feed these KPIs:

1. **Product/ingest data** — what the monitor itself records about the apps it
   watches (sessions, events, crashes, AI fix PRs). This is the source of truth
   for activation, crash-free rate, time-to-first-insight, and SDK adoption.
2. **In-app self-analytics** — the dashboard SPA's own usage, via the
   privacy-respecting analytics module (`app/src/shared/analytics`). This feeds
   the engagement KPIs (WAU/DAU). See the note at the bottom.

---

## KPIs

### 1. Activation — first event ingested per project

- **Definition:** A project is "activated" once the monitor backend has
  ingested at least one event from that project's SDK. Measures whether a newly
  onboarded project ever reaches the point of sending real data.
- **How it's measured:** Ingest data — count of distinct project IDs with
  `events >= 1`, divided by projects created. Time-to-activation = first-event
  timestamp minus project-created timestamp.
- **Target:** `TBD`

### 2. Crash-free session rate

- **Definition:** Share of sessions that complete without a crash event.
  `crash_free_rate = 1 - (sessions_with_crash / total_sessions)`. This is a
  **tracked health metric**, reported as-is rather than steered to a number.
- **How it's measured:** Ingest data — derived from session and crash-event
  records already stored by the monitor. Reported as a trend over time, not a
  pass/fail threshold.
- **Target:** `TBD` (tracked, not a target)

### 3. Time-to-first-insight

- **Definition:** Elapsed time from a project's first ingested event to the
  first time a user views a populated dashboard view (crash group, ANR, perf
  chart, or session detail) for that project. Proxy for "how fast does the
  product deliver value".
- **How it's measured:** Ingest first-event timestamp paired with the first
  in-app pageview of a data-bearing route (from self-analytics) for the same
  project.
- **Target:** `TBD`

### 4. Dashboard WAU / DAU

- **Definition:** Weekly and daily active users of the dashboard SPA. "Active"
  = at least one pageview in the window. WAU/DAU ratio indicates stickiness.
- **How it's measured:** In-app self-analytics pageview events, aggregated by
  the configured Plausible instance. No per-user identifiers are sent (see
  privacy note), so counts are derived from Plausible's own aggregation.
- **Target:** `TBD`

### 5. AI fix-PR acceptance rate

- **Definition:** Share of AI-generated fix pull requests (from the autonomous
  worker / fix pipeline) that get merged. `acceptance = merged_fix_prs /
  opened_fix_prs`. Measures whether the AI fixes are actually trusted.
- **How it's measured:** Worker/pipeline records of opened vs merged fix PRs,
  optionally cross-referenced with the `crash_resolved` custom event emitted in
  the dashboard when a user marks a crash resolved off the back of a fix PR.
- **Target:** `TBD`

### 6. SDK adoption — installs to first event

- **Definition:** Conversion from SDK install to a project's first ingested
  event. Captures the onboarding funnel: did installing the SDK lead to data
  flowing? `adoption = projects_with_first_event / sdk_installs`.
- **How it's measured:** SDK install/registration signals against ingest
  first-event data (overlaps with Activation but framed as a funnel from the
  install step).
- **Target:** `TBD`

---

## Note on the in-app analytics module (privacy-respecting)

The dashboard's self-analytics module that powers the engagement KPIs is
**off by default** and **privacy-respecting**:

- **Off by default.** Nothing is sent unless `VITE_ANALYTICS_DOMAIN` is set at
  build time (with optional `VITE_ANALYTICS_HOST`, default `https://plausible.io`).
  When unset, every analytics call is a silent no-op.
- **Do Not Track respected.** When the browser signals DNT
  (`navigator.doNotTrack === '1'` and equivalents), the module sends nothing.
- **Zero PII.** Only event/page names and a **sanitized** path are transmitted.
  Dynamic id segments are collapsed — `/crashes/<fingerprint>` →
  `/crashes/:id`, `/sessions/<id>` → `/sessions/:id`, `/users/<id>` →
  `/users/:id` — and query strings are stripped entirely. No raw ids, no user
  identifiers, no query parameters ever leave the client.
- **Best-effort.** Analytics failures are swallowed and never surface as app
  errors.

Implementation: `packages/monitor/dashboard/app/src/shared/analytics`.
