---
name: retrospective
description: Session analysis — runs evaluate-session.js to review work quality and suggest improvements
---

# /retrospective — Session Analysis

You are executing the `/retrospective` command. This is **script-driven** — it runs the session evaluation pipeline.

## What This Does

Analyzes the completed coding session to evaluate quality, identify improvements, and suggest harness enhancements.

## Process

1. **Run the evaluation script:**

```bash
node .claude/hooks/scripts/evaluate-session.js
```

This script analyzes:
- Files created/modified during the session
- Test results and coverage changes
- Build success/failure history
- Hook trigger patterns (which rules fired, which were ignored)
- Time spent in different phases (planning, coding, testing, debugging)

2. **Generate session report:**

```
## Session Retrospective

### Work Summary
- Files changed: 12
- Tests added: 8
- Tests passing: 47/47
- Build status: Success

### Quality Metrics
- Type safety: 100% (no new `any`)
- Test coverage delta: +3.2%
- Bundle size delta: +8KB

### Patterns Observed
- [GOOD] Consistent use of error boundaries
- [GOOD] All new components have tests
- [IMPROVE] 3 files missing JSDoc on public API
- [IMPROVE] 2 effects missing cleanup

### Harness Feedback
- Rule `common/state-management.md` triggered 5 times → Well calibrated
- Rule `expo/patterns.md` never triggered → May need broader globs
- Hook `lint-staged.cjs` caught 2 issues → Working as intended
- Suggestion: Add rule for consistent error message format

### Recommendations
1. Add error message formatting rule
2. Review expo/patterns.md glob coverage
3. Consider adding pre-commit test hook
```

3. **Act on recommendations:**
Review each recommendation and decide whether to implement it now or add to backlog.

## When to Use
- At the end of a significant coding session
- After completing a feature or milestone
- When the harness feels miscalibrated (too many or too few rule triggers)
- Periodically for continuous improvement
