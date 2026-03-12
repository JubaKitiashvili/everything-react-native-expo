# Changelog

All notable changes to ERNE are documented here.

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
