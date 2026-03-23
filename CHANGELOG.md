# Changelog

All notable changes to ERNE are documented here.

## [0.12.0] - 2026-03-24

### Added

- **`/erne-debug-video` — Video-Based Visual Debugging** — first-of-its-kind: extract key frames from screen recordings (mp4, mov, webm, avi, mkv, gif) and analyze temporal UI bugs that screenshots cannot capture. Detects animation glitches, race conditions, gesture issues, scroll jank, keyboard overlap, navigation transitions
- **29 Knowledge Rules** — comprehensive Expo/RN knowledge base covering SDK 55, RN 0.84, React 19.2, 40+ expo packages, and 15 third-party libraries (Reanimated v4, Gesture Handler, Skia, SVG, Screens, ExecuTorch, Callstack AI, Bottom Tabs, Pager View, RNTL, Reassure, Audio API, Enriched, Freeze, Voltra)
- **Adaptive Issue Fix** — auto-detects Claude Code availability: agent-based fix (routes to correct ERNE agent + post-verify) or direct npm command + TypeScript check. Complex issues show "Needs planning" with /erne-plan prompt
- **Agent Knowledge Mapping** — all 12 agents have Required Knowledge sections pointing to specific rules files
- **Auto-Updating Knowledge** — GitHub Action (weekly cron) checks npm for new Expo SDK / RN versions, uses Claude API to update rules, opens PR automatically
- **Worker PR Creation** — worker pipeline now pushes branch and creates PR via `gh pr create` with full summary (confidence score, test status, health delta, ticket link)
- **Local Provider** — JSON file-based ticket provider for testing worker without external services
- **Provider Setup Guides** — interactive setup instructions for all 6 providers (ClickUp, GitHub, Linear, Jira, GitLab, Local) in dashboard Worker tab
- **Auto-Generate Docs** — "Run Audit" now generates markdown reports (audit-report, stack-detection, dependency-report, dead-code, todos, type-coverage, architecture, changelog) from audit-data.json
- **Docs Status API** — GET /api/docs/status scans erne-docs/ filesystem for generated file status
- **MCP Health Check** — MCP servers show installed/configured/not-found status instead of always "unknown"
- **Settings Profile Persistence** — hook profile changes persist to .claude/settings.local.json via PUT /api/settings/profile
- **context7 Documentation Verification** — CLAUDE.md rule instructs agents to verify API usage against current docs when context7 MCP is available

### Fixed

- WebSocket dev port no longer hardcoded to 3333 (uses window.location.host)
- 148 lines of dead code removed from Project.tsx
- Insights page shows error messages when API endpoints fail
- Pixel art office correctly updates agent status via updateAgentState(name, status) + 2s polling
- Agent status updates in real-time via WebSocket agent_update messages
- Fix output persists across page switches (app-level state)
- Auto re-run audit after every fix (success or fail)
- Verify output shows which tests failed (not just "Tests failed")
- Complex issues (5+ files, refactoring) show "Needs planning" instead of "Agent Fix"
- ClickUp provider env var mismatch (CLICKUP_API_TOKEN → CLICKUP_API_KEY)
- Worker confidence threshold now configurable via config.erne.min_confidence (was hardcoded 30)
- Worker base branch configurable via config.repo.base_branch (was hardcoded main)
- Claude CLI stdin warning fixed (spawn with stdio: ['ignore'])
- URL matcher for /api/issues/\* endpoints
- TypeScript strict errors (5 fixes)
- Dashboard font sizes bumped for readability (Apple HIG)

### Changed

- Dashboard rebuilt with Vite + React 19 + Tailwind v4 (dashboard rewrite from v0.11.0)
- 18 Expo official skill patterns integrated (form sheets, NativeTabs, zoom transitions, context menus, SF Symbols, borderCurve, process.env.EXPO_OS, etc.)
- Expo Router rules updated to v6 with all new APIs
- All rules updated to Expo SDK 55, React Native 0.84, React 19.2

## [0.11.1] - 2026-03-23

### Fixed

- Dashboard works without better-sqlite3 (context features gracefully disabled)
- Dashboard auto-starts from session-start hook

## [0.11.0] - 2026-03-23

### Added

- **Dashboard Rewrite** — Vite + React 19 + Tailwind v4, pre-built to static files
- 8-page layout: Command Center, Issues, Tasks, Agents, Project, Insights, Settings, Commands
- Interactive issue fixing with WebSocket streaming
- Kanban task board with local + worker task sources
- Agent management with custom naming
- MCP server catalog with install/remove

## [0.10.0] - 2026-03-21

### Added

- **`erne worker` — Autonomous Ticket Execution** — polling daemon that picks up tickets from Linear, GitHub Issues, ClickUp, Jira, GitLab, routes to ERNE's 13 agents, and executes in isolated git worktrees
- **5 Quality Gates** — ticket validation (rejects vague tickets), confidence scoring (0-100%), self-review (code-reviewer agent), test verification (runs project tests), health delta (before/after metrics in PR)
- **5 Ticket Providers** — GitHub Issues (label-based), Linear (GraphQL), ClickUp (REST v2), Jira Cloud (REST v3), GitLab (REST v4). All zero-dependency via Node 18+ fetch
- **`erne audit` Documentation Generator** — 14 sub-scanners producing audit-data.json: structure, dependencies, config, git history, routes, components, hooks, API layer, state management, screens, dead code, tech debt, type safety, dependency health
- **Audit diff mode** — `erne audit --diff` shows changes since last scan
- **Audit auto-refresh hook** — refreshes scan data on session stop if older than 24h
- **Dashboard audit widget** — `audit:complete` event + `/api/audit` endpoint
- **Dashboard worker events** — `worker:*` events + `/api/worker` endpoint
- **`/worker` command** — manage autonomous ticket execution

### Fixed

- Audit dashboard event type corrected (`audit-complete` → `audit:complete`)
- Validation counts updated for 13 agents and 21 commands

### Removed

- Context-mem hooks and tests (moved to standalone project)

## [0.9.0] - 2026-03-21

### Added

- **Visual Debugger agent** — 12th agent: screenshot-based UI analysis, interactive fixing, before/after verification via agent-device MCP (iOS + Android)
- **Documentation Generator agent** — 13th agent: reads audit scan data and generates 13 comprehensive markdown doc files with Mermaid diagrams
- **Smart Agent Routing** — CLAUDE.md routing table auto-dispatches 13 agents based on context signals without explicit commands
- **`/debug-visual` command** — explicit trigger for visual debugging with simulator screenshot capture
- **`erne audit` rewrite** — project documentation scanner with 14 sub-modules: structure, dependencies, config, git history, routes, components, hooks, API layer, state, screens, dead code, tech debt, type safety, dependency health
- **`erne audit --diff`** — shows changes since last audit scan
- **`erne doctor` enhancement** — merged audit checks + 12 new deep checks: New Architecture compatibility, bundle size breakdown, SDK upgrade readiness, circular dependency detection, permissions audit, deep link validation, Expo config conflicts, native module audit, startup time analysis, platform parity, linting & static analysis, enhanced testing
- **`erne doctor --fix`** — auto-fixes safe issues (.gitignore, TypeScript strict mode)
- **Onboarding Score** — 10-point project readiness assessment
- **Screen Blueprints** — per-screen X-ray (components, state, API, hooks, navigation, params)
- **Dead Code Detection** — finds unused exports across codebase
- **TODO/FIXME/HACK Tracker** — tech debt visibility
- **Type Safety Report** — `any` usage analysis with coverage percentage
- **Dependency Health Check** — npm publish recency, abandoned package detection
- **Dashboard audit widget** — audit:complete event handler + /api/audit endpoint
- **Audit auto-refresh hook** — refreshes scan data on session stop if older than 24h

### Changed

- `erne audit` is now a documentation scanner (was alias for doctor)
- Dashboard event hook recognizes all 13 agents including visual-debugger and pipeline-orchestrator
- Hook profiles updated: minimal (4), standard (14), strict (18)

### Removed

- Context-mem hooks and tests — moved to standalone project (context-mem)

## [0.8.0] - 2026-03-16

### Added

- **Content summarizer** — auto-detects 14 content types (markdown, HTML, JSON, test output, TypeScript errors, build output, logs, git history, CSV, network requests) and compresses to statistical summaries with 97–100% savings
- **Content store (Index+Search)** — FTS5 BM25-ranked retrieval with Porter stemming, markdown chunked by headings, code blocks never split or truncated — 80% savings with exact code preservation
- **Benchmark suite** — 21 real-world scenarios across Context7, Playwright, GitHub, vitest, tsc, next build, nginx, git, and analytics data. Full debugging session: 537 KB → 2.6 KB (99% savings)
- **Agent Preloader wiring** — `recordTransition()` now fires on agent:start events, `/api/context/predict` endpoint for querying next-agent predictions
- **Hook execution metrics** — `run-with-flags.js` reports hook name, profile, duration, and exit code to dashboard via `hook_execution` events
- **PostToolUse context tracking** — `event-tracker.js` now reports `context_bytes` for tool output savings measurement

### Changed

- README: Context Optimization section updated with benchmark-verified numbers (97–100% summarizer, 80% index+search, 99% full session)
- README: Token Efficiency runtime table updated with verified savings
- Smart truncation upgraded from 30–60% to 85–100% with 4-tier cascade (Structured → Pattern → Head/Tail → Hash)

## [0.7.0] - 2026-03-15

### Added

- **Multi-tab dashboard** — 4 tabs: HQ (pixel art), My App, Ecosystem, Insights
- **My App tab** — project overview, MCP integrations, project audit with FIX buttons, quick actions, recommendations, environment checks
- **Ecosystem tab** — live release feed for React Native packages with filters and stats
- **Insights tab** — KPI cards (audit score, outdated deps, agent tasks) with agent utilization chart
- **Context sidebar** — 6 collapsible panels: System Info, Project Audit, Agent Activity, Context Savings, Knowledge Base, Context Budget
- **Context optimization system** — 4-tier smart truncation (JSON → pattern → head/tail), 30–60% output compression
- **Knowledge base** — SQLite-backed with FTS5 full-text search, trigram fuzzy matching, and Levenshtein fallback
- **Session continuity** — automatic snapshot/restore across sessions (<2KB per snapshot)
- **Budget manager** — per-session and per-agent token limits with 3 overflow strategies (truncate / warn / stop)
- **Agent preloader** — transition tracking and next-agent prediction for parallel context warmup
- **Error→Fix correlation** — tracks errors and correlating file modifications to build fix patterns
- **Context auto-enable** — context system starts automatically with dashboard (no `--context` flag needed)
- **Enable context from UI** — "Enable Context" button in sidebar when context is disabled
- **Nav bar** — ERNE branding, tab icons, real-time connection status, working/total agents, session timer
- **`senior-developer` and `feature-builder` agents** — for parallel implementation workflows

### Fixed

- Sidebar scroll not working when all panels expanded (removed flex layout causing panel compression)
- Collapsible panels firing multiple times (MutationObserver disconnect)
- Audit panel destroying collapsible wrapper on re-render
- Context API returning 503 errors when context disabled (now returns 200 with error message)
- Empty sidebar panels taking space when context disabled

## [0.6.0] - 2026-03-12

### Added

- **Pipeline orchestrator** — 11th agent for multi-agent workflow coordination
- **`/orchestrate` command** — 5-phase pipeline: Plan → Implement → Test → Review → Validate
- **Memory integration** — all 11 agents have cross-session learning via MCP tagging
- **Agent personalities** — Identity, Communication Style, Success Metrics for all agents and variants
- **`/code`, `/feature` commands** — focused development workflows
- **`/learn`, `/retrospective`, `/setup-device` commands** — learning and device setup
- **`erne sync-configs`** — syncs CLAUDE.md to .cursorrules, .windsurfrules, AGENTS.md, GEMINI.md
- **`scripts/lint-agents.js`** — validates agent frontmatter and required sections
- **Handoff templates** — Standard, QA PASS, QA FAIL, Escalation for agent-to-agent context
- **Pipeline documentation** — phases, retry logic, escalation rules
- **4 workflow examples** — new feature, upgrade, new screen, bug fix runbook
- **CONTRIBUTING.md** — full contributor guide
- **ESLint 9 + Prettier** configuration
- **CI pipeline** — GitHub Actions with Node 18+20 matrix

### Fixed

- **Variant path bug** — rule and agent variants now correctly resolve from `rules/variants/` and `agents/variants/`
- Dashboard shell injection vulnerability (switched to `execFileSync`)
- 6 critical bugs in dashboard, hooks, and dead imports
- CI timeout in pre-edit-test-gate test
- Merged `performance-budget.js` into `bundle-size-check.js`

### Changed

- Agents: 10 → 11 (added pipeline-orchestrator)
- Commands: 16 → 19 (added /orchestrate, /code, /feature)
- Hook profiles: minimal 4, standard 12, strict 16 (was 17)
- Dashboard: added pipeline-orchestrator with orange sprite and baton trait

## [0.5.1] - 2026-03-12

### Fixed

- Comprehensive audit: 6 critical bugs, content fixes, dashboard hardening
- Dashboard: 5-column grid for agent panel layout

## [0.5.0] - 2026-03-11

### Added

- **Adaptive init system** — deep-scans 15 stack dimensions, selects from 24 variant templates
- **Stack detection** — state management, navigation, styling, lists, images, forms, storage, testing, build system
- **CLAUDE.md 3-scenario handling** — create new, merge into existing, or update ERNE-managed blocks
- Integration tests for adaptive init across project types

## [0.4.0] - 2026-03-11

### Added

- Demo video and mobile responsive dashboard
- Agent walking animations and conference room brainstorming

## [0.3.0] - 2026-03-11

### Added

- **Agent Dashboard** — pixel-art canvas with 4 office rooms
- Agent detail panel and activity history
- Thought bubbles, room glow, whiteboard, stats bar, toast notifications
- Office decorations, short names, animated screens
- WebSocket real-time updates with auto-reconnect
