---
description: React Native performance optimization rules — legacy (FlatList, RN Image)
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Performance

## Rendering
- Use `React.memo` on components rendered in lists or receiving stable props
- Wrap callbacks with `useCallback` when passed to memoized children
- Use `useMemo` for expensive computations (sorting, filtering large arrays)
- Never define functions or objects inline in JSX within loops/lists

```tsx
// GOOD
const renderItem = useCallback(({ item }: { item: User }) => (
  <UserRow user={item} onPress={handlePress} />
), [handlePress]);

// BAD — creates new object every render
<FlatList renderItem={({ item }) => <UserRow user={item} />} />
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

## Images (React Native Image)
- Use React Native `Image` component with proper sizing
- Set explicit `width` and `height` (avoid layout shifts)
- Use `resizeMode="cover"` for consistent display
- Optimize source images (WebP format, appropriate resolution)
- Prefetch images: `Image.prefetch(url)` for known upcoming images
- Use `fadeDuration={0}` on Android to avoid flicker for cached images

```tsx
import { Image } from 'react-native';

<Image
  source={{ uri: imageUrl }}
  style={{ width: 200, height: 200 }}
  resizeMode="cover"
  fadeDuration={0}
/>
```

## Bundle Size
- Import specific modules, not entire packages (`lodash/get` not `lodash`)
- Use `React.lazy` + `Suspense` for code splitting heavy screens
- Analyze bundle with `npx react-native-bundle-visualizer`
- Target < 5MB JS bundle for production

## Animations
- Use `react-native-reanimated` for all animations (not Animated API)
- Run animations on UI thread via worklets
- Never read shared values from JS thread in hot paths
- Use `useAnimatedStyle` instead of inline animated styles

## Startup
- Use Hermes engine (enable in `android/app/build.gradle` and Podfile)
- Inline requires for heavy modules (`require('heavy-lib')` inside function)
- Minimize `useEffect` chains on app startup
- Defer non-critical initialization with `InteractionManager.runAfterInteractions`
