---
description: React Native Gesture Handler — native gestures, tap, pan, pinch, rotation, fling, swipeable, drawer
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Gesture Handler (v2.29+)

Native-driven gesture management for React Native. All gestures run on the native thread for 60fps interactions.

## Setup

```bash
npx expo install react-native-gesture-handler
```

Wrap your app root:

```tsx
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function App() {
  return <GestureHandlerRootView style={{ flex: 1 }}>{/* app content */}</GestureHandlerRootView>;
}
```

**Note:** Expo Router wraps in `GestureHandlerRootView` automatically.

## GestureDetector

All gestures are applied via `<GestureDetector>`:

```tsx
import { GestureDetector, Gesture } from 'react-native-gesture-handler';

const tap = Gesture.Tap().onStart(() => {
  console.log('tapped');
});

<GestureDetector gesture={tap}>
  <Animated.View style={styles.box} />
</GestureDetector>;
```

## Gesture Types

### Tap

```tsx
const tap = Gesture.Tap()
  .numberOfTaps(1) // required taps (default: 1)
  .maxDuration(250) // ms before fail
  .maxDelay(250) // ms between taps for multi-tap
  .maxDistance(10) // max finger movement
  .onStart((e) => {
    // e.x, e.y, e.absoluteX, e.absoluteY, e.numberOfPointers
  });

// Double tap
const doubleTap = Gesture.Tap()
  .numberOfTaps(2)
  .onStart(() => {
    /* double tapped */
  });
```

### Pan (drag)

```tsx
const pan = Gesture.Pan()
  .minDistance(10) // px before activation
  .activeOffsetX([-20, 20]) // horizontal activation threshold
  .activeOffsetY([-20, 20]) // vertical activation threshold
  .failOffsetX([-50, 50]) // fail if moved too far horizontally
  .failOffsetY([-50, 50]) // fail if moved too far vertically
  .minPointers(1)
  .maxPointers(1)
  .onStart((e) => {
    /* drag started */
  })
  .onUpdate((e) => {
    // e.translationX, e.translationY — distance from start
    // e.velocityX, e.velocityY — current velocity
    // e.absoluteX, e.absoluteY — finger position on screen
    // e.numberOfPointers
    offset.value = startPos.value + e.translationX;
  })
  .onEnd((e) => {
    // e.velocityX, e.velocityY available for decay/fling
    offset.value = withDecay({ velocity: e.velocityX });
  });
```

### Pinch (scale)

```tsx
const pinch = Gesture.Pinch()
  .onUpdate((e) => {
    // e.scale — cumulative scale factor (starts at 1)
    // e.focalX, e.focalY — center point between fingers
    // e.velocity — scale change velocity
    scale.value = savedScale.value * e.scale;
  })
  .onEnd(() => {
    savedScale.value = scale.value;
  });
```

### Rotation

```tsx
const rotation = Gesture.Rotation()
  .onUpdate((e) => {
    // e.rotation — cumulative rotation in radians
    // e.anchorX, e.anchorY — rotation center
    // e.velocity
    rotate.value = savedRotation.value + e.rotation;
  })
  .onEnd(() => {
    savedRotation.value = rotate.value;
  });
```

### Long Press

```tsx
const longPress = Gesture.LongPress()
  .minDuration(500) // ms to activate (default: 500)
  .maxDistance(10) // max movement before fail
  .onStart(() => {
    /* held long enough */
  })
  .onEnd((e, success) => {
    // success = true if min duration was reached
  });
```

### Fling (swipe)

```tsx
const fling = Gesture.Fling()
  .direction(Directions.RIGHT) // RIGHT, LEFT, UP, DOWN
  .numberOfPointers(1)
  .onStart(() => {
    /* fling detected */
  });
```

### Hover (pointer devices)

```tsx
const hover = Gesture.Hover()
  .onBegin((e) => {
    /* pointer entered */
  })
  .onUpdate((e) => {
    /* pointer moved */
  })
  .onEnd((e) => {
    /* pointer left */
  });
```

### ForceTouch (3D Touch, iOS only)

```tsx
const force = Gesture.ForceTouch()
  .minForce(0.5) // 0-1 force threshold
  .maxForce(1.0)
  .feedbackOnActivation(true)
  .onUpdate((e) => {
    // e.force — current force 0-1
  });
```

## Gesture Lifecycle Callbacks

All gestures share these callbacks:

```tsx
Gesture.Pan()
  .onBegin((e) => {}) // finger touches screen
  .onStart((e) => {}) // gesture recognized / activated
  .onUpdate((e) => {}) // continuous updates (pan, pinch, rotation)
  .onEnd((e) => {}) // finger lifted (gesture was active)
  .onFinalize((e) => {}) // always called, even if gesture failed
  .onTouchesDown((e) => {}) // raw touch down
  .onTouchesMove((e) => {}) // raw touch move
  .onTouchesUp((e) => {}); // raw touch up
```

## Gesture Composition

### Simultaneous (all at once)

```tsx
// Pan + Pinch + Rotate at the same time
const composed = Gesture.Simultaneous(pan, pinch, rotate);

<GestureDetector gesture={composed}>
  <Animated.View style={animatedStyle} />
</GestureDetector>;
```

### Exclusive (first match wins)

```tsx
// Double tap takes priority over single tap
const composed = Gesture.Exclusive(doubleTap, singleTap);
```

### Race (first to activate wins)

```tsx
// Tap and pan compete — first to activate cancels the other
const composed = Gesture.Race(tap, pan, pinch);
```

### Cross-gesture Dependencies

```tsx
// Single tap waits for double tap to fail
singleTap.requireExternalGestureToFail(doubleTap);

// Pan blocks external gesture from activating
pan.blocksExternalGesture(externalPan);

// Gesture works alongside external gesture
swipeable.simultaneousWithExternalGesture(scrollGesture);
```

## Gesture Modifiers

```tsx
Gesture.Pan()
  .enabled(true) // enable/disable
  .shouldCancelWhenOutside(true) // cancel if finger leaves view
  .hitSlop({ top: 10, bottom: 10 }) // expand touch area
  .activateAfterLongPress(500) // delay activation
  .withRef(panRef) // get native ref
  .runOnJS(false) // callbacks on UI thread (default)
  .runOnJS(true); // callbacks on JS thread
```

## Full Example: Draggable + Scalable + Rotatable

```tsx
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';

function TransformableBox() {
  const offsetX = useSharedValue(0);
  const offsetY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const rotation = useSharedValue(0);
  const savedRotation = useSharedValue(0);

  const pan = Gesture.Pan()
    .onBegin(() => {
      startX.value = offsetX.value;
      startY.value = offsetY.value;
    })
    .onUpdate((e) => {
      offsetX.value = startX.value + e.translationX;
      offsetY.value = startY.value + e.translationY;
    });

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
    })
    .onEnd(() => {
      savedScale.value = scale.value;
    });

  const rotate = Gesture.Rotation()
    .onUpdate((e) => {
      rotation.value = savedRotation.value + e.rotation;
    })
    .onEnd(() => {
      savedRotation.value = rotation.value;
    });

  const composed = Gesture.Simultaneous(pan, pinch, rotate);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offsetX.value },
      { translateY: offsetY.value },
      { scale: scale.value },
      { rotateZ: `${(rotation.value * 180) / Math.PI}deg` },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[styles.box, animatedStyle]} />
    </GestureDetector>
  );
}
```

## Swipeable Components

### ReanimatedSwipeable (list items)

```tsx
import ReanimatedSwipeable from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, { SharedValue, useAnimatedStyle } from 'react-native-reanimated';

function RightAction(prog: SharedValue<number>, drag: SharedValue<number>) {
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: drag.value + 50 }],
  }));

  return (
    <Reanimated.View style={style}>
      <Text style={{ width: 50, height: 50, backgroundColor: 'red' }}>Delete</Text>
    </Reanimated.View>
  );
}

<ReanimatedSwipeable
  friction={2}
  rightThreshold={40}
  enableTrackpadTwoFingerGesture
  renderRightActions={RightAction}
  simultaneousWithExternalGesture={scrollGesture} // works inside ScrollView
>
  <Text>Swipe me</Text>
</ReanimatedSwipeable>;
```

### ReanimatedDrawerLayout

```tsx
import ReanimatedDrawerLayout, {
  DrawerType,
  DrawerPosition,
  DrawerLayoutMethods,
} from 'react-native-gesture-handler/ReanimatedDrawerLayout';

const drawerRef = useRef<DrawerLayoutMethods>(null);

<ReanimatedDrawerLayout
  ref={drawerRef}
  renderNavigationView={() => <DrawerContent />}
  drawerPosition={DrawerPosition.LEFT}
  drawerType={DrawerType.FRONT}
  drawerWidth={280}
>
  <MainContent />
</ReanimatedDrawerLayout>;

// Programmatic control
drawerRef.current?.openDrawer();
drawerRef.current?.closeDrawer();
```

## Touchable Components

Drop-in replacements for RN touchables with native gesture handling:

```tsx
import {
  TouchableOpacity,
  TouchableHighlight,
  Pressable,
} from 'react-native-gesture-handler';

// TouchableOpacity
<TouchableOpacity onPress={handlePress} activeOpacity={0.6}>
  <Text>Press me</Text>
</TouchableOpacity>

// Pressable (modern, recommended)
<Pressable
  onPress={handlePress}
  onLongPress={handleLongPress}
  onHoverIn={handleHoverIn}
  delayLongPress={500}
  hitSlop={10}
  android_ripple={{ color: 'rgba(255,255,255,0.3)' }}
  style={({ pressed }) => [styles.button, pressed && styles.pressed]}
>
  {({ pressed }) => <Text>{pressed ? 'Pressed!' : 'Press me'}</Text>}
</Pressable>
```

## Common Patterns

### Swipe to dismiss

```tsx
const pan = Gesture.Pan()
  .onUpdate((e) => {
    translateY.value = Math.max(0, e.translationY); // only downward
    opacity.value = 1 - translateY.value / 300;
  })
  .onEnd((e) => {
    if (translateY.value > 150 || e.velocityY > 500) {
      translateY.value = withTiming(500);
      runOnJS(onDismiss)();
    } else {
      translateY.value = withSpring(0);
      opacity.value = withSpring(1);
    }
  });
```

### Pull to refresh (custom)

```tsx
const pan = Gesture.Pan()
  .activeOffsetY([0, 10]) // only activate on downward drag
  .failOffsetY([-10, 0]) // fail on upward drag
  .onUpdate((e) => {
    pullDistance.value = Math.min(e.translationY * 0.5, 100); // resistance
  })
  .onEnd(() => {
    if (pullDistance.value > 60) {
      runOnJS(onRefresh)();
    }
    pullDistance.value = withSpring(0);
  });
```

### Bottom sheet drag

```tsx
const pan = Gesture.Pan()
  .onUpdate((e) => {
    sheetY.value = Math.max(0, startY.value + e.translationY);
  })
  .onEnd((e) => {
    // Snap to nearest detent
    const snapTo = snapPoints.reduce((prev, curr) =>
      Math.abs(curr - sheetY.value) < Math.abs(prev - sheetY.value) ? curr : prev,
    );
    sheetY.value = withSpring(snapTo, { damping: 20 });
  });
```

## Performance Rules

- Gesture callbacks run on the **UI thread** by default — don't access React state or call JS functions directly
- Use `runOnJS(fn)()` to call JS functions from gesture callbacks
- Use `.runOnJS(true)` only when you need JS thread access (slower)
- Compose gestures with `Simultaneous`/`Exclusive`/`Race` instead of nesting `GestureDetector`s
- Use `activeOffsetX`/`activeOffsetY` on Pan to prevent accidental activation
- Pair with Reanimated `useSharedValue` + `useAnimatedStyle` for 60fps animations
- Prefer `Pressable` from gesture-handler over RN's `Pressable` for consistent native behavior
