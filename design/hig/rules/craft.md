# Craft — Motion Physics, Spacing & Micro-interactions

Reference rules for building polished React Native UI that feels native to Apple platforms.
All code targets Reanimated v4, Gesture Handler v2/v3, and Expo.

---

## 1. Spring Physics

Springs are the default animation primitive. Never use linear easing for UI motion — it feels mechanical.
Use `withSpring` from `react-native-reanimated` for all interactive responses.

### Presets

| Name    | damping | stiffness | mass | Use case                              |
|---------|---------|-----------|------|---------------------------------------|
| Smooth  | 20      | 300       | 1    | Page transitions, layout shifts       |
| Snappy  | 25      | 400       | 0.8  | Button press, toggle, quick feedback  |
| Bouncy  | 18      | 350       | 1    | Cards, modals, playful elements       |
| Gentle  | 20      | 100       | 1    | Floating elements, large panel slides |

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

// Spring preset definitions — import and reuse across your app
export const Springs = {
  smooth:  { damping: 20, stiffness: 300, mass: 1 },
  snappy:  { damping: 25, stiffness: 400, mass: 0.8 },
  bouncy:  { damping: 18, stiffness: 350, mass: 1 },
  gentle:  { damping: 20, stiffness: 100, mass: 1 },
} as const;

// Smooth — page-level transitions
function SmoothExample() {
  const translateX = useSharedValue(0);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const slide = () => {
    translateX.value = withSpring(100, Springs.smooth);
  };

  return <Animated.View style={style} />;
}

// Snappy — button or toggle feedback
function SnappyExample() {
  const scale = useSharedValue(1);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const press = () => {
    scale.value = withSpring(0.97, Springs.snappy, () => {
      scale.value = withSpring(1, Springs.snappy);
    });
  };

  return <Animated.View style={style} />;
}

// Bouncy — card expand or modal present
function BouncyExample() {
  const scale = useSharedValue(0.85);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const reveal = () => {
    scale.value = withSpring(1, Springs.bouncy);
  };

  return <Animated.View style={style} />;
}

// Gentle — floating action button or large sheet
function GentleExample() {
  const translateY = useSharedValue(80);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const float = () => {
    translateY.value = withSpring(0, Springs.gentle);
  };

  return <Animated.View style={style} />;
}
```

---

## 2. Rubber Banding

Overscroll and over-drag should feel like stretching a rubber band, not hitting a wall.
Apply this formula whenever a gesture moves past a boundary (scroll edges, drag limits).

### Formula

```typescript
/**
 * Rubber band resistance formula.
 * @param offset   — how far past the boundary the user has dragged (px)
 * @param dimension — size of the scrollable region (px)
 * @param constant  — resistance coefficient, default 0.55 (Apple's value)
 * @returns attenuated offset to apply as translation
 */
function rubberBand(
  offset: number,
  dimension: number,
  constant = 0.55,
): number {
  const absOffset = Math.abs(offset);
  const sign = offset < 0 ? -1 : 1;
  return sign * (absOffset * dimension) / (dimension + absOffset * constant);
}
```

### Usage in a Pan Gesture

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  cancelAnimation,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';

const CARD_HEIGHT = 400;
const MIN_Y = 0;
const MAX_Y = 0; // card is anchored at top

function RubberBandCard() {
  const translateY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateY);
    })
    .onUpdate((event) => {
      const raw = event.translationY;

      if (raw < MIN_Y) {
        // Over-dragging upward — apply rubber band resistance
        translateY.value = rubberBand(raw, CARD_HEIGHT);
      } else {
        translateY.value = raw;
      }
    })
    .onEnd(() => {
      // Snap back with smooth spring
      translateY.value = withSpring(0, { damping: 20, stiffness: 300, mass: 1 });
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={[{ height: CARD_HEIGHT }, style]} />
    </GestureDetector>
  );
}
```

### Rules

- Always snap back with `withSpring` on gesture end, never `withTiming`.
- The `constant` value 0.55 matches Apple's UIScrollView physics exactly.
- Apply rubber banding in both directions when the content can over-scroll either way.
- Rubber banding should NOT prevent the gesture from reaching extreme positions — it just attenuates.

---

## 3. Gesture Velocity & Momentum

Gestures feel native when they respect the user's velocity intent.

### Swipe-to-Dismiss

Dismiss when either:
- Velocity exceeds threshold (fast flick), OR
- Position exceeds 40% of screen height (slow drag far enough)

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDecay,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

const VELOCITY_THRESHOLD = 500;      // px/s — fast flick dismisses
const POSITION_THRESHOLD = SCREEN_HEIGHT * 0.4; // 40% of screen

interface SwipeToDismissProps {
  onDismiss: () => void;
  children: React.ReactNode;
}

function SwipeToDismiss({ onDismiss, children }: SwipeToDismissProps) {
  const translateY = useSharedValue(0);
  const opacity = useSharedValue(1);

  const dismiss = () => {
    // scheduleOnRN replaces runOnJS (removed in Reanimated v4)
    scheduleOnRN(() => {
      onDismiss();
    });
  };

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateY);
    })
    .onUpdate((event) => {
      // Only allow downward drag
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        // Fade as user drags down
        opacity.value = 1 - (event.translationY / SCREEN_HEIGHT) * 0.8;
      } else {
        // Rubber band upward over-drag
        translateY.value = rubberBand(event.translationY, SCREEN_HEIGHT);
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.velocityY > VELOCITY_THRESHOLD ||
        translateY.value > POSITION_THRESHOLD;

      if (shouldDismiss) {
        // Decay to natural stop off-screen, then call dismiss
        translateY.value = withDecay(
          { velocity: Math.max(event.velocityY, VELOCITY_THRESHOLD) },
          () => { dismiss(); },
        );
        opacity.value = withTiming(0, { duration: 200 });
      } else {
        // Snap back
        translateY.value = withSpring(0, { damping: 20, stiffness: 300, mass: 1 });
        opacity.value = withSpring(1, { damping: 20, stiffness: 300, mass: 1 });
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={style}>{children}</Animated.View>
    </GestureDetector>
  );
}
```

### Snap Points with withDecay

```typescript
import { withDecay, withSpring } from 'react-native-reanimated';

const SNAP_POINTS = [0, 300, 600]; // positions in px

function snapToNearest(value: number, velocity: number): number {
  'worklet';
  // Project where the decay animation would stop
  const projected = value + velocity * 0.15;
  // Find the nearest snap point to the projected position
  return SNAP_POINTS.reduce((prev, curr) =>
    Math.abs(curr - projected) < Math.abs(prev - projected) ? curr : prev,
  );
}

// In your gesture .onEnd():
// const target = snapToNearest(translateY.value, event.velocityY);
// translateY.value = withSpring(target, Springs.smooth);
```

### Rules

- `VELOCITY_THRESHOLD = 500` px/s is the standard iOS dismiss threshold.
- Always use `withDecay` for momentum-based flings (scroll overscroll, card throws).
- After a velocity-driven dismiss, never snap back — commit to the direction.
- CRITICAL: Use `scheduleOnRN` from `react-native-worklets` instead of `runOnJS`. `runOnJS` is removed in Reanimated v4.

---

## 4. 8pt Grid System

All layout dimensions, padding, margin, and gap values must be multiples of 4.
Prefer multiples of 8. This creates visual rhythm and consistency.

### Valid Spacing Values

```
0, 2, 4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64, 80, 96
```

The value `2` is only valid for fine optical corrections (see Section 5).

### Spacing Constants

```typescript
// spacing.ts — import this throughout the app, never hardcode numbers
export const Space = {
  px:  1,   // 1px — hairline only, avoid
  xs:  4,
  sm:  8,
  md:  12,
  base: 16,
  lg:  20,
  xl:  24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 64,
} as const;

export type SpaceKey = keyof typeof Space;
```

### Usage

```typescript
import { StyleSheet } from 'react-native';
import { Space } from '@/tokens/spacing';

const styles = StyleSheet.create({
  card: {
    padding: Space.base,       // 16
    gap: Space.sm,             // 8
    marginHorizontal: Space.base, // 16
    marginBottom: Space.xl,    // 24
  },
  section: {
    paddingVertical: Space.xl,  // 24
    paddingHorizontal: Space['2xl'], // 32
  },
  listItem: {
    paddingVertical: Space.md,  // 12
    paddingHorizontal: Space.base, // 16
    gap: Space.sm,             // 8
  },
});
```

### Rules

- Never use odd numbers or non-multiples of 4 in layout (except optical corrections).
- Icon sizes: 16, 20, 24, 28, 32, 40, 48.
- Touch targets: minimum 44pt (Apple HIG requirement). Use `minHeight: 44, minWidth: 44`.
- Content width max: use percentage or `maxWidth` aligned to the grid.

---

## 5. Optical Corrections

Human perception is not mathematically precise. These adjustments make things *feel* centered.

### Play Icon Offset

A triangle (play icon) appears optically left-shifted because its visual weight is left-heavy.
Offset by 2pt to the right.

```typescript
const styles = StyleSheet.create({
  playIcon: {
    // Mathematically centered would be marginLeft: 0
    // Optical correction: shift 2pt right
    marginLeft: 2,
  },
});
```

### Visual Centering in Circles

Icons inside circular buttons look too high when mathematically centered.
Shift down by 1–2pt depending on icon size.

```typescript
const styles = StyleSheet.create({
  circleButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconOptical: {
    // Shift icon 1pt down for visual centering in circle
    marginTop: 1,
  },
});
```

### Text Baseline Alignment

When mixing font sizes in a row, align by baseline, not center.

```typescript
import { View, Text, StyleSheet } from 'react-native';

function PriceDisplay() {
  return (
    <View style={styles.row}>
      {/* Currency symbol — smaller, aligned to baseline of main price */}
      <Text style={styles.currency}>$</Text>
      <Text style={styles.price}>29</Text>
      <Text style={styles.cents}>.99</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-end', // baseline-approximate for mixed sizes
  },
  currency: {
    fontSize: 17,
    lineHeight: 22,
    marginBottom: 4, // lift to align with price baseline
  },
  price: {
    fontSize: 48,
    lineHeight: 52,
  },
  cents: {
    fontSize: 24,
    lineHeight: 28,
    marginBottom: 4, // lift cents to price baseline
  },
});
```

### Optical Balance Rules

- Headline text in cards should have slightly less top padding than bottom padding (feels balanced).
- Horizontal padding should match or exceed vertical padding on cards.
- When text and icon sit in a row, the icon optical center is typically 1–2pt above the text center line.

---

## 6. Micro-interactions

Every interactive element should respond immediately to touch with a sub-100ms visual feedback.

### Button Press Scale

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Pressable } from 'react-native';
import * as Haptics from 'expo-haptics';

const Springs = {
  snappy: { damping: 25, stiffness: 400, mass: 0.8 },
};

function PressableButton({ onPress, children }: {
  onPress: () => void;
  children: React.ReactNode;
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      onPressIn={() => {
        scale.value = withSpring(0.97, Springs.snappy);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }}
      onPressOut={() => {
        scale.value = withSpring(1, Springs.snappy);
      }}
      onPress={onPress}
    >
      <Animated.View style={animatedStyle}>
        {children}
      </Animated.View>
    </Pressable>
  );
}
```

### Toggle Switch Spring

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  interpolateColor,
} from 'react-native-reanimated';
import { Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

const TRACK_WIDTH = 51;
const TRACK_HEIGHT = 31;
const THUMB_SIZE = 27;
const THUMB_TRAVEL = TRACK_WIDTH - THUMB_SIZE - 4; // 20pt

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  const progress = useSharedValue(value ? 1 : 0);

  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: progress.value * THUMB_TRAVEL }],
  }));

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      progress.value,
      [0, 1],
      ['#E5E5EA', '#34C759'],
    ),
  }));

  const handlePress = () => {
    const next = !value;
    progress.value = withSpring(next ? 1 : 0, { damping: 20, stiffness: 300, mass: 1 });
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onChange(next);
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: {
    width: TRACK_WIDTH,
    height: TRACK_HEIGHT,
    borderRadius: TRACK_HEIGHT / 2,
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
});
```

### Checkbox Bounce

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Pressable, StyleSheet } from 'react-native';
import * as Haptics from 'expo-haptics';

function Checkbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const scale = useSharedValue(1);
  const checkScale = useSharedValue(checked ? 1 : 0);

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }));

  const handlePress = () => {
    const next = !checked;

    // Bounce the container
    scale.value = withSequence(
      withSpring(0.85, { damping: 25, stiffness: 400, mass: 0.8 }),
      withSpring(1, { damping: 18, stiffness: 350, mass: 1 }), // bouncy snap back
    );

    // Animate check mark in/out
    checkScale.value = withSpring(next ? 1 : 0, { damping: 18, stiffness: 350, mass: 1 });

    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onChange(next);
  };

  return (
    <Pressable onPress={handlePress}>
      <Animated.View style={[styles.box, checked && styles.boxChecked, containerStyle]}>
        <Animated.View style={[styles.check, checkStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  box: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#C7C7CC',
    alignItems: 'center',
    justifyContent: 'center',
    borderCurve: 'continuous',
  },
  boxChecked: {
    backgroundColor: '#007AFF',
    borderColor: '#007AFF',
  },
  check: {
    width: 12,
    height: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 2,
  },
});
```

---

## 7. Haptic Pairing

Every interaction with a meaningful state change should have a corresponding haptic.
Haptics are not decorative — they confirm actions and prevent cognitive load.

### Haptic Map

| Interaction              | Haptic call                                                          |
|--------------------------|----------------------------------------------------------------------|
| Button press             | `impactAsync(ImpactFeedbackStyle.Light)`                             |
| Toggle switch            | `impactAsync(ImpactFeedbackStyle.Medium)`                            |
| Destructive action       | `notificationAsync(NotificationFeedbackType.Warning)`                |
| Success (save, send)     | `notificationAsync(NotificationFeedbackType.Success)`                |
| Error (validation fail)  | `notificationAsync(NotificationFeedbackType.Error)`                  |
| Selection change         | `selectionAsync()`                                                   |
| Long press               | `impactAsync(ImpactFeedbackStyle.Heavy)`                             |
| Swipe past threshold     | `impactAsync(ImpactFeedbackStyle.Medium)`                            |
| Pull-to-refresh trigger  | `impactAsync(ImpactFeedbackStyle.Medium)`                            |
| Context menu open        | `impactAsync(ImpactFeedbackStyle.Medium)`                            |
| Drag reorder             | `impactAsync(ImpactFeedbackStyle.Light)` on lift, Medium on drop     |

### Implementation

```typescript
import * as Haptics from 'expo-haptics';

// Always fire haptics synchronously on the interaction event, not on animation completion.
// Haptics should be instantaneous — do not await unless checking for errors.

// Button press — fire on onPressIn, not onPress, for immediacy
<Pressable
  onPressIn={() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }}
/>

// Destructive confirmation — warn before the action
async function handleDelete() {
  await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  // ... perform delete
}

// Success after async action
async function handleSubmit() {
  try {
    await submitForm();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }
}

// Selection change in a picker or segmented control
function handleSegmentChange(index: number) {
  Haptics.selectionAsync();
  setSelectedIndex(index);
}
```

### Rules

- Never chain multiple haptics in rapid succession (< 100ms apart) — they merge into noise.
- Always check for haptic support in contexts where it may not be available (iPad, simulator).
- Haptics fire on the main thread — they are always instantaneous from the user's perspective.
- Do not add haptics to scroll events or continuous drag updates — only at discrete state changes.
