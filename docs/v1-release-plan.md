# ERNE v1.0.0 Release Plan

**Date:** 2026-03-23
**Current:** v0.10.23
**Target:** v1.0.0

---

## Phase 1: Critical Fixes (Today — before v1.0.0)

### 1.1 Verify session-start banner works
- [ ] Clean viani-app, init v0.10.23, restart Claude Code
- [ ] Confirm "ERNE v0.10.23 | standard | 13 agents" banner appears
- [ ] If not — debug and fix

### 1.2 Add `erne uninstall` command
- [ ] Create `lib/uninstall.js` — removes .claude/agents, .claude/skills, .claude/rules, .claude/hooks, .claude/hooks.json, .claude/contexts, .claude/settings.json, .claude/hooks/scripts/, .mcp.json, .erne/, erne-docs/
- [ ] Restore CLAUDE.md.pre-erne if exists
- [ ] Add to bin/cli.js
- [ ] Add to help text

### 1.3 Fix `erne update` to refresh hook scripts
- [ ] Read lib/update.js
- [ ] After version update, re-copy scripts/hooks/ to .claude/hooks/scripts/
- [ ] Re-generate hooks.json with new profile
- [ ] Print what was updated

### 1.4 Remove dashboard dependency on better-sqlite3
- [ ] Analyze dashboard/server.js — what uses better-sqlite3?
- [ ] If only context-mem features — make sqlite optional, dashboard works without it
- [ ] Dashboard should start with just `ws` dependency (lightweight)
- [ ] If sqlite needed for activity history — use JSON file instead

### 1.5 Fix dashboard auto-start from session-start hook
- [ ] After 1.4 (lightweight dashboard), hook can start dashboard since no native deps needed
- [ ] Or: create a simple dashboard start script that's copied locally alongside hooks

### 1.6 Validate all hooks work in real project
- [ ] Install ERNE in viani-app
- [ ] Edit a .tsx file — do post-edit hooks fire? (format, typecheck, console-log check)
- [ ] Create a git commit — does pre-commit-lint fire?
- [ ] Exit session — does evaluate-session fire?

### 1.7 Test all /erne-* skills work
- [ ] After restart, type /erne- and Tab — do all 22 skills appear?
- [ ] Run /erne-plan with a real task
- [ ] Run /erne-perf on a real screen
- [ ] Run /erne-doctor
- [ ] Run /erne-code-review on a real file

---

## Phase 2: Quality & Polish (Today)

### 2.1 Update README.md
- [ ] Rewrite to reflect v1.0.0 features:
  - 13 agents, 22 skills, 19 hooks
  - Worker mode (5 providers, 5 quality gates)
  - 14 audit scanners + documentation generator
  - Smart agent routing (no commands needed)
  - Visual debugging (screenshot → fix)
  - Dashboard (6 tabs, pixel-art office)
- [ ] Add installation section: `npx erne-universal init`
- [ ] Add quick start: what to do after install
- [ ] Comparison table (vs competitors)
- [ ] Screenshots of dashboard

### 2.2 Update package.json metadata
- [ ] description — reflects v1.0.0
- [ ] keywords — add worker, autonomous, visual-debugging, documentation-generator

### 2.3 Update .claude-plugin/plugin.json
- [ ] version to 1.0.0
- [ ] description updated
- [ ] command count: 22
- [ ] agent count: 13

### 2.4 Update install.sh version
- [ ] ERNE_VERSION to 1.0.0

### 2.5 Write CHANGELOG for v1.0.0
- [ ] Comprehensive changelog combining v0.9.0 and v0.10.x changes
- [ ] Highlight: worker mode, visual debugging, smart routing, dashboard redesign

### 2.6 Final deep scan
- [ ] Run code-reviewer on entire codebase
- [ ] Fix any critical/important issues found
- [ ] npm test — 583/0

---

## Phase 3: v1.0.0 Release (Today evening)

### 3.1 Version bump
- [ ] npm version major (0.10.23 → 1.0.0)
- [ ] Update all version references

### 3.2 Git tag
- [ ] git tag v1.0.0
- [ ] git push --tags

### 3.3 npm publish
- [ ] npm publish
- [ ] Verify: npx erne-universal@1.0.0 init works

### 3.4 GitHub release
- [ ] Create GitHub release with changelog
- [ ] Attach dashboard screenshots

---

## Phase 4: Marketing (Monday — March 24)

### 4.1 Update marketing drafts
- [ ] Refresh erne-ops/docs/marketing/drafts-v2/ with v1.0.0 features
- [ ] Update dates
- [ ] Add worker mode, visual debugging, 13 agents messaging

### 4.2 Day 1: Reddit + Directory submissions
- [ ] r/reactnative, r/expo, r/ClaudeAI
- [ ] Directory submissions

### 4.3 Day 2: Discord communities
- [ ] Expo Discord, Reactiflux

### 4.4 Day 3: Hacker News + Blog post
- [ ] HN submission
- [ ] Hashnode/Dev.to article

### 4.5 Day 4-7: LinkedIn, X, Product Hunt
- [ ] LinkedIn launch post
- [ ] X thread
- [ ] Product Hunt (day 6)

---

## Phase 5: Post-Launch (Week of March 24-30)

### 5.1 Real-world skill testing
- [ ] Use skill-creator eval system on top 5 skills
- [ ] Optimize skill descriptions for better triggering

### 5.2 Worker mode real testing
- [ ] Test with GitHub Issues provider on a real repo
- [ ] Test confidence scoring, self-review, test verification

### 5.3 Dashboard polish
- [ ] Fix visual bugs
- [ ] Ensure all 6 tabs show correct data
- [ ] Pixel-art office refinement

### 5.4 Community feedback
- [ ] Monitor GitHub issues
- [ ] Monitor Reddit/Discord discussions
- [ ] Quick-fix reported bugs

### 5.5 erne audit documentation generation
- [ ] Test documentation-generator agent with real audit-data.json
- [ ] Verify all 13 doc files generate correctly

### 5.6 Unified task manager
- [ ] Dashboard local tasks (from spec)
- [ ] Photo upload
- [ ] Unified provider

### 5.7 Self-improving system
- [ ] Brainstorm and design
