# Task 117.1 — Dashboard Rewrite — Decision Record + Execution Plan

> Persistent plan for the keystone dashboard rewrite. Read this before
> touching the dashboard. It records **why** we chose `dashboard-next`
> (not in-place) and **exactly** what must be built, in what order.
>
> Status: **PLANNED — not started.** Owner: lead + parallel page agents.
> Created 2026-05-26 (planning session). Canonical task row: `TRACKER.md` 117.1.

---

## 1. The decision (locked)

**Rewrite into a NEW sibling app directory `packages/monitor/dashboard/next/`** — NOT
in-place inside `dashboard/app/`, and NOT a new published npm package.

### Why (in priority order)

1. **"Rewrite, not migrate" is a LOCKED decision in the spec.**
   `PHASE-7-IMPLEMENTATION.md` → Locked-In Decisions table:
   *"Dashboard: 7 purpose-built pages (rewrite, not migrate) — rejected:
   19-panel flat page as one route — iteration 2 found flat page is not
   product-grade."* A clean directory structurally enforces "not migrate";
   editing `app/` in place tempts preserving the flat-page assumptions
   (no auth, single tenant, panel-as-section).

2. **The dashboard is a live OSS product surface** (`npx @erne/monitor
   dashboard`). This is an XL (~3 week) rebuild. A new dir lets the
   current dashboard keep serving throughout; cutover is a reversible
   one-line serve-path flip (see §4). In-place would leave the product
   half-broken for weeks.

3. **The end-state needs a foundation laid clean from line 1:**
   - 117.18 Multi-tenant RBAC (Owner/Member/Viewer, JWT) → an auth +
     tenant-context shell the flat app never had.
   - 117.9 WebLLM (browser WASM/WebGPU) → route-level code-splitting.
   - Growth from 7 top-level pages to ~15 sub-pages across M2/M3.
   Retrofitting auth/tenancy/code-splitting onto the flat structure is
   harder and riskier than starting right.

### Why NOT in-place (the rejected option + why its merits don't hold)

- "In-place preserves the good `shared/` layer" — **false economy.**
  Preservation = *relocation* of `shared/` into `next/`, not
  keep-it-where-it-sits. We lose nothing.
- "Second package doubles build/deps" — it's a new *build directory*,
  not a published package. It builds to the same `public/`. Cost is
  small (shared Vite patterns).
- OSS == Cloud (Locked decision: "all features OSS; Cloud = managed
  hosting only; rejected feature-gated tiers"). So there is exactly
  ONE dashboard app — Cloud is the same app, hosted. This *removes* a
  "dual-app" argument for splitting, but reasons 1–3 stand on their own.

### Evidence from dogfooding the current dashboard (2026-05-26)

Booted the seeded server (`e2e/fixtures/start-server.mjs`) and inspected
the live current dashboard in a headless browser:

- Page height **7855px**, **51** stacked `<section>`/panel nodes, one flat
  scroll. `document.querySelectorAll('a[href^="/"]').length` = **0** — no
  client routing exists at all. The 3 `<nav>` elements are intra-panel
  tabs, not app navigation.
- KPI tiles render "—" (nothing focuses them); every panel renders at once.
- **The panels themselves are production-grade** (Live feed with severity
  pills + search, Device Switcher cards, polished dark theme). The problem
  is purely **IA / architecture**, not component quality.

**Conclusion the evidence forces:** this is a *shell + routing + composition*
rewrite, not a visual redesign. The good parts (UI kit, panel components,
data hooks, WS client) move into `next/` as-is; what's new is the router,
the `AppShell`, per-page WS multiplexing, the 7-page IA, and the
auth/tenant-ready shell.

---

## 2. Current state (what we're rewriting from)

`packages/monitor/dashboard/app/` — Vite + React 19 + TanStack Query + Zustand.

- `src/App.tsx` — single flat page rendering all **19 panels** stacked.
  No router (`react-router` not even a dependency; only referenced in
  comments in the ANR panels, which were pre-built router-ready).
- `src/main.tsx` — mounts `QueryClientProvider` + `ApiProvider` + `<App/>`.
- `src/panels/` — 19 panels: AIInsights, AlertsConsole, ANRInspector
  (already split List+Detail), BreadcrumbTimeline, BugReportsInbox,
  ConsentPrivacy, CrashExplorer, DeviceSwitcher, DORA, Frustration,
  LiveFeed, NetworkWaterfall, Onboarding, PatternLibrary, Performance,
  ReplayMasker, SessionReplay, Settings, Symbolication.
- `src/shared/` — the reusable layer (KEEP, relocate):
  - `realtime/` — `RealtimeClient` (singleton WS, backoff/reconnect) +
    `useRealtime` (opens one socket for App lifetime).
  - `store/uiStore.ts` — zustand (realtime status, etc.).
  - `api/` — `client`, `ApiProvider`/context, `types`, `useApi`.
  - `hooks/` — `queryKeys` + `useEvents/useCrashGroups/useSessions/
    useAlerts/useAlertHistory/useBugReports`.
  - `ui/` — Tile, Sparkline, Panel, FilterBar, EventRow, HistogramCDF,
    Pill, StackFrame, Timestamp.
  - `tokens.ts` / `tokens.css` — design tokens.
- Tests: ~247 vitest unit + **17 Playwright e2e** (`e2e/specs/01..17`,
  one per panel, asserting against the flat scroll page).
- Build: `vite.config.ts` `outDir = ../public`. Server serves `public/`
  by default (`defaultPublicDir`) or via the `publicDir` option.

---

## 3. Target architecture (`dashboard-next`)

```
packages/monitor/dashboard/next/
  index.html
  vite.config.ts                 # dev → next/dist; CUTOVER → ../public
  package.json                   # mirrors app/ deps + react-router-dom@7
  src/
    main.tsx                     # RouterProvider + Query + Api + Realtime providers
    app/
      AppShell.tsx               # layout route: sidebar + header + <Outlet/>
      Sidebar.tsx                # 7 nav items, active highlight (NavLink)
      routes.tsx                 # route table  ← LEAD OWNS THIS (shared file)
    realtime/
      RealtimeProvider.tsx       # ONE app-level RealtimeClient + subscriber registry
      useRealtimeChannel.ts      # per-page subscribe; UNSUB on unmount (no leak)
    shared/                      # RELOCATED from app/src/shared (canonical home)
    pages/
      overview/    crashes/    anrs/    performance/
      sessions/    quality/    settings/
        # each: index page + components/ (lifted panels) + page.test.tsx
```

### WS multiplexing (the gate's hardest requirement)

Requirement: *"WS multiplexing per page doesn't leak on route change."*

**Design:** keep exactly **one** `RealtimeClient` at the router root inside
`RealtimeProvider` (no socket churn on navigation — the server also gates
`/ws/subscribe`). The provider owns the socket + a **subscriber registry**.
Pages call `useRealtimeChannel(filter, handler)`, which registers a listener
on mount and **unregisters on unmount**. Route change → page unmounts →
listeners torn down (no leak), socket stays warm. This is the no-leak design
and avoids reconnect thrash.

### Why not a separate `dashboard-core` package
YAGNI. After cutover there is one consumer (`next/`). During the overlap
window the old `app/` keeps its own copy of `shared/`; no cross-package
dependency, no premature extraction. Revisit only if a third consumer
(e.g. a separate Cloud shell) ever appears — current Locked decision says
Cloud == same app, so it won't.

---

## 4. Cutover mechanism (verified)

- Today: `app/` vite `outDir = ../public`; server serves `dashboard/public/`.
- During build-out: `next/` builds to its own `next/dist`; point the server
  at it for testing via the `publicDir` option (or `ERNE`-side config).
- **Cutover (Phase 5):** change `next/`'s vite `outDir` to `../public`
  (and stop building `app/`). One-line, reversible. Then delete `app/`.

---

## 5. The 7-page IA + panel → page mapping

| Route | Page | Panels lifted in | Future M2/M3 slots |
|---|---|---|---|
| `/` | **Overview** | KPI tiles, LiveFeed, AIInsights (summary), DORA | — |
| `/crashes` · `/crashes/:fp` | **Crashes** | CrashExplorer, Symbolication, BreadcrumbTimeline | common-frames (117.83 ✅), AI fix link (117.6 ✅) |
| `/anrs` · `/anrs/:id` | **ANRs** | ANRInspector (List+Detail already built) | — |
| `/performance` | **Performance** | Performance, NetworkWaterfall, HistogramCDF | flamegraph 117.8, suspense 117.25, RSC 117.26 |
| `/sessions` · `/sessions/:id` | **Sessions** | SessionReplay, DeviceSwitcher | session replay 117.7, user view 117.15, journeys 117.12, traces 117.13 |
| `/quality` | **Quality** | AlertsConsole, BugReportsInbox, Frustration, PatternLibrary | frustration depth 117.23 ✅, bidirectional bugs 117.20 |
| `/settings` | **Settings** | Settings, ConsentPrivacy, ReplayMasker, Symbolication (upload), Onboarding | RBAC/tenant settings 117.18, remote config 117.17 |

Every future page-task slots cleanly into one of these 7.

---

## 6. Build sequence

**Phase 1 — solo (the shared scaffold). Must be serial; everything depends on it.**
- Scaffold `next/` (Vite + React 19 + react-router-dom 7).
- `AppShell` (sidebar + header + `<Outlet/>`), `Sidebar` with active highlight.
- `routes.tsx` (lead-owned).
- `RealtimeProvider` + `useRealtimeChannel` (the no-leak WS layer).
- Relocate `shared/` into `next/src/shared`.
- Build the **Overview** page (KPI tiles + LiveFeed) end-to-end.
- `app/` stays production-canonical (still builds to `public/`); `next`
  builds to `next/dist`. Verify green (vitest + a smoke e2e).

**Phases 2–4 — parallel agents, one per page, DISJOINT `pages/<x>/` dirs.**
- Crashes · ANRs · Performance · Sessions · Quality · Settings.
- Each agent: lift its panels into `pages/<x>/components/`, build the page +
  `:id`/`:fp` detail routes, wire `useRealtimeChannel`, migrate that panel's
  unit tests. **Lead owns `routes.tsx` + `Sidebar.tsx`** (the only shared
  files) and registers each page as it lands — same disjoint-tree discipline
  that produced 0 collisions across the 31 tasks in waves 1–4.

**Phase 5 — cutover.**
- Flip `next` vite `outDir` → `../public`; stop building `app/`.
- Migrate all 17 Playwright specs from flat-scroll to route navigation
  (`page.goto('/crashes')` etc.); add new specs: routing resolves,
  sidebar active state, **WS-no-leak on route change**.
- Delete `app/`.

---

## 7. Acceptance criteria (from spec promotion gate)

- [ ] 7 pages each route resolves; `<BrowserRouter>` works (incl. deep-link
      refresh on `/crashes/:fp` — server SPA-fallback already serves
      `index.html` for unknown paths; verify).
- [ ] Sidebar nav with active-route highlight.
- [ ] WS multiplexing per page does **not** leak listeners on route change
      (test: navigate N times, assert subscriber count returns to baseline).
- [ ] All existing Phase 6 tests migrated (unit + e2e), green.
- [ ] `app/` deleted; `next/` is the canonical `public/` producer.

---

## 8. Risks

- **R1 (spec, HIGH, 60%):** rewrite slips beyond its window. Mitigation:
  Phase 1 ships a complete shippable Overview first; pages fill in
  incrementally; accept "5 pages now, +2 later" descope if slow. Old `app/`
  keeps serving until parity, so a slip never breaks the live product.
- **Test-migration drag:** 17 e2e specs assume the flat page. Budget Phase 5
  for rewriting them to routes; this is the bulk of the e2e work.
- **Shared relocation churn:** moving `shared/` updates many import paths.
  Do it once in Phase 1, before pages branch into parallel agents.

---

## 9. Open sub-decisions (current recommendations)

- **IA grouping:** the 7 pages above (recommended as-is). Alt: merge ANRs→
  Performance (6 pages), or split Quality→Alerts+Bugs (8). Not yet locked.
- **Cadence:** Phase 1 solo now, then parallel page agents (recommended).
