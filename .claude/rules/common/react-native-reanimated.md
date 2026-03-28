---
description: React Native Reanimated v4 — animations, worklets, gestures, layout animations, shared transitions
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Reanimated (v4)

Declarative, performant animation library. Animations run on the UI thread via worklets. **Reanimated v4 requires New Architecture** (mandatory since RN 0.82).

## Setup

```bash
npx expo install react-native-reanimated
```

Reanimated v4 also installs `react-native-worklets` as a separate dependency.

## Core Concepts

### Shared Values

```tsx
import { useSharedValue } from 'react-native-reanimated';

const offset = useSharedValue(0);

// Read/write from JS thread
offset.value = 100;

// Read/write from UI thread (inside worklets/animated styles)
// offset.value is automatically reactive
```

### Animated Styles

```tsx
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

function Box() {
  const offset = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: offset.value }],
  }));

  return (
    <>
      <Animated.View style={[styles.box, animatedStyle]} />
      <Button
        onPress={() => {
          offset.value = withSpring(200);
        }}
        title="Move"
      />
    </>
  );
}
```

### Derived Values

```tsx
import { useDerivedValue } from 'react-native-reanimated';

const scale = useSharedValue(1);
const opacity = useDerivedValue(() => {
  return scale.value > 1.5 ? 1 : 0.5;
});
```

### Animated Props (non-style props)

```tsx
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const r = useSharedValue(50);
const animatedProps = useAnimatedProps(() => ({ r: r.value }));

<AnimatedCircle animatedProps={animatedProps} cx={100} cy={100} fill="blue" />;
```

## Animation Functions

### withTiming (duration-based)

```tsx
import { withTiming, Easing } from 'react-native-reanimated';

// Basic
offset.value = withTiming(200);

// With config
offset.value = withTiming(200, {
  duration: 500,
  easing: Easing.out(Easing.cubic),
});

// With completion callback
offset.value = withTiming(200, { duration: 300 }, (finished) => {
  'worklet';
  if (finished) scheduleOnRN(onComplete);
});
```

### withSpring (physics-based)

```tsx
import { withSpring } from 'react-native-reanimated';

// Default spring
offset.value = withSpring(200);

// Custom spring physics
offset.value = withSpring(200, {
  damping: 20,
  stiffness: 90,
  mass: 1,
  overshootClamping: false,
  restDisplacementThreshold: 0.01,
  restSpeedThreshold: 2,
});
```

### withDecay (momentum-based)

```tsx
import { withDecay } from 'react-native-reanimated';

// Decelerate from current velocity (e.g., after fling gesture)
offset.value = withDecay({
  velocity: velocityFromGesture,
  deceleration: 0.998,
  clamp: [0, 500], // optional bounds
  rubberBandEffect: true, // bounce at clamp edges
  rubberBandFactor: 0.6,
});
```

### Modifiers (compose animations)

```tsx
import { withRepeat, withSequence, withDelay } from 'react-native-reanimated';

// Repeat
offset.value = withRepeat(withTiming(100), 5, true); // 5 times, reverse
offset.value = withRepeat(withTiming(100), -1, true); // infinite

// Sequence
offset.value = withSequence(
  withTiming(-50, { duration: 100 }),
  withRepeat(withTiming(50, { duration: 200 }), 5, true),
  withTiming(0, { duration: 100 }),
);

// Delay
offset.value = withDelay(500, withSpring(200));

// Cancel
cancelAnimation(offset);
```

## Easing Functions

```tsx
import { Easing } from 'react-native-reanimated';

Easing.linear;
Easing.ease; // cubic bezier (default)
Easing.quad; // t^2
Easing.cubic; // t^3
Easing.poly(n); // t^n
Easing.sin; // sine wave
Easing.circle;
Easing.exp; // exponential
Easing.elastic(n); // spring-like
Easing.back(s); // overshoot
Easing.bounce; // bounce

// Modifiers
Easing.in(Easing.cubic); // ease in
Easing.out(Easing.cubic); // ease out
Easing.inOut(Easing.cubic); // ease in-out
Easing.bezier(x1, y1, x2, y2); // custom cubic bezier
```

## Layout Animations

### Entering Animations

```tsx
import Animated, {
  FadeIn, FadeInDown, FadeInUp, FadeInLeft, FadeInRight,
  SlideInLeft, SlideInRight, SlideInUp, SlideInDown,
  ZoomIn, ZoomInDown, ZoomInUp, ZoomInEasyDown, ZoomInEasyUp, ZoomInRotate,
  BounceIn, BounceInDown, BounceInUp, BounceInLeft, BounceInRight,
  FlipInXUp, FlipInXDown, FlipInYLeft, FlipInYRight, FlipInEasyX, FlipInEasyY,
  StretchInX, StretchInY,
  LightSpeedInLeft, LightSpeedInRight,
  PinwheelIn,
  RotateInDownLeft, RotateInDownRight, RotateInUpLeft, RotateInUpRight,
  RollInLeft, RollInRight,
} from 'react-native-reanimated';

// Basic
<Animated.View entering={FadeIn} />

// With modifiers
<Animated.View entering={FadeInDown.duration(500).delay(200).springify()} />

// Custom config
<Animated.View
  entering={SlideInLeft
    .duration(300)
    .easing(Easing.inOut(Easing.quad))
    .withInitialValues({ transform: [{ translateX: -300 }] })
    .withCallback((finished) => {
      'worklet';
      console.log('finished:', finished);
    })
  }
/>
```

### Exiting Animations

All entering animations have corresponding exiting versions:

```tsx
import { FadeOut, FadeOutDown, SlideOutRight, ZoomOut, BounceOut } from 'react-native-reanimated';

<Animated.View exiting={FadeOut.duration(300)} />;
```

### Layout Transitions (when position/size changes)

```tsx
import Animated, {
  LinearTransition,
  FadingTransition,
  SequencedTransition,
  CurvedTransition,
  EntryExitTransition,
  JumpingTransition,
} from 'react-native-reanimated';

// Auto-animate layout changes
<Animated.View layout={LinearTransition.springify()} />

// With easing
<Animated.View layout={LinearTransition.duration(300).easing(Easing.ease)} />

// Curved transition (different easing per axis)
<Animated.View layout={
  CurvedTransition
    .easingX(Easing.in(Easing.exp))
    .easingY(Easing.out(Easing.quad))
    .duration(500)
} />

// Entry/exit based transition
<Animated.View layout={
  EntryExitTransition
    .entering(FlipInEasyX)
    .exiting(FlipOutEasyY)
    .duration(1000)
} />
```

## Scroll Handling

```tsx
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

function ScrollExample() {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
    onBeginDrag: (event) => {
      /* drag started */
    },
    onEndDrag: (event) => {
      /* drag ended */
    },
    onMomentumBegin: (event) => {
      /* momentum started */
    },
    onMomentumEnd: (event) => {
      /* momentum ended */
    },
  });

  return (
    <Animated.ScrollView onScroll={scrollHandler} scrollEventThrottle={16}>
      {/* content */}
    </Animated.ScrollView>
  );
}
```

### useScrollViewOffset

```tsx
import Animated, { useAnimatedRef, useScrollViewOffset } from 'react-native-reanimated';

const scrollRef = useAnimatedRef<Animated.ScrollView>();
const scrollOffset = useScrollViewOffset(scrollRef); // reactive SharedValue

<Animated.ScrollView ref={scrollRef}>
  {/* scrollOffset.value updates on scroll */}
</Animated.ScrollView>;
```

## Ref Utilities

```tsx
import { useAnimatedRef, measure, scrollTo } from 'react-native-reanimated';

const animatedRef = useAnimatedRef<Animated.View>();

// Measure layout (runs on UI thread)
const measurement = measure(animatedRef);
// { x, y, width, height, pageX, pageY }

// Programmatic scroll
scrollTo(scrollRef, 0, 200, true); // x, y, animated
```

## Thread Communication

**`runOnJS` is removed in Reanimated 4.** Use `scheduleOnRN` from `react-native-worklets` instead.

```tsx
import { scheduleOnRN } from 'react-native-worklets';
import { scheduleOnUI } from 'react-native-worklets';

// Call JS function from UI thread (worklet → JS)
const showAlert = (message: string) => {
  Alert.alert(message);
};

const handler = useAnimatedScrollHandler({
  onScroll: (event) => {
    if (event.contentOffset.y > 500) {
      scheduleOnRN(showAlert, 'Scrolled past 500!');
    }
  },
});

// Call worklet from JS thread (JS → UI)
scheduleOnUI(() => {
  'worklet';
  offset.value = withSpring(100);
});
```

**Key difference:** `scheduleOnRN(fn, arg1, arg2)` passes args directly (not curried like the old `runOnJS(fn)(args)`).

## Shared Element Transitions (Experimental)

**Status:** Experimental, not production-ready. API may change.

```tsx
import Animated, { SharedTransition } from 'react-native-reanimated';

// Define transition
const transition = SharedTransition.duration(500).springify();

// Source screen
<Animated.Image
  sharedTransitionTag="hero-image"
  sharedTransitionStyle={transition}
  source={image}
  style={{ width: 100, height: 100 }}
/>

// Detail screen (same tag)
<Animated.Image
  sharedTransitionTag="hero-image"
  sharedTransitionStyle={transition}
  source={image}
  style={{ width: 300, height: 300 }}
/>
```

## Gesture Handler Integration

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

function DraggableBox() {
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const gesture = Gesture.Pan()
    .onUpdate((e) => {
      translateX.value = savedX.value + e.translationX;
      translateY.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = translateX.value;
      savedY.value = translateY.value;
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.box, animatedStyle]} />
    </GestureDetector>
  );
}
```

## Keyboard Animations

**`useAnimatedKeyboard` is deprecated in Reanimated 4.** Use `react-native-keyboard-controller` instead:

```bash
npx expo install react-native-keyboard-controller
```

```tsx
import { useKeyboardHandler } from 'react-native-keyboard-controller';
import { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';

function KeyboardAware() {
  const height = useSharedValue(0);

  useKeyboardHandler({
    onMove: (e) => {
      'worklet';
      height.value = e.height;
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -height.value }],
  }));

  return <Animated.View style={animatedStyle}>{/* input form */}</Animated.View>;
}
```

## Accessibility

```tsx
import { useReducedMotion } from 'react-native-reanimated';

const reduceMotion = useReducedMotion();

// Respect user's reduced motion preference
const duration = reduceMotion ? 0 : 500;
offset.value = withTiming(200, { duration });

// Layout animations also support it
<Animated.View entering={FadeIn.reduceMotion(ReduceMotion.System)} />;
```

## Animated Components

```tsx
import Animated from 'react-native-reanimated';

// Built-in animated components
<Animated.View />
<Animated.Text />
<Animated.Image />
<Animated.ScrollView />
<Animated.FlatList />

// Create custom animated components
const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
```

## Common Patterns

### Interpolation

```tsx
import { interpolate, Extrapolation } from 'react-native-reanimated';

const animatedStyle = useAnimatedStyle(() => ({
  opacity: interpolate(scrollY.value, [0, 100], [1, 0], Extrapolation.CLAMP),
  transform: [
    {
      scale: interpolate(scrollY.value, [0, 100], [1, 0.8], Extrapolation.CLAMP),
    },
  ],
}));
```

### Color Interpolation

```tsx
import { interpolateColor } from 'react-native-reanimated';

const animatedStyle = useAnimatedStyle(() => ({
  backgroundColor: interpolateColor(progress.value, [0, 1], ['#FF0000', '#0000FF']),
}));
```

### Snap Points

```tsx
offset.value = withSpring(
  // Snap to nearest point
  snapPoints.reduce((prev, curr) =>
    Math.abs(curr - offset.value) < Math.abs(prev - offset.value) ? curr : prev,
  ),
);
```

## CSS Transitions (Reanimated 4)

The simplest animation approach — animate style changes automatically when state changes:

```tsx
const [expanded, setExpanded] = useState(false);

<Animated.View
  style={{
    height: expanded ? 200 : 100,
    opacity: expanded ? 1 : 0.5,
    transitionProperty: 'height, opacity',
    transitionDuration: '300ms',
    transitionTimingFunction: 'ease-in-out',
  }}
/>
```

Supports `transitionDelay`, `transitionBehavior: 'allow-discrete'` for display/visibility transitions.

## CSS Animations (Reanimated 4)

Keyframe-based animations using CSS syntax:

```tsx
const pulse = {
  '0%': { transform: [{ scale: 1 }], opacity: 1 },
  '50%': { transform: [{ scale: 1.1 }], opacity: 0.7 },
  '100%': { transform: [{ scale: 1 }], opacity: 1 },
};

<Animated.View
  style={{
    animationName: pulse,
    animationDuration: '1s',
    animationIterationCount: 'infinite',
    animationTimingFunction: 'ease-in-out',
  }}
/>
```

Supports `animationDelay`, `animationFillMode`, `animationPlayState` (pause/resume), `animationDirection`.

## Animation Decision Tree

```
What are you animating?
│
├── Simple state-driven style change (opacity, color, size)?
│   └── CSS Transitions — simplest, automatic
│
├── Repeating/looping animation (pulse, spin, shimmer)?
│   └── CSS Animations with keyframes
│
├── Gesture-driven or interactive animation?
│   └── Shared Values + useAnimatedStyle
│
├── Complex 2D graphics (charts, drawing, particles)?
│   └── Skia Canvas (@shopify/react-native-skia)
│
└── GPU compute (physics sim, boids, fluid, noise)?
    └── WebGPU (react-native-wgpu + TypeGPU)
```

## withClamp (Reanimated 4)

Limits animated value range — prevents spring overshoot past bounds:

```tsx
offset.value = withClamp({ min: 0, max: 300 }, withSpring(200));
```

## useSharedValue Gotchas

- **Never destructure:** `const { value } = sv` breaks reactivity. Always use `sv.value`
- **Use `.modify()` for arrays/objects:** `arr.modify((v) => { v.push(item); })` — avoids copying
- **React Compiler:** Use `.get()` / `.set()` instead of `.value` for compatibility
- **Never read/modify during render:** Only inside `useAnimatedStyle`, `useDerivedValue`, or worklet callbacks
- **Don't add `'worklet'` to callbacks passed to Reanimated APIs** — auto-workletized by Babel plugin

## Performance Rules

- **All animation code runs on the UI thread** — never access React state or JS-only APIs inside `useAnimatedStyle` or worklets
- Use `scheduleOnRN()` from `react-native-worklets` to call JS functions from worklets (`runOnJS` is removed)
- Use `useDerivedValue` for computed values (reactive, runs on UI thread)
- Prefer `withSpring` over `withTiming` for natural-feeling animations
- Use `cancelAnimation(sharedValue)` before starting a new animation on the same value
- Always use `Animated.View`/`Animated.Text` etc. — regular RN components don't animate
- Use `useReducedMotion()` to respect accessibility preferences
- Prefer non-layout properties (`transform`, `opacity`) over layout properties (`top`, `left`, `width`, `height`) — layout forces extra passes
- **Reanimated v4:** `react-native-worklets` is a separate package — installed automatically

### Performance Flags

Enable in `app.json` under `expo.experiments.reanimated`:

- `USE_COMMIT_HOOK_ONLY_FOR_REACT_COMMITS` — reduces unnecessary commits
- `ANDROID_SYNCHRONOUSLY_UPDATE_UI_PROPS` — sync prop updates (Android)
- `IOS_SYNCHRONOUSLY_UPDATE_UI_PROPS` — sync prop updates (iOS)

For 120fps ProMotion displays, add to `Info.plist`:
```xml
<key>CADisableMinimumFrameDurationOnPhone</key>
<true/>
```
