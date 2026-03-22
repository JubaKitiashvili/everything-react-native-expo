---
name: erne-perf
description: ERNE — Performance profiling and optimization using the performance-profiler agent
---

# /erne-perf — Performance Profiling

You are executing the `/erne-perf` command. Use the **performance-profiler** agent to diagnose and fix performance issues.

## Diagnostic Areas

### 1. Rendering Performance (FPS)
- Check for unnecessary re-renders with React DevTools Profiler
- Identify components re-rendering without prop changes
- Look for missing `React.memo`, `useCallback`, `useMemo`
- Detect inline function/object creation in render

### 2. Time to Interactive (TTI)
- Analyze app startup sequence
- Check for heavy `useEffect` chains on mount
- Identify blocking operations on main thread
- Verify Hermes bytecode compilation

### 3. Bundle Size
- Run `npx react-native-bundle-visualizer`
- Identify large dependencies
- Check for unused imports and dead code
- Verify tree-shaking is working

### 4. Memory
- Check for listener/subscription cleanup in `useEffect`
- Identify large objects retained in closures
- Look for image caching issues
- Detect circular references

### 5. Animations
- Verify all animations use Reanimated (not Animated API)
- Check for JS thread bottlenecks in animation callbacks
- Identify layout thrashing during animations
- Measure actual FPS during animations

### 6. Hermes Engine
- Verify Hermes is enabled
- Check for unsupported JS features
- Profile with Hermes sampling profiler
- Analyze bytecode compilation output

## Output Format
```
## Performance Metrics
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| JS FPS | 45 | 60 | ⚠️ |
| UI FPS | 58 | 60 | ✅ |
| TTI | 3.2s | <2s | ❌ |
| Bundle | 8.2MB | <5MB | ❌ |

## Critical Issues
[Issues that must be fixed]

## Optimization Opportunities
[Improvements ranked by impact]
```

## Notes
- If agent-device is available, measure actual FPS on device
- Reference `rules/common/performance.md` for optimization patterns
- Profile on real devices, not simulator/emulator
