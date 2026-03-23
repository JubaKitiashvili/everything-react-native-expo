---
description: Callstack navigation libraries — native bottom tabs, pager view, swipeable pages
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Callstack Navigation Libraries

## react-native-bottom-tabs (Native Bottom Tabs)

True native tab bars — `UITabBarController` (iOS), `BottomNavigationView` Material 3 (Android).

### Setup

```bash
npm install @react-navigation/bottom-tabs
```

### Expo Router Integration

```tsx
// app/(tabs)/_layout.tsx
import { withLayoutContext } from 'expo-router';
import { createNativeBottomTabNavigator } from '@react-navigation/bottom-tabs/unstable';

const { Navigator } = createNativeBottomTabNavigator();
const Tabs = withLayoutContext(Navigator);

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: { type: 'sfSymbol', name: 'house' },
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: { type: 'sfSymbol', name: 'magnifyingglass' },
        }}
      />
    </Tabs>
  );
}
```

### Icon Types

```tsx
// SF Symbol (iOS only)
tabBarIcon: { type: 'sfSymbol', name: 'heart' }

// Image (cross-platform)
tabBarIcon: { type: 'image', source: require('./icon.png') }
tabBarIcon: { type: 'image', source: require('./icon.png'), tinted: false }  // original colors

// Android drawable
tabBarIcon: { type: 'drawableResource', name: 'sunny' }

// Dynamic (focused/unfocused)
tabBarIcon: ({ focused }) => ({
  type: 'sfSymbol',
  name: focused ? 'heart.fill' : 'heart',
})

// Platform-specific
tabBarIcon: Platform.select({
  ios: { type: 'sfSymbol', name: 'heart' },
  android: { type: 'drawableResource', name: 'heart_icon' },
})
```

### Navigator Props

```tsx
<Tabs
  sidebarAdaptable={true} // iOS 18+ iPad sidebar
  ignoresTopSafeArea={false} // iOS
  scrollEdgeAppearance="transparent" // iOS: 'default' | 'opaque' | 'transparent'
  hapticFeedbackEnabled={true} // iOS haptics on tab press
  tabBarActiveTintColor="#007AFF"
  barTintColor="#F8F8F8"
  activeIndicatorColor="#E3F2FD" // Android Material 3 pill
  tabBarMinimizeBehavior="auto" // iOS 26+: 'auto' | 'always' | 'never'
/>
```

### Screen Options

```tsx
<Tabs.Screen
  options={{
    title: 'Home',
    tabBarLabel: 'Home',
    tabBarBadge: '3', // badge value
    tabBarBadgeStyle: { backgroundColor: 'yellow', color: 'black' }, // Android
    tabBarLabelStyle: { fontSize: 12, fontFamily: 'Inter' },
    tabBarStyle: { backgroundColor: '#fff' },
    tabBarHidden: false,
    tabBarSystemItem: 'search', // iOS built-in items
    lazy: true, // lazy render
    freezeOnBlur: true, // freeze inactive (performance)
    headerShown: true,
  }}
/>
```

### Key Notes

- Import from `@react-navigation/bottom-tabs/unstable` (API may change)
- Cannot render custom React components in tab bar (native-only)
- Icons must be static images, SF Symbols, or Android drawables (no `<Ionicons />`)
- `e.preventDefault()` not supported on `tabPress` (native handling)
- Requires Expo SDK 53+ / RN 0.79+

---

## react-native-pager-view (Swipeable Pages)

Native `ViewPager2` (Android) and `UIPageViewController` (iOS) wrapper.

### Setup

```bash
npx expo install react-native-pager-view
```

### Basic Usage

```tsx
import PagerView from 'react-native-pager-view';

<PagerView style={{ flex: 1 }} initialPage={0}>
  <View key="1" collapsable={false}>
    <Text>Page 1</Text>
  </View>
  <View key="2" collapsable={false}>
    <Text>Page 2</Text>
  </View>
  <View key="3" collapsable={false}>
    <Text>Page 3</Text>
  </View>
</PagerView>;
```

### Props

| Prop                  | Type                         | Platform     | Description                   |
| --------------------- | ---------------------------- | ------------ | ----------------------------- |
| `initialPage`         | `number`                     | Both         | Starting page index           |
| `scrollEnabled`       | `boolean`                    | Both         | Allow swiping                 |
| `orientation`         | `'horizontal' \| 'vertical'` | Both         | **Cannot change dynamically** |
| `pageMargin`          | `number`                     | Both         | Gap between pages (px)        |
| `keyboardDismissMode` | `'none' \| 'on-drag'`        | Both         | Dismiss keyboard on drag      |
| `layoutDirection`     | `'ltr' \| 'rtl' \| 'locale'` | Both         | Layout direction              |
| `overdrag`            | `boolean`                    | iOS only     | Overscroll past first/last    |
| `offscreenPageLimit`  | `number`                     | Android only | Pages retained off-screen     |

### Events

```tsx
<PagerView
  onPageScroll={(e) => {
    e.nativeEvent.position; // current page index
    e.nativeEvent.offset; // 0-1 transition progress
  }}
  onPageSelected={(e) => {
    e.nativeEvent.position; // newly selected page
  }}
  onPageScrollStateChanged={(e) => {
    e.nativeEvent.pageScrollState; // 'idle' | 'dragging' | 'settling'
  }}
/>
```

### Ref Methods

```tsx
const ref = useRef<PagerView>(null);

ref.current?.setPage(2); // animated
ref.current?.setPageWithoutAnimation(2); // instant
ref.current?.setScrollEnabled(false);

// iOS: wrap in requestAnimationFrame to avoid crashes
requestAnimationFrame(() => ref.current?.setPage(index));
```

### Animated with Reanimated

```tsx
import Animated, { useHandler, useEvent } from 'react-native-reanimated';

const AnimatedPagerView = Animated.createAnimatedComponent(PagerView);

// UI-thread scroll handler for jank-free indicators
function usePageScrollHandler(handlers, deps) {
  const { context, doDependenciesDiffer } = useHandler(handlers, deps);
  return useEvent(
    (event) => {
      'worklet';
      if (handlers.onPageScroll && event.eventName.endsWith('onPageScroll')) {
        handlers.onPageScroll(event, context);
      }
    },
    ['onPageScroll'],
    doDependenciesDiffer,
  );
}

const offset = useSharedValue(0);
const handler = usePageScrollHandler({
  onPageScroll: (e) => {
    'worklet';
    offset.value = e.offset;
  },
});

<AnimatedPagerView onPageScroll={handler} style={{ flex: 1 }}>
  {/* pages */}
</AnimatedPagerView>;
```

### Key Gotchas

- Set `collapsable={false}` on Android child Views (prevents blank pages)
- `orientation` cannot be changed after mount
- Each child needs unique `key` prop
- Used internally by `react-native-tab-view`
