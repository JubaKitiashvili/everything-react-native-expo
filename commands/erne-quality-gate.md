---
name: erne-quality-gate
description: ERNE — Pre-merge quality checks using parallel code-reviewer and performance-profiler agents
---

# /erne-quality-gate — Pre-Merge Checks

You are executing the `/erne-quality-gate` command. Run **code-reviewer** and **performance-profiler** in parallel for comprehensive pre-merge validation.

## Parallel Execution

### Agent 1: code-reviewer — Code Quality

Run a full code review focused on merge readiness:

**Correctness:**
- Logic errors, edge cases
- TypeScript type safety (no `any` escapes)
- Error handling completeness

**Style & Conventions:**
- Follows project rules (check `.claude/rules/`)
- NativeWind usage is consistent
- Component structure matches patterns

**Security:**
- No secrets in code
- Input validation at boundaries
- Secure storage used for sensitive data

**Testing:**
- All new code has tests
- Tests actually test behavior (not implementation)
- Edge cases covered

### Agent 2: performance-profiler — Performance Checks

Run performance validation:

**Bundle Impact:**
```bash
# Compare bundle size before/after changes
npx react-native-bundle-visualizer
```

**Runtime Checks:**
- No unnecessary re-renders introduced
- Lists use `FlashList` with `estimatedItemSize`
- Images are optimized (expo-image with caching)
- Animations run on UI thread (worklets)

**Memory:**
- Event listeners and subscriptions cleaned up
- No circular references in state
- Large data sets paginated

## Gate Result

```
## Quality Gate Result: PASS / FAIL

### Code Review: PASS
- 0 Critical issues
- 1 Warning (TODO in checkout.tsx:45)
- 3 Suggestions

### Performance: PASS
- Bundle size: +12KB (within threshold)
- No new re-render issues detected
- Memory: No leaks detected

### Verdict: PASS ✓
Ready for merge. Address 1 warning in next iteration.
```

The gate produces a binary PASS/FAIL. FAIL if:
- Any critical code review issue
- Bundle size increase > 50KB without justification
- Performance regression detected
- Missing tests for new code paths
