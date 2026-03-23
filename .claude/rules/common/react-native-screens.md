---
description: React Native Screens — native navigation primitives, form sheets, search bar, screen freeze, header config
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Screens (react-native-screens)

Native navigation container components. Powers Expo Router and React Navigation under the hood.

## Setup

```bash
npx expo install react-native-screens
```

**Note:** Expo Router includes this automatically.

### Enable Native Screens & Freeze

```tsx
// App entry file
import { enableScreens, enableFreeze } from 'react-native-screens';

enableScreens(); // use native containers (default)
enableFreeze(true); // freeze inactive screens (recommended)
```

## Presentation Modes

```tsx
// Via Expo Router or React Navigation
<Stack.Screen
  name="detail"
  options={{
    // Presentation modes
    presentation: 'push', // standard push (default)
    presentation: 'modal', // iOS: card modal, Android: slide up
    presentation: 'transparentModal', // transparent overlay
    presentation: 'formSheet', // iOS form sheet with detents
    presentation: 'fullScreenModal', // full screen modal
    presentation: 'containedModal', // modal within current context
  }}
/>
```

## Form Sheet Configuration

```tsx
<Stack.Screen
  name="edit"
  options={{
    presentation: 'formSheet',
    sheetAllowedDetents: [0.25, 0.5, 0.75, 1.0], // quarter, half, 3/4, full
    // or: sheetAllowedDetents: ['fitToContents'],  // auto-size to content
    sheetLargestUndimmedDetent: 0, // index — no dimming at first detent
    sheetGrabberVisible: true, // iOS drag handle
    sheetCornerRadius: 20,
    sheetExpandsWhenScrolledToEdge: true, // iOS
    gestureEnabled: true,
    // Prevent dismissal (require explicit close button)
    preventNativeDismiss: true,
  }}
/>
```

## Animation Types

```tsx
<Stack.Screen
  options={{
    animation: 'default', // platform default
    animation: 'fade', // cross-fade
    animation: 'fade_from_bottom', // fade + slide from bottom
    animation: 'flip', // flip transition
    animation: 'slide_from_right', // standard iOS push
    animation: 'slide_from_left', // reverse push
    animation: 'slide_from_bottom', // slide up
    animation: 'ios_from_right', // iOS-style on Android
    animation: 'none', // instant, no animation
    transitionDuration: 350, // ms (iOS only)
  }}
/>
```

## Gesture Configuration

```tsx
<Stack.Screen
  options={{
    gestureEnabled: true, // swipe to dismiss (default: true)
    fullScreenSwipeEnabled: true, // swipe anywhere (not just edge)
    swipeDirection: 'horizontal', // 'horizontal' | 'vertical'
    gestureResponseDistance: {
      start: 50, // activation zone from edge
    },
    hideKeyboardOnSwipe: true,
    customAnimationOnSwipe: true, // use custom animation during swipe
  }}
/>
```

## Header Configuration

```tsx
<Stack.Screen
  options={{
    // Visibility
    headerShown: true,
    headerTranslucent: true, // blur behind header (iOS)
    headerBlurEffect: 'regular', // iOS blur style

    // Title
    title: 'Settings',
    headerTitleStyle: { fontSize: 18, fontWeight: '600' },
    headerLargeTitle: true, // iOS large title
    headerLargeTitleStyle: { fontSize: 34 },

    // Colors
    headerStyle: { backgroundColor: '#fff' },
    headerTintColor: '#007AFF', // back button + icons

    // Back button
    headerBackTitle: 'Back',
    headerBackTitleVisible: true,
    headerBackButtonDisplayMode: 'minimal', // 'default' | 'generic' | 'minimal'

    // Status bar
    statusBarStyle: 'dark', // 'auto' | 'light' | 'dark'
    statusBarAnimation: 'fade',
    statusBarHidden: false,

    // Orientation
    screenOrientation: 'portrait', // 'default' | 'all' | 'portrait' | 'landscape'
  }}
/>
```

## SearchBar

```tsx
<Stack.Screen
  options={{
    headerSearchBarOptions: {
      placeholder: 'Search...',
      autoCapitalize: 'none',
      hideWhenScrolling: true, // iOS auto-hide on scroll
      obscureBackground: true, // iOS dim background
      onChangeText: (e) => setQuery(e.nativeEvent.text),
      onSearchButtonPress: (e) => handleSearch(e.nativeEvent.text),
      onCancelButtonPress: () => setQuery(''),
      onFocus: () => {},
      onBlur: () => {},
    },
  }}
/>;

// SearchBar ref methods (via headerSearchBarRef)
searchBarRef.current?.focus();
searchBarRef.current?.blur();
searchBarRef.current?.clearText();
searchBarRef.current?.setText('query');
searchBarRef.current?.cancelSearch();
```

## Transition Progress Hooks

```tsx
import { useTransitionProgress } from 'react-native-screens';

const { progress, closing, goingForward } = useTransitionProgress();
// progress: Animated.Value 0→1 during transition
// closing: 1 when dismissing, 0 otherwise
// goingForward: 1 when pushing, 0 when popping

// Reanimated version
import { useReanimatedTransitionProgress } from 'react-native-screens/reanimated';
```

## Header Height Hooks

```tsx
import { useHeaderHeight } from 'react-native-screens/native-stack';
import { useAnimatedHeaderHeight } from 'react-native-screens/native-stack';

const headerHeight = useHeaderHeight(); // static measurement

// Dynamic (tracks large title collapse)
const animatedHeight = useAnimatedHeaderHeight();
```

## Screen Lifecycle Events

```tsx
<Stack.Screen
  listeners={{
    appear: () => {}, // screen appeared
    disappear: () => {}, // screen disappeared
    dismiss: () => {}, // dismissed via gesture/back
    willAppear: () => {}, // transition starting (incoming)
    willDisappear: () => {}, // transition starting (outgoing)
  }}
/>
```

## Screen Freeze (Performance)

```tsx
// Global (recommended)
enableFreeze(true);

// Per-screen
<Stack.Screen options={{ freezeOnBlur: true }} />;
```

When frozen:

- React tree rendering paused (no re-renders from store updates)
- Native views preserved (scroll position, inputs, images)
- useEffect cleanup does NOT run (not an unmount)
- On unfreeze, renders once with current state

## iOS-Specific Features

### Scroll Edge Effects (iOS 26+)

```tsx
<Stack.Screen
  options={{
    scrollEdgeEffects: {
      top: 'automatic', // 'automatic' | 'hard' | 'soft' | 'hidden'
      bottom: 'soft',
    },
  }}
/>
```

### FullWindowOverlay

```tsx
import { FullWindowOverlay } from 'react-native-screens';

// Renders above everything (above all navigators)
<FullWindowOverlay>
  <View style={StyleSheet.absoluteFill}>
    <Toast message="Hello" />
  </View>
</FullWindowOverlay>;
```

## Performance Notes

- `enableFreeze(true)` — most impactful single optimization for navigation performance
- Native transitions run on native thread — zero JS thread overhead
- `activityState={0}` detaches screens entirely from native hierarchy (deep stacks)
- Use `contentInsetAdjustmentBehavior="automatic"` on ScrollView with large titles / search bar
- `headerTranslucent: true` required for scroll-under-header effect on iOS
