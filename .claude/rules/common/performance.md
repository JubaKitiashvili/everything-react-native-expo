---
description: React Native performance optimization rules (RN 0.84+, Expo SDK 54+, New Architecture)
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Performance

## Rendering

- **React Compiler** is enabled by default in Expo SDK 54+ templates — it auto-memoizes, so manual `React.memo`/`useMemo`/`useCallback` is often unnecessary
- If not using React Compiler: use `React.memo` on list items and stable-prop components
- Wrap callbacks with `useCallback` when passed to memoized children (without React Compiler)
- Use `useMemo` for expensive computations (sorting, filtering large arrays)
- Never define functions or objects inline in JSX within loops/lists

```tsx
// With React Compiler — no manual memoization needed
const renderItem = ({ item }: { item: User }) => <UserRow user={item} onPress={handlePress} />;

// Without React Compiler — manual memoization
const renderItem = useCallback(
  ({ item }: { item: User }) => <UserRow user={item} onPress={handlePress} />,
  [handlePress],
);
```

## Lists (FlatList Optimization)

- `FlatList` for lists > 20 items (never ScrollView)
- Set `keyExtractor` with stable, unique keys — never use array index
- Use `getItemLayout` when item heights are fixed (avoids measurement passes)
- Configure `windowSize` (default 21, lower for memory savings, higher for fewer blanks)
- Set `maxToRenderPerBatch` (default 10) for initial render control
- Set `initialNumToRender` to fill first screen only
- `removeClippedSubviews={true}` for long lists on Android
- Use `onEndReachedThreshold` (0.5) with `onEndReached` for pagination

```tsx
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={keyExtractor}
  getItemLayout={(data, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
  windowSize={11}
  maxToRenderPerBatch={10}
  initialNumToRender={10}
  removeClippedSubviews={true}
  onEndReachedThreshold={0.5}
  onEndReached={loadMore}
/>
```

## Images

- Use React Native `Image` component with proper sizing
- Set explicit `width` and `height` (avoid layout shifts)
- Use `resizeMode="cover"` for consistent display
- Optimize source images: **WebP preferred, HEIC/HEIF supported on RN 0.84+**
- Prefetch images: `Image.prefetch(url)` for known upcoming images
- Use `fadeDuration={0}` on Android to avoid flicker for cached images

```tsx
import { Image } from 'react-native';

<Image
  source={{ uri: imageUrl }}
  style={{ width: 200, height: 200 }}
  resizeMode="cover"
  fadeDuration={0}
/>;
```

## Bundle Size

- Import specific modules, not entire packages (`lodash/get` not `lodash`)
- Use `React.lazy` + `Suspense` for code splitting heavy screens
- Analyze bundle with **Expo Atlas** (stable since SDK 53): `npx expo export --dump-assetmap`
- Target < 5MB JS bundle for production

## Animations

- Use `react-native-reanimated` v4 for all animations (not Animated API)
- **Reanimated v4 requires New Architecture** (mandatory since RN 0.82)
- Reanimated v4 introduces `react-native-worklets` as a separate package
- Run animations on UI thread via worklets
- Never read shared values from JS thread in hot paths
- Use `useAnimatedStyle` instead of inline animated styles

## Startup

- **Hermes V1** is the default engine since RN 0.84 — automatic perf gains (7-9% faster TTI)
- No manual Hermes configuration needed — it's always on
- Inline requires for heavy modules (`require('heavy-lib')` inside function)
- Minimize `useEffect` chains on app startup
- Defer non-critical initialization with `InteractionManager.runAfterInteractions`
- **Precompiled iOS builds** are default since RN 0.84 (up to 10x faster clean builds)
- Android `debugOptimized` build variant available since RN 0.82 (~60 FPS in debug)

## Web Performance APIs (RN 0.83+)

- `performance.now()`, `performance.timeOrigin` available natively
- `PerformanceObserver`, `performance.mark()`, `performance.measure()` for profiling
- Event Timing API and Long Tasks API for jank detection
