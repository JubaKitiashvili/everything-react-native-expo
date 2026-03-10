---
name: performance-optimization
description: Step-by-step performance diagnosis and optimization for React Native apps
---

# Performance Optimization

You are performing a systematic performance diagnosis on a React Native application. Follow this step-by-step process.

## When to Use This Skill

Invoke when:
- App feels slow or janky
- Startup time is too long
- Lists scroll poorly
- Animations stutter
- Bundle size is too large
- Memory usage is high

## Diagnostic Process

### Step 1: Identify the Problem

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| Slow startup | Large bundle, heavy init | Bundle size, eager imports |
| Janky scrolling | List renderer, heavy cells | FlatList vs FlashList, cell complexity |
| Stuttering animations | JS thread blocking | Worklets, `useAnimatedStyle` |
| High memory | Leaks, large images | Image caching, subscription cleanup |
| Slow navigation | Heavy screens, eager loading | Lazy loading, screen weight |

### Step 2: Measure

**Bundle Analysis:**
```bash
npx react-native-bundle-visualizer
# or for Expo:
npx expo export --dump-sourcemap
```

Target: < 1.5MB JavaScript bundle

**FPS Monitoring:**
- Enable Perf Monitor in dev menu
- Or use `useFrameCallback` from Reanimated
- Target: 60fps constant, no drops below 55fps

**TTI (Time to Interactive):**
- Measure from app launch to first interactive frame
- Target: < 2 seconds on mid-range device

**Memory:**
- Use Xcode Instruments (iOS) or Android Profiler
- Watch for monotonically increasing memory (leak indicator)

### Step 3: Optimize by Category

**Bundle Size:**
1. Analyze imports — find large dependencies
2. Lazy load screens: `React.lazy()` with `Suspense`
3. Tree-shake unused exports
4. Replace large libraries with lighter alternatives
5. Use Hermes (enabled by default in Expo SDK 50+)

**Rendering:**
1. Replace `FlatList` with `FlashList` + `estimatedItemSize`
2. Memoize expensive components: `React.memo`
3. Use `useCallback` for event handlers passed to children
4. Avoid inline object/array creation in JSX
5. Profile re-renders with React DevTools Profiler

**Animations:**
1. Move all animations to UI thread (Reanimated worklets)
2. Use `useAnimatedStyle` instead of inline animated values
3. Batch related animations with `withSequence`/`withDelay`
4. Reduce animated property count (transform is cheaper than layout)
5. Use `cancelAnimation` for cleanup

**Images:**
1. Use `expo-image` with `cachePolicy="memory-disk"`
2. Serve correct sizes (don't scale 4K images to thumbnails)
3. Use WebP format for smaller file sizes
4. Implement progressive loading (blurhash placeholder)

**Memory:**
1. Clean up listeners in `useEffect` return
2. Remove event subscriptions on unmount
3. Use WeakRef for caches where appropriate
4. Paginate large data sets (don't load all at once)

### Step 4: Verify Improvements

Re-measure after each optimization:
```
## Performance Report

| Metric | Before | After | Target | Status |
|--------|--------|-------|--------|--------|
| Bundle size | 2.1MB | 1.4MB | <1.5MB | PASS |
| TTI | 3.2s | 1.8s | <2s | PASS |
| List FPS | 45fps | 60fps | 60fps | PASS |
| Memory (5min) | +80MB | +12MB | <20MB | PASS |
```
