# Patterns — Navigation, Modality & Platform Behaviors

Canonical implementation patterns for common iOS navigation paradigms in React Native/Expo.
These patterns are opinionated — use them consistently across the app.

---

## 1. Navigation

### Large Title Collapsing Header

The standard iOS navigation pattern: a large 34pt title that collapses to a 17pt inline title as the user scrolls.

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withSpring,
} from 'react-native-reanimated';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const LARGE_TITLE_HEIGHT = 52;    // height of the large title area
const NAV_BAR_HEIGHT = 44;        // standard nav bar height

function LargeTitleScreen({ title, children }: {
  title: string;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const scrollY = useSharedValue(0);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Large title fades and slides out
  const largeTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, LARGE_TITLE_HEIGHT * 0.6],
      [1, 0],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Inline title fades in as large title fades out
  const inlineTitleStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [LARGE_TITLE_HEIGHT * 0.4, LARGE_TITLE_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  // Nav bar background fades in (with blur) when scrolled
  const navBarBackgroundStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, LARGE_TITLE_HEIGHT],
      [0, 1],
      Extrapolation.CLAMP,
    );
    return { opacity };
  });

  return (
    <View style={{ flex: 1 }}>
      {/* Navigation bar */}
      <View style={[styles.navBar, { paddingTop: insets.top }]}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.navBarBackground, navBarBackgroundStyle]} />
        <Animated.Text style={[styles.inlineTitle, inlineTitleStyle]}>
          {title}
        </Animated.Text>
      </View>

      {/* Large title (scrolls with content, pinned to top) */}
      <Animated.Text
        style={[
          styles.largeTitle,
          { marginTop: insets.top + NAV_BAR_HEIGHT },
          largeTitleStyle,
        ]}
      >
        {title}
      </Animated.Text>

      {/* Scrollable content */}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: insets.top + NAV_BAR_HEIGHT + LARGE_TITLE_HEIGHT,
        }}
      >
        {children}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  navBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 44,
    zIndex: 100,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 11,
  },
  navBarBackground: {
    backgroundColor: 'rgba(242, 242, 247, 0.85)',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(60, 60, 67, 0.29)',
  },
  inlineTitle: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
  },
  largeTitle: {
    position: 'absolute',
    left: 16,
    fontSize: 34,
    fontWeight: '700',
    letterSpacing: 0.37,
    zIndex: 10,
  },
});
```

### Tab Bar with Native Bottom Tabs

Use Expo Router's native tab bar — it automatically handles safe area, haptics, and the iOS tab bar appearance.

```typescript
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { useColors } from '@/tokens/colors';

export default function TabsLayout() {
  const colors = useColors();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.tint,
        tabBarInactiveTintColor: colors.tertiaryLabel,
        tabBarStyle: {
          backgroundColor: colors.background,
          borderTopColor: colors.separator,
        },
        headerShown: false,  // Use custom large-title headers
      }}
    >
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="search" options={{ title: 'Search' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile' }} />
    </Tabs>
  );
}
```

### Stack Transitions with Spring

For custom stack navigation transitions, use a spring-based slide.

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { Dimensions } from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Incoming screen (new screen pushing in from right)
function PushTransition({ children, active }: {
  children: React.ReactNode;
  active: boolean;
}) {
  const translateX = useSharedValue(active ? 0 : SCREEN_WIDTH);

  React.useEffect(() => {
    translateX.value = withSpring(active ? 0 : SCREEN_WIDTH, {
      damping: 26,
      stiffness: 300,
      mass: 1,
    });
  }, [active]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  return <Animated.View style={[{ flex: 1 }, style]}>{children}</Animated.View>;
}
```

---

## 2. Modality

### Form Sheets with sheetAllowedDetents

Use Expo Router's sheet presentation for form interactions.

```typescript
// app/modal.tsx — presented as a sheet
import { useRouter } from 'expo-router';

export default function FormSheet() {
  const router = useRouter();

  return (
    <YourFormContent onClose={() => router.back()} />
  );
}

// In the layout, configure sheet properties:
// app/_layout.tsx
import { Stack } from 'expo-router';

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="modal"
        options={{
          presentation: 'formSheet',
          sheetAllowedDetents: [0.5, 0.75, 1.0],  // half, 3/4, full
          sheetGrabberVisible: true,
          sheetCornerRadius: 20,
          headerShown: false,
        }}
      />
    </Stack>
  );
}
```

### Drag-to-Dismiss Sheet Pattern

A custom sheet with full gesture-based dismiss behavior.

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withDecay,
  cancelAnimation,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Dimensions, StyleSheet, View } from 'react-native';
import { scheduleOnRN } from 'react-native-worklets';
import * as Haptics from 'expo-haptics';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_MAX_HEIGHT = SCREEN_HEIGHT * 0.92;
const DISMISS_VELOCITY = 600;
const DISMISS_THRESHOLD = SHEET_MAX_HEIGHT * 0.3;

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

function BottomSheet({ visible, onClose, children }: BottomSheetProps) {
  const translateY = useSharedValue(SHEET_MAX_HEIGHT);
  const backdropOpacity = useSharedValue(0);

  // Present / dismiss on visibility change
  React.useEffect(() => {
    if (visible) {
      translateY.value = withSpring(0, { damping: 26, stiffness: 280, mass: 1 });
      backdropOpacity.value = withTiming(1, { duration: 250 });
    } else {
      translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 300 });
      backdropOpacity.value = withTiming(0, { duration: 250 });
    }
  }, [visible]);

  const close = () => {
    translateY.value = withTiming(SHEET_MAX_HEIGHT, { duration: 300 });
    backdropOpacity.value = withTiming(0, { duration: 250 });
    scheduleOnRN(() => { onClose(); });
  };

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(translateY);
    })
    .onUpdate((event) => {
      if (event.translationY > 0) {
        translateY.value = event.translationY;
        backdropOpacity.value = interpolate(
          event.translationY,
          [0, SHEET_MAX_HEIGHT * 0.5],
          [1, 0],
          Extrapolation.CLAMP,
        );
      } else {
        // Rubber band upward
        const absY = Math.abs(event.translationY);
        translateY.value = -(absY * SHEET_MAX_HEIGHT) / (SHEET_MAX_HEIGHT + absY * 0.55);
      }
    })
    .onEnd((event) => {
      const shouldDismiss =
        event.velocityY > DISMISS_VELOCITY ||
        translateY.value > DISMISS_THRESHOLD;

      if (shouldDismiss) {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        translateY.value = withDecay(
          { velocity: Math.max(event.velocityY, DISMISS_VELOCITY) },
          () => { scheduleOnRN(() => { onClose(); }); },
        );
        backdropOpacity.value = withTiming(0, { duration: 200 });
      } else {
        translateY.value = withSpring(0, { damping: 26, stiffness: 280, mass: 1 });
        backdropOpacity.value = withSpring(1, { damping: 20, stiffness: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={visible ? 'auto' : 'none'}>
      <Animated.View
        style={[styles.backdrop, backdropStyle]}
        onTouchEnd={close}
      />
      <GestureDetector gesture={panGesture}>
        <Animated.View style={[styles.sheet, sheetStyle]}>
          {/* Grab handle */}
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  sheet: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: SHEET_MAX_HEIGHT,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderCurve: 'continuous',
    paddingTop: 8,
  },
  handle: {
    width: 36,
    height: 5,
    borderRadius: 3,
    backgroundColor: 'rgba(60, 60, 67, 0.3)',
    alignSelf: 'center',
    marginBottom: 16,
  },
});
```

### Alert & Action Sheet Hierarchy

```
Severity Level:
1. Toast / banner        — non-blocking, auto-dismiss (2–4s)
2. Inline validation     — error text below field, no interruption
3. Snackbar              — actionable, bottom of screen, 4s
4. Alert (modal)         — blocking, requires decision, one or two options
5. Action sheet          — 3+ options, bottom sheet, cancel always last

Action sheet button order (Apple HIG):
1. Most likely/safe action first
2. Other actions
3. Destructive action (red, if any)
4. Cancel (always last, always present)
```

---

## 3. Liquid Glass

iOS 26 introduces Liquid Glass — a dynamic, refractive blur material.
Use `expo-glass-effect` for the native glass material, `expo-blur` as a fallback.

### expo-glass-effect GlassView (iOS 26+)

```typescript
import { GlassView } from 'expo-glass-effect';
import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from 'react-native';

function GlassCard({ title, subtitle }: { title: string; subtitle: string }) {
  const scheme = useColorScheme();

  return (
    <GlassView
      style={styles.glassCard}
      // GlassView automatically adapts to light/dark mode
      // No explicit colorScheme prop needed
    >
      <Text style={[styles.title, scheme === 'dark' && styles.titleDark]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, scheme === 'dark' && styles.subtitleDark]}>
        {subtitle}
      </Text>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  glassCard: {
    borderRadius: 20,
    borderCurve: 'continuous',
    padding: 16,
    overflow: 'hidden',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
    color: 'rgba(0, 0, 0, 0.85)',
  },
  titleDark: {
    color: 'rgba(255, 255, 255, 0.92)',
  },
  subtitle: {
    fontSize: 15,
    letterSpacing: -0.23,
    marginTop: 4,
    color: 'rgba(0, 0, 0, 0.55)',
  },
  subtitleDark: {
    color: 'rgba(255, 255, 255, 0.55)',
  },
});
```

### expo-blur BlurView (iOS 18 and earlier / fallback)

```typescript
import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';

function BlurCard({ title, subtitle }: { title: string; subtitle: string }) {
  const scheme = useColorScheme();

  return (
    <BlurView
      intensity={80}
      // systemMaterial maps to UIBlurEffectStyle on iOS
      tint={scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterial'}
      style={styles.blurCard}
    >
      <Text style={[styles.title, { color: scheme === 'dark' ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.85)' }]}>
        {title}
      </Text>
      <Text style={[styles.subtitle, { color: scheme === 'dark' ? 'rgba(255,255,255,0.55)' : 'rgba(0,0,0,0.55)' }]}>
        {subtitle}
      </Text>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  blurCard: {
    borderRadius: 20,
    borderCurve: 'continuous',
    padding: 16,
    overflow: 'hidden',
    // Add subtle border for definition against backgrounds
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(120, 120, 128, 0.2)',
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    letterSpacing: -0.41,
  },
  subtitle: {
    fontSize: 15,
    letterSpacing: -0.23,
    marginTop: 4,
  },
});
```

### Adaptive Glass (GlassView with BlurView fallback)

```typescript
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Use GlassView on iOS 26+, BlurView on earlier versions
const isLiquidGlassAvailable =
  Platform.OS === 'ios' &&
  parseInt(Platform.Version as string, 10) >= 26;

function AdaptiveGlass({ children, style }: {
  children: React.ReactNode;
  style?: object;
}) {
  const scheme = useColorScheme();

  if (isLiquidGlassAvailable) {
    return (
      <GlassView style={style}>
        {children}
      </GlassView>
    );
  }

  return (
    <BlurView
      intensity={80}
      tint={scheme === 'dark' ? 'systemMaterialDark' : 'systemMaterial'}
      style={style}
    >
      {children}
    </BlurView>
  );
}
```

### Glass Usage Rules

- Glass works only over content with visual variation (images, gradients, colored backgrounds).
- Glass over a flat white background looks like frosted glass — use `subtle` tint for this.
- Never place glass over glass — the double-blur effect is visually noisy.
- Glass elements should be legible at all times — ensure sufficient contrast for text on top.
- On Android, use a semi-transparent background as fallback (no blur available without custom native code).

---

## 4. Pull-to-Refresh

Custom pull-to-refresh with rubber banding and haptic feedback at the trigger threshold.

```typescript
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  cancelAnimation,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { StyleSheet, View, ActivityIndicator } from 'react-native';
import * as Haptics from 'expo-haptics';
import { scheduleOnRN } from 'react-native-worklets';

const TRIGGER_THRESHOLD = 80;    // px to pull before triggering refresh
const MAX_PULL = 120;            // max visible pull distance

function rubberBand(offset: number, dimension: number, constant = 0.55): number {
  'worklet';
  const absOffset = Math.abs(offset);
  const sign = offset < 0 ? -1 : 1;
  return sign * (absOffset * dimension) / (dimension + absOffset * constant);
}

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

function PullToRefresh({ onRefresh, children }: PullToRefreshProps) {
  const pullDistance = useSharedValue(0);
  const isRefreshing = useSharedValue(false);
  const hasTriggered = useSharedValue(false);

  const handleRefresh = () => {
    scheduleOnRN(async () => {
      await onRefresh();
      pullDistance.value = withSpring(0, { damping: 20, stiffness: 300 });
      isRefreshing.value = false;
    });
  };

  const panGesture = Gesture.Pan()
    .onBegin(() => {
      cancelAnimation(pullDistance);
      hasTriggered.value = false;
    })
    .onUpdate((event) => {
      if (isRefreshing.value) return;

      if (event.translationY > 0) {
        // Apply rubber banding — resistance increases as user pulls more
        pullDistance.value = rubberBand(event.translationY, MAX_PULL * 2);

        // Fire haptic once when crossing threshold
        if (pullDistance.value >= TRIGGER_THRESHOLD && !hasTriggered.value) {
          hasTriggered.value = true;
          scheduleOnRN(() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          });
        }
      }
    })
    .onEnd(() => {
      if (isRefreshing.value) return;

      if (pullDistance.value >= TRIGGER_THRESHOLD) {
        // Trigger refresh — snap to loading position
        isRefreshing.value = true;
        pullDistance.value = withSpring(TRIGGER_THRESHOLD, { damping: 20, stiffness: 300 });
        handleRefresh();
      } else {
        // Not enough pull — snap back
        pullDistance.value = withSpring(0, { damping: 22, stiffness: 300 });
      }
    });

  const contentStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: pullDistance.value }],
  }));

  const indicatorStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      pullDistance.value,
      [0, TRIGGER_THRESHOLD * 0.5, TRIGGER_THRESHOLD],
      [0, 0.3, 1],
      Extrapolation.CLAMP,
    );
    const scale = interpolate(
      pullDistance.value,
      [0, TRIGGER_THRESHOLD],
      [0.5, 1],
      Extrapolation.CLAMP,
    );
    return { opacity, transform: [{ scale }] };
  });

  return (
    <GestureDetector gesture={panGesture}>
      <View style={{ flex: 1 }}>
        {/* Refresh indicator sits behind content */}
        <Animated.View style={[styles.refreshIndicator, indicatorStyle]}>
          <ActivityIndicator />
        </Animated.View>

        {/* Main content translates down during pull */}
        <Animated.View style={[{ flex: 1 }, contentStyle]}>
          {children}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  refreshIndicator: {
    position: 'absolute',
    top: 16,
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 0,
  },
});
```

### Rules

- Haptic fires exactly once when the user crosses the threshold, not on release.
- Use `rubberBand()` for the pull resistance — same formula as overscroll.
- The loading state holds the content at `TRIGGER_THRESHOLD` height while refreshing.
- Always reset `pullDistance` to 0 with a spring on refresh completion.
- Minimum `TRIGGER_THRESHOLD`: 60pt. Maximum useful threshold: 100pt.

---

## 5. Swipe Actions

Use `ReanimatedSwipeable` from `react-native-gesture-handler` for swipeable list items.

```typescript
import { ReanimatedSwipeable } from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { StyleSheet, Text, Pressable, View } from 'react-native';
import * as Haptics from 'expo-haptics';

const ITEM_HEIGHT = 68;
const ACTION_WIDTH = 80;
const FULL_SWIPE_VELOCITY = 600;   // velocity threshold for full-swipe-to-delete

// Action component that renders behind the list item
function DeleteAction({
  dragX,
  onDelete,
}: {
  dragX: Animated.SharedValue<number>;
  onDelete: () => void;
}) {
  const actionStyle = useAnimatedStyle(() => {
    // Scale the icon as it's revealed
    const scale = interpolate(
      dragX.value,
      [-ACTION_WIDTH * 2, -ACTION_WIDTH, 0],
      [1.2, 1, 0.8],
      Extrapolation.CLAMP,
    );
    return { transform: [{ scale }] };
  });

  return (
    <Pressable
      style={styles.deleteAction}
      onPress={onDelete}
    >
      <Animated.Text style={[styles.deleteIcon, actionStyle]}>
        🗑
      </Animated.Text>
    </Pressable>
  );
}

interface SwipeableRowProps {
  label: string;
  onDelete: () => void;
}

function SwipeableRow({ label, onDelete }: SwipeableRowProps) {
  const handleDelete = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    onDelete();
  };

  const renderRightActions = (
    progress: Animated.SharedValue<number>,
    dragX: Animated.SharedValue<number>,
  ) => (
    <DeleteAction dragX={dragX} onDelete={handleDelete} />
  );

  return (
    <ReanimatedSwipeable
      renderRightActions={renderRightActions}
      rightThreshold={ACTION_WIDTH}      // swipe this far to open actions
      overshootRight={false}
      friction={2}                        // resistance on overswipe
      onSwipeableWillOpen={(direction) => {
        if (direction === 'right') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        }
      }}
    >
      <View style={styles.row}>
        <Text style={styles.label}>{label}</Text>
      </View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: ITEM_HEIGHT,
    paddingHorizontal: 16,
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  label: {
    fontSize: 17,
    letterSpacing: -0.41,
  },
  deleteAction: {
    width: ACTION_WIDTH,
    height: ITEM_HEIGHT,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteIcon: {
    fontSize: 22,
  },
});
```

### Full Swipe to Delete

```typescript
// Full swipe dismiss (velocity-based)
<ReanimatedSwipeable
  renderRightActions={renderRightActions}
  rightThreshold={ACTION_WIDTH}
  // When swiped past half the screen width with enough velocity — delete
  onSwipeableOpen={(direction, swipeable) => {
    if (direction === 'right') {
      // Full open — user clearly intends to delete
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // Collapse row with animation, then call onDelete
      swipeable.close();
      setTimeout(onDelete, 300);
    }
  }}
/>
```

### Swipe Action Patterns

| Action type       | Side   | Color             | Icon  |
|-------------------|--------|-------------------|-------|
| Delete            | Right  | `#FF3B30` (red)   | trash |
| Archive           | Right  | `#FF9500` (orange)| archive |
| Flag              | Right  | `#FF9500` (orange)| flag  |
| Mark as read      | Left   | `#007AFF` (blue)  | envelope |
| More options      | Left   | `#8E8E93` (gray)  | ellipsis |
| Pin               | Left   | `#FF9500` (orange)| pin   |

### Rules

- Reveal actions on swipe right (trailing). Positive actions go left (leading).
- Destructive actions (delete, archive) are always red and on the right.
- Haptic on action reveal (`impactAsync Medium`) and on commit (`notificationAsync Warning` for destructive).
- `rightThreshold` should be 60–80pt. Never less than 44pt (touch target).
- Always show a confirmation for full-swipe-to-delete — never delete instantly without undo.
- `friction={2}` is the default — decrease for snappier open, increase for more resistance.
