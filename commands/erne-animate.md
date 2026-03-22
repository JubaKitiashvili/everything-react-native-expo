---
name: erne-animate
description: ERNE — Implement animations using the ui-designer agent with Reanimated and Gesture Handler
---

# /erne-animate — Implement Animations

You are executing the `/erne-animate` command. Use the **ui-designer** agent to implement animations.

## Process

1. **Understand the animation goal** — What should animate? Transition, gesture, layout change, micro-interaction?
2. **Choose the right tool**:
   - **Reanimated** — Complex, performance-critical animations (runs on UI thread)
   - **Animated (built-in)** — Simple opacity/transform (limited, prefer Reanimated)
   - **LayoutAnimation** — Automatic layout transitions
   - **Moti** — Declarative animations with Reanimated under the hood
   - **CSS transitions (NativeWind v5)** — Simple state-driven transitions

3. **Implement with worklets** — Keep animation logic on the UI thread:

```tsx
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

const offset = useSharedValue(0);

const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: withSpring(offset.value) }],
}));
```

4. **Add gesture interaction** (if applicable):

```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const pan = Gesture.Pan()
  .onUpdate((e) => {
    offset.value = e.translationX;
  })
  .onEnd(() => {
    offset.value = withSpring(0);
  });
```

5. **Verify performance**:
   - Use `useFrameCallback` or FPS monitor to confirm 60fps
   - Check that worklets don't bridge to JS thread
   - Test on low-end devices

## Animation Patterns Reference

| Pattern | Tool | Example |
|---------|------|---------|
| Fade in/out | `withTiming` + opacity | Screen transitions |
| Spring bounce | `withSpring` | Button press feedback |
| Gesture drag | `Gesture.Pan` + `useAnimatedStyle` | Swipeable cards |
| Shared element | `expo-router` layout animations | Photo gallery to detail |
| Staggered list | `entering`/`exiting` props | List item appearance |
| Scroll-linked | `useAnimatedScrollHandler` | Parallax, collapsing headers |

## Output
- Animation implementation code
- Performance verification notes
- Gesture integration (if applicable)
