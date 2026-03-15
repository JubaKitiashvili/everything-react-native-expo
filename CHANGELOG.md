# Changelog

All notable changes to ERNE are documented here.

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
