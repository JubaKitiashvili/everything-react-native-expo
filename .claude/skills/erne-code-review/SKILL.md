---
name: erne-code-review
description: ERNE — Comprehensive code review combining code quality and performance analysis
---

# /erne-code-review — Full Code Review

You are executing the `/erne-code-review` command. Run **code-reviewer** and **performance-profiler** agents in parallel for comprehensive review.

## Parallel Execution

Launch both agents simultaneously:

### Agent 1: code-reviewer
Review the specified code for:
1. **Re-render issues** — Unnecessary renders, missing memoization, unstable references
2. **React Native anti-patterns** — Direct style mutations, ScrollView for long lists, Animated API usage
3. **Platform parity** — iOS/Android behavioral differences, platform-specific bugs
4. **Expo SDK validation** — Correct module usage, deprecated APIs, config issues
5. **Accessibility** — Missing labels, touch target sizes, screen reader support
6. **Security** — Hardcoded secrets, insecure storage, unvalidated deep links

### Agent 2: performance-profiler
Analyze for performance issues:
1. **Rendering** — Component render counts, unnecessary re-renders
2. **Bundle size** — Large imports, tree-shaking opportunities
3. **Memory** — Listener cleanup, large object retention
4. **Animations** — JS thread animations, Reanimated opportunities

## Output Format

Combine results from both agents, grouped by severity:

```
## Critical (must fix before merge)
[Issues from both agents]

## Warnings (should fix)
[Issues from both agents]

## Suggestions (nice to have)
[Issues from both agents]

## Positive Observations
[Good patterns found]
```

## Notes
- If agent-device is available, take screenshots to verify UI rendering
- Apply rules from `rules/common/` and active platform layer
- Flag any violations of project rules
