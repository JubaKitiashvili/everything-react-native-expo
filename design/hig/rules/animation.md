# Animation — Reanimated v4 Patterns

Reference rules for all animation work in React Native with Reanimated v4.
CRITICAL: `runOnJS` is removed in Reanimated v4. Use `scheduleOnRN` from `react-native-worklets` instead.

---

## 1. Layout Animations

Layout animations handle elements entering and exiting the view hierarchy.
Use entering/exiting presets for simple cases, combine with `withDelay` for stagger effects.

### Basic Entering / Exiting

```typescript
import Animated, {
  FadeIn,
  FadeOut,
  SlideInRight,
  SlideOutRight,
  SlideInDown,
  SlideOutDown,
  ZoomIn,
  ZoomOut,
  FadeInUp,
  FadeOutDown,
} from 'react-native-reanimated';

// Simple fade
function FadeCard({ visible }: { visible: boolean }) {
  return visible ? (
    <Animated.View
      entering={FadeIn.duration(200)}
      exiting={FadeOut.duration(150)}
    >
      {/* content */}
    </Animated.View>
  ) : null;
}

// Slide from right (navigation push feel)
function SlidePanel() {
  return (
    <Animated.View
      entering={SlideInRight.springify().damping(20).stiffness(300)}
      exiting={SlideOutRight.springify().damping(20).stiffness(300)}
    >
      {/* content */}
    </Animated.View>
  );
}

// Sheet slides up from bottom
function BottomSheet() {
  return (
    <Animated.View
      entering={SlideInDown.springify().damping(22).stiffness(280).mass(1)}
      exiting={SlideOutDown.duration(250).easing(Easing.out(Easing.cubic))}
    >
      {/* content */}
    </Animated.View>
  );
}
```

### Stagger with withDelay

```typescript
import Animated, {
  FadeInUp,
  withDelay,
} from 'react-native-reanimated';

interface StaggerListProps {
  items: string[];
}

function StaggerList({ items }: StaggerListProps) {
  return (
    <>
      {items.map((item, index) => (
        <Animated.View
          key={item}
          entering={FadeInUp
            .delay(index * 50)       // 50ms stagger per item
            .springify()
            .damping(20)
            .stiffness(300)
          }
        >
          <ListItem label={item} />
        </Animated.View>
      ))}
    </>
  );
}
```

### Rules

- Max 6 items in a stagger sequence — beyond that, animate only the first 3 and show the rest instantly.
- Stagger delay: 40–60ms per item.
- Exiting animations should be 20–30% faster than entering.
- Never animate more than 8 elements simultaneously — batch or stagger.

---

## 2. Scroll-Linked Animations

Link animation values directly to scroll position using `useAnimatedScrollHandler`.

### Header Collapse Pattern

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { StyleSheet } from 'react-native';

const LARGE_TITLE_HEIGHT = 96;
const INLINE_TITLE_HEIGHT = 44;
const COLLAPSE_DISTANCE = LARGE_TITLE_HEIGHT - INLINE_TITLE_HEIGHT;

function CollapsingHeader({ title }: { title: string }) {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const largeTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, COLLAPSE_DISTANCE * 0.7],
      [1, 0],
      Extrapolation.CLAMP,
    );
    const translateY = interpolate(
      scrollY.value,
      [0, COLLAPSE_DISTANCE],
      [0, -COLLAPSE_DISTANCE * 0.5],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ translateY }] };
  });

  const inlineTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [COLLAPSE_DISTANCE * 0.5, COLLAPSE_DISTANCE],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  const headerStyle = useAnimatedStyle(() => {
    const height = interpolate(
      scrollY.value,
      [0, COLLAPSE_DISTANCE],
      [LARGE_TITLE_HEIGHT, INLINE_TITLE_HEIGHT],
      Extrapolation.CLAMP,
    );
    return { height };
  });

  return (
    <>
      <Animated.View style={[styles.header, headerStyle]}>
        <Animated.Text style={[styles.inlineTitle, inlineTitleStyle]}>
          {title}
        </Animated.Text>
        <Animated.Text style={[styles.largeTitle, largeTitleStyle]}>
          {title}
        </Animated.Text>
      </Animated.View>
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {/* content */}
      </Animated.ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  header: {
    overflow: 'hidden',
    backgroundColor: '#F2F2F7',
  },
  inlineTitle: {
    position: 'absolute',
    alignSelf: 'center',
    bottom: 10,
    fontSize: 17,
    fontWeight: '600',
  },
  largeTitle: {
    position: 'absolute',
    bottom: 8,
    left: 16,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
```

### Parallax Hero Image

```typescript
const HERO_HEIGHT = 280;
const PARALLAX_FACTOR = 0.4; // image scrolls at 40% of scroll speed

function ParallaxHero({ imageUri }: { imageUri: string }) {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const imageStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [-HERO_HEIGHT, 0, HERO_HEIGHT],
      [HERO_HEIGHT * PARALLAX_FACTOR, 0, -HERO_HEIGHT * PARALLAX_FACTOR],
      Extrapolation.CLAMP,
    );
    return { transform: [{ translateY }] };
  });

  return (
    <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
      <Animated.View style={{ height: HERO_HEIGHT, overflow: 'hidden' }}>
        <Animated.Image
          source={{ uri: imageUri }}
          style={[{ width: '100%', height: HERO_HEIGHT * 1.3 }, imageStyle]}
          resizeMode="cover"
        />
      </Animated.View>
      {/* content below hero */}
    </Animated.ScrollView>
  );
}
```

### Fade-on-Scroll Toolbar

```typescript
function FadeToolbar() {
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  const toolbarStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, 60],
      [0, 1],
      Extrapolation.CLAMP,
    );
    const borderOpacity = interpolate(
      scrollY.value,
      [0, 60],
      [0, 0.2],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <>
      <Animated.View style={[styles.floatingToolbar, toolbarStyle]} />
      <Animated.ScrollView onScroll={onScroll} scrollEventThrottle={16}>
        {/* content */}
      </Animated.ScrollView>
    </>
  );
}
```

### Rules

- Always set `scrollEventThrottle={16}` on scroll views (60fps = 16.67ms).
- Use `Extrapolation.CLAMP` to prevent values from going outside intended ranges.
- Interpolate opacity, scale, and translateY — never height or width (triggers layout).

---

## 3. Gesture-Driven Animations

### Pan with Decay (Fling)

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDecay,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

function FlingCard() {
  const translateX = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateX);
    })
    .onUpdate((event) => {
      translateX.value = event.translationX;
    })
    .onEnd((event) => {
      // Let the card coast to a natural stop with deceleration
      translateX.value = withDecay({
        velocity: event.velocityX,
        clamp: [-SCREEN_WIDTH / 2, SCREEN_WIDTH / 2],
      });
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={style} />
    </GestureDetector>
  );
}
```

### Pinch to Scale

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

function PinchableImage({ uri }: { uri: string }) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);

  const pinchGesture = Gesture.Pinch()
    .onUpdate((event) => {
      scale.value = savedScale.value * event.scale;
    })
    .onEnd(() => {
      // Clamp scale between 1 and 5, snap back if below 1
      if (scale.value < 1) {
        scale.value = withSpring(1, { damping: 20, stiffness: 300 });
        savedScale.value = 1;
      } else {
        savedScale.value = scale.value;
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={pinchGesture}>
      <Animated.Image source={{ uri }} style={[{ width: 300, height: 300 }, style]} />
    </GestureDetector>
  );
}
```

### Swipe-to-Dismiss (Complete Pattern)

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDecay,
  cancelAnimation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const DISMISS_VELOCITY = 500;
const DISMISS_POSITION = SCREEN_HEIGHT * 0.35;

function DismissibleSheet({ onDismiss }: { onDismiss: () => void }) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);
  const backgroundOpacity = useSharedValue(1);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateY);
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        const progress = Math.min(event.translationY / SCREEN_HEIGHT, 1);
        backgroundOpacity.value = 1 - progress * 0.6;
      } else {
        // Rubber band upward over-drag
        const absOffset = Math.abs(event.translationY);
        translateY.value = -(absOffset * SCREEN_HEIGHT) / (SCREEN_HEIGHT + absOffset * 0.55);
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.velocityY > DISMISS_VELOCITY ||
        translateY.value > DISMISS_POSITION;

      if (shouldDismiss) {
        const velocity = Math.max(event.velocityY, DISMISS_VELOCITY);
        translateY.value = withDecay({ velocity }, () => {
          scheduleOnRN(() => { onDismiss(); });
        });
        backgroundOpacity.value = withTiming(0, { duration: 250 });
      } else {
        translateY.value = withSpring(0, { damping: 22, stiffness: 280, mass: 1 });
        backgroundOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backgroundOpacity.value,
  }));

  return (
    <>
      <Animated.View style={[styles.backdrop, backdropStyle]} />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          {/* sheet content */}
        </Animated.View>
      </GestureDetector>
    </>
  );
}
```

---

## 4. Shared Element Transitions

Shared element transitions create continuity between screens.
In Reanimated v4, use `sharedTransitionTag` — note this is experimental.

```typescript
import Animated from 'react-native-reanimated';

// Source screen — the element you're transitioning FROM
function ListScreen() {
  return (
    <Animated.Image
      source={{ uri: item.imageUri }}
      sharedTransitionTag={`image-${item.id}`}
      style={styles.thumbnail}
    />
  );
}

// Destination screen — the element you're transitioning TO
function DetailScreen() {
  return (
    <Animated.Image
      source={{ uri: item.imageUri }}
      sharedTransitionTag={`image-${item.id}`}
      style={styles.heroImage}
    />
  );
}
```

### Custom Shared Transition

```typescript
import Animated, { SharedTransition, withSpring } from 'react-native-reanimated';

const customTransition = SharedTransition.custom((values) => {
  'worklet';
  return {
    height: withSpring(values.targetHeight, { damping: 22, stiffness: 300 }),
    width: withSpring(values.targetWidth, { damping: 22, stiffness: 300 }),
    originX: withSpring(values.targetOriginX, { damping: 22, stiffness: 300 }),
    originY: withSpring(values.targetOriginY, { damping: 22, stiffness: 300 }),
  };
});

// Apply to the element:
<Animated.View
  sharedTransitionTag="card-hero"
  sharedTransitionStyle={customTransition}
/>
```

### Rules

- `sharedTransitionTag` must be unique per screen — duplicate tags cause undefined behavior.
- Only share one or two elements per transition — hero image and maybe a title.
- Always test shared transitions on device, not simulator — timing differs significantly.
- Fallback gracefully: if the tag is not found on the destination, the element fades in normally.

---

## 5. Choreography Patterns

### Parent-First Stagger (Default)

The container enters first, children stagger in after.

```typescript
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

function StaggeredCard({ items }: { items: string[] }) {
  return (
    // Parent enters at t=0
    <Animated.View entering={FadeIn.duration(200)}>
      {items.map((item, i) => (
        // Children stagger in at 50ms intervals after parent
        <Animated.View
          key={item}
          entering={FadeInUp.delay(50 + i * 50).springify().damping(20).stiffness(280)}
        >
          <Text>{item}</Text>
        </Animated.View>
      ))}
    </Animated.View>
  );
}
```

### Simultaneous — Related Elements

Elements that are conceptually the same unit animate together.

```typescript
// Icon and label are one semantic unit — both enter at t=0
<Animated.View entering={FadeInUp.delay(100).springify()}>
  <View style={{ flexDirection: 'row', gap: 8 }}>
    <Icon name="star" />
    <Text>Favorites</Text>
  </View>
</Animated.View>
```

### Sequential — Causal Relationship

When action A causes B, animate B only after A completes.

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withDelay,
} from 'react-native-reanimated';

function SuccessSequence() {
  const checkScale = useSharedValue(0);
  const messageOpacity = useSharedValue(0);
  const buttonOpacity = useSharedValue(0);

  const triggerSuccess = () => {
    // Step 1: Check mark bounces in
    checkScale.value = withSpring(1, { damping: 18, stiffness: 350 });
    // Step 2: Message fades in after 300ms (check is done)
    messageOpacity.value = withDelay(300, withSpring(1, { damping: 20, stiffness: 300 }));
    // Step 3: Button appears after 600ms (message is readable)
    buttonOpacity.value = withDelay(600, withSpring(1, { damping: 20, stiffness: 300 }));
  };

  // ...animated styles...
}
```

### Delay Constants

| Relationship   | Delay    |
|----------------|----------|
| Stagger step   | 50ms     |
| After parent   | 50–100ms |
| Sequential step | 200–400ms |
| Post-async     | 0ms (react to data) |

---

## 6. Spring vs Timing Decision Tree

```
Is the animation responding to a user gesture or input?
├── YES → withSpring (always)
│          Use snappy for quick feedback (buttons, toggles)
│          Use smooth for navigation and layout shifts
│          Use bouncy for playful elements (cards, badges)
│          Use gentle for large panel movements
└── NO → Is it a state transition (show/hide, success/error)?
    ├── Duration matters (e.g., must sync with audio) → withTiming
    ├── Element entering/exiting view hierarchy → Entering/Exiting preset
    ├── Opacity fade → withTiming (150–250ms)
    ├── Color change → withTiming (200ms)
    └── Everything else → withSpring (smooth preset)
```

### Quick Reference

| Situation                    | Animation             | Config                       |
|------------------------------|-----------------------|------------------------------|
| Button press/release         | `withSpring`          | snappy                       |
| Toggle                       | `withSpring`          | smooth                       |
| Modal/sheet present          | `withSpring`          | smooth                       |
| Dismiss/close                | `withTiming`          | 250ms ease-out               |
| Success checkmark            | `withSpring`          | bouncy                       |
| Loading skeleton             | `withTiming` (loop)   | 1000ms, repeat               |
| Navigation push              | `withSpring`          | smooth                       |
| Fade in content              | `withTiming`          | 200ms                        |
| Scroll-linked                | `interpolate` directly| (no animation, just mapping) |
| Gesture velocity fling       | `withDecay`           | default deceleration         |

---

## 7. Reduced Motion

ALWAYS check for reduced motion. Never disable animations entirely — replace them with crossfades.

### Setup

```typescript
import { useReducedMotion } from 'react-native-reanimated';

// At component or hook level:
const reduceMotion = useReducedMotion();
```

### Crossfade Replacement Pattern

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  useReducedMotion,
} from 'react-native-reanimated';

function AnimatedCard({ visible }: { visible: boolean }) {
  const reduceMotion = useReducedMotion();
  const opacity = useSharedValue(visible ? 1 : 0);
  const translateY = useSharedValue(visible ? 0 : 20);

  const handleVisibilityChange = (isVisible: boolean) => {
    if (reduceMotion) {
      // Reduced motion: crossfade only, no movement
      opacity.value = withTiming(isVisible ? 1 : 0, { duration: 150 });
      translateY.value = isVisible ? 0 : 20; // instant, no animation
    } else {
      // Full motion: spring slide + fade
      opacity.value = withSpring(isVisible ? 1 : 0, { damping: 20, stiffness: 300 });
      translateY.value = withSpring(isVisible ? 0 : 20, { damping: 20, stiffness: 300 });
    }
  };

  const style = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return <Animated.View style={style}>{/* content */}</Animated.View>;
}
```

### Entering/Exiting with Reduced Motion

```typescript
import Animated, { FadeIn, FadeInUp, useReducedMotion } from 'react-native-reanimated';

function ConditionalEntering({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <Animated.View
      // Reduced motion: simple crossfade. Full motion: slide + fade.
      entering={reduceMotion ? FadeIn.duration(150) : FadeInUp.springify().damping(20)}
    >
      {children}
    </Animated.View>
  );
}
```

### Rules

- NEVER completely skip animations for reduced motion users — opacity crossfades are still beneficial.
- The crossfade duration for reduced motion is always 150ms.
- Test with Accessibility > Motion > Reduce Motion enabled on device.
- `useReducedMotion()` is a worklet-compatible shared value — safe to use in `useAnimatedStyle`.

---

## 8. Performance Rules

### Run Only on UI Thread

All animation calculations run on the UI thread (in worklets). Never block the JS thread with animation logic.

```typescript
// CORRECT — useAnimatedStyle runs on UI thread
const style = useAnimatedStyle(() => {
  'worklet'; // implicit, but you can be explicit
  return {
    transform: [{ scale: scale.value }],
  };
});

// WRONG — do not derive animation values in JS thread and pass them down
// This causes jank because JS renders at 60fps but paint happens on UI thread
const [scaleJS, setScaleJS] = useState(1); // DON'T drive animations from state
```

### Cancel Before New Animation

```typescript
import { cancelAnimation, withSpring } from 'react-native-reanimated';

// Always cancel before starting a new animation on the same value
cancelAnimation(translateX);
translateX.value = withSpring(newTarget, Springs.smooth);
```

### Prefer transform and opacity

```typescript
// PREFERRED — GPU-composited, no layout recalculation
const style = useAnimatedStyle(() => ({
  transform: [
    { translateX: x.value },
    { translateY: y.value },
    { scale: scale.value },
    { rotate: `${rotation.value}rad` },
  ],
  opacity: opacity.value,
}));

// AVOID — triggers layout on every frame
const style = useAnimatedStyle(() => ({
  width: width.value,           // layout property
  height: height.value,         // layout property
  marginLeft: offset.value,     // layout property
  paddingTop: padding.value,    // layout property
}));
```

### Avoid JS Callbacks During Animation

```typescript
// WRONG — runOnJS is removed in Reanimated v4
translateY.value = withSpring(0, Springs.smooth, (finished) => {
  if (finished) runOnJS(setIsVisible)(false); // WILL CRASH
});

// CORRECT — use scheduleOnRN from react-native-worklets
import { scheduleOnRN } from 'react-native-worklets';

translateY.value = withSpring(0, Springs.smooth, (finished) => {
  if (finished) {
    scheduleOnRN(() => { setIsVisible(false); });
  }
});
```

### Reduce Memory with useAnimatedRef

```typescript
import { useAnimatedRef, measure } from 'react-native-reanimated';

// Use animated refs to measure elements without JS thread involvement
const ref = useAnimatedRef<Animated.View>();

const measureElement = () => {
  const measurement = measure(ref);
  if (measurement) {
    // measurement.width, measurement.height, measurement.pageX, measurement.pageY
  }
};
```

### Performance Checklist

- [ ] All `useAnimatedStyle` callbacks only reference shared values, no state or props.
- [ ] `cancelAnimation` called before every new animation on the same shared value.
- [ ] Only `transform` and `opacity` used in looping or gesture-driven animations.
- [ ] No layout properties (width, height, margin, padding) animated during active gesture.
- [ ] `scheduleOnRN` used for all JS-thread callbacks from worklets (`runOnJS` is removed).
- [ ] `useReducedMotion()` checked in all animated components.
- [ ] `scrollEventThrottle={16}` set on all animated scroll views.
