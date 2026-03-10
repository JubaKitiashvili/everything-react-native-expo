---
description: React Native performance optimization rules
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

## Lists
- `FlatList` or `FlashList` for lists > 20 items (never ScrollView)
- Set `keyExtractor` with stable, unique keys
- Use `getItemLayout` when item heights are fixed
- Configure `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`
- `removeClippedSubviews={true}` for long lists on Android

## Images
- Use `expo-image` (not `<Image>` or react-native-fast-image)
- Set explicit `width` and `height` (avoid layout shifts)
- Use `contentFit="cover"` and `placeholder` for loading states
- Optimize source images (WebP, appropriate resolution)
- Use `cachePolicy="memory-disk"` for frequently accessed images

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
- Use Hermes engine (enabled by default in Expo SDK 50+)
- Inline requires for heavy modules (`require('heavy-lib')` inside function)
- Minimize `useEffect` chains on app startup
- Defer non-critical initialization with `InteractionManager.runAfterInteractions`
