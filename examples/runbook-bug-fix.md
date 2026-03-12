# Runbook: Diagnosing and Fixing a Bug

> Example: Users report the app crashes when scrolling a long list on Android devices with 3GB RAM.

## Overview

This runbook follows a TDD approach: reproduce, write a failing test, fix, review, and validate performance. It includes escalation paths for platform-specific issues that require native debugging.

**Agents involved:**
- tdd-guide -- writes failing test before the fix
- senior-developer -- implements the fix
- code-reviewer -- reviews the fix
- performance-profiler -- validates no regressions
- native-bridge-builder -- escalation for platform-specific native issues

---

## Phase 1: Reproduce and Isolate

### 1.1 Gather Information

Collect from the bug report:

```
Bug: App crashes on Android when scrolling user list
Affected: Android devices with 3GB RAM
Not affected: iOS, Android with 6GB+ RAM
Frequency: Consistent after scrolling ~200 items
Error: OOM (Out of Memory) in logcat
Screen: features/users/screens/UserListScreen.tsx
```

### 1.2 Reproduce Locally

```bash
# Run on a low-memory Android emulator
emulator -avd Pixel_4a_3GB -memory 3072

# Enable performance monitor in dev menu
# Navigate to the user list screen
# Scroll through 200+ items and observe memory graph
```

### 1.3 Isolate the Cause

```
/debug features/users/screens/UserListScreen.tsx
```

performance-profiler analyzes the screen:

```markdown
## Debug Report: UserListScreen

### Memory Analysis
| Point              | Memory | Delta  |
|--------------------|--------|--------|
| Screen mount       | 85MB   | --     |
| After 50 items     | 120MB  | +35MB  |
| After 100 items    | 180MB  | +60MB  |
| After 200 items    | 290MB  | +110MB |
| OOM threshold (3GB)| 300MB  | CRASH  |

### Root Cause
UserListScreen uses `ScrollView` with `.map()` to render all items at once.
Every item includes a full-resolution avatar image (~2MB in memory each).
With 200+ items, this consumes ~400MB of image memory alone.

### Contributing Factors
1. `ScrollView` + `.map()` instead of `FlatList`/`FlashList` -- no virtualization
2. Avatar images loaded at full resolution (1024x1024) displayed at 48x48
3. No image caching -- images re-decode on every mount
```

---

## Phase 2: tdd-guide Writes Failing Test First

```
/tdd features/users --failing-test
```

tdd-guide writes a test that captures the expected behavior:

```typescript
// features/users/__tests__/UserListScreen.test.tsx
import { render, screen } from '@testing-library/react-native';
import { UserListScreen } from '../screens/UserListScreen';

describe('UserListScreen - Memory Safety', () => {
  it('uses FlashList for virtualized rendering', () => {
    const { UNSAFE_getByType } = render(
      <UserListScreen />,
      { wrapper: TestProviders }
    );

    // FlashList should be used instead of ScrollView
    // This import confirms the component uses virtualization
    const FlashList = require('@shopify/flash-list').FlashList;
    expect(UNSAFE_getByType(FlashList)).toBeTruthy();
  });

  it('renders only visible items plus buffer', () => {
    // With 500 items, only ~10-15 should be rendered at once
    const { getAllByTestId } = render(
      <UserListScreen users={generate500Users()} />,
      { wrapper: TestProviders }
    );

    const renderedItems = getAllByTestId('user-list-item');
    expect(renderedItems.length).toBeLessThan(30);
  });

  it('avatar images use thumbnail size not full resolution', () => {
    render(
      <UserListScreen users={[mockUserWithAvatar]} />,
      { wrapper: TestProviders }
    );

    const avatar = screen.getByLabelText(`${mockUserWithAvatar.name}'s avatar`);
    // Image source should request thumbnail size
    expect(avatar.props.source.uri).toContain('size=96');
  });
});
```

Running these tests now:

```
FAIL  features/users/__tests__/UserListScreen.test.tsx
  UserListScreen - Memory Safety
    x uses FlashList for virtualized rendering (FAILED)
    x renders only visible items plus buffer (FAILED)
    x avatar images use thumbnail size not full resolution (FAILED)
```

All three tests fail -- confirming the bug exists and is testable. This is the "Red" step.

**Handoff:** tdd-guide passes the failing tests to senior-developer.

---

## Phase 3: senior-developer Implements Fix

senior-developer addresses each root cause:

### Fix 1: Replace ScrollView with FlashList

```typescript
// BEFORE (broken)
import { ScrollView, View, Text, Image } from 'react-native';

export const UserListScreen = () => {
  const { data: users } = useUsers();

  return (
    <ScrollView>
      {users?.map((user) => (
        <View key={user.id}>
          <Image source={{ uri: user.avatarUrl }} style={styles.avatar} />
          <Text>{user.name}</Text>
        </View>
      ))}
    </ScrollView>
  );
};
```

```typescript
// AFTER (fixed)
import { FlashList } from '@shopify/flash-list';
import { UserListItem } from '../components/UserListItem';

export const UserListScreen = () => {
  const { data: users, isLoading, refetch } = useUsers();

  const renderItem = useCallback(({ item }: { item: User }) => (
    <UserListItem user={item} />
  ), []);

  const keyExtractor = useCallback((item: User) => item.id, []);

  if (isLoading) return <LoadingSkeleton />;

  return (
    <FlashList
      data={users}
      renderItem={renderItem}
      keyExtractor={keyExtractor}
      estimatedItemSize={72}
      onRefresh={refetch}
      refreshing={isLoading}
      testID="user-flash-list"
    />
  );
};
```

### Fix 2: Use Thumbnail-Sized Avatars

```typescript
// features/users/components/UserListItem.tsx
import { Image } from 'expo-image';

export const UserListItem = React.memo(({ user }: { user: User }) => {
  // Request 96px thumbnail instead of full 1024px image
  const thumbnailUrl = `${user.avatarUrl}?size=96`;

  return (
    <Pressable
      style={styles.container}
      testID="user-list-item"
      accessibilityRole="button"
      accessibilityLabel={`${user.name}`}
    >
      <Image
        source={{ uri: thumbnailUrl }}
        style={styles.avatar}
        contentFit="cover"
        cachePolicy="memory-disk"
        recyclingKey={user.id}
        accessibilityLabel={`${user.name}'s avatar`}
      />
      <View style={styles.info}>
        <Text style={styles.name}>{user.name}</Text>
        <Text style={styles.subtitle}>{user.email}</Text>
      </View>
    </Pressable>
  );
});
```

### Fix 3: Commit

```bash
git add -A && git commit -m "fix: replace ScrollView with FlashList and use thumbnail avatars to prevent OOM on low-memory Android"
```

### Run Tests Again (Green)

```
PASS  features/users/__tests__/UserListScreen.test.tsx
  UserListScreen - Memory Safety
    ✓ uses FlashList for virtualized rendering (12ms)
    ✓ renders only visible items plus buffer (45ms)
    ✓ avatar images use thumbnail size not full resolution (8ms)
```

All three tests pass. This is the "Green" step.

---

## Phase 4: code-reviewer Reviews Fix

```
/code-review features/users
```

```markdown
## Code Review: UserListScreen OOM Fix

### Critical (must fix)
(none)

### Warning (should fix)
- [ ] UserListItem.tsx:14 — `React.memo` should include a custom comparator.
  Default shallow compare will re-render if the user object reference changes
  (common with TanStack Query refetches). Add:
  `(prev, next) => prev.user.id === next.user.id && prev.user.avatarUrl === next.user.avatarUrl`

### Suggestion (nice to have)
- [ ] UserListScreen.tsx — Consider adding `FlashList` prop `drawDistance={200}` to
  pre-render items slightly ahead of the scroll position for smoother feel.
- [ ] UserListItem.tsx — Add `placeholder` prop to expo-image for a blurhash
  placeholder while thumbnails load.

### Positive
- Excellent fix: FlashList with estimatedItemSize is the correct solution for large lists.
- Good use of expo-image with `cachePolicy="memory-disk"` and `recyclingKey`.
- `useCallback` on renderItem and keyExtractor prevents unnecessary re-renders.

### Evidence Checklist
- [x] All tests pass
- [x] Fix addresses root cause (virtualization + image sizing)
- [x] No console.log or debug code
- [ ] Performance validated (pending profiler)
```

senior-developer adds the custom memo comparator. code-reviewer approves.

---

## Phase 5: performance-profiler Validates

```
/perf features/users/screens/UserListScreen.tsx
```

```markdown
## Performance Report: UserListScreen Post-Fix

### Memory (Android 3GB emulator, 500 items)
| Point              | Before  | After   | Delta    |
|--------------------|---------|---------|----------|
| Screen mount       | 85MB    | 85MB    | --       |
| After 50 items     | 120MB   | 92MB    | -28MB    |
| After 100 items    | 180MB   | 94MB    | -86MB    |
| After 200 items    | 290MB   | 96MB    | -194MB   |
| After 500 items    | OOM     | 98MB    | FIXED    |

### Rendering
| Metric           | Before | After | Target | Status |
|------------------|--------|-------|--------|--------|
| JS FPS (scroll)  | 32     | 59    | >55    | PASS   |
| Blank area (ms)  | N/A    | 120ms | <250ms | PASS   |
| Visible items    | ALL    | 12    | --     | PASS   |

### Verdict: PASS
Memory usage now stays flat regardless of list size.
JS FPS improved from 32 to 59 due to virtualization.
```

---

## Escalation Paths

### When the Bug is Platform-Specific (Native Layer)

If the bug cannot be reproduced in JS or involves native crashes, escalate to native-bridge-builder.

#### Scenario A: Native crash in a third-party module

```
/native-module debug react-native-fast-image

native-bridge-builder investigates:
1. Reads the native crash log from logcat / Xcode
2. Identifies the crash is in the native image decoder
3. Checks if the module version is compatible with the current RN version
4. Provides a fix or recommends migrating to expo-image
```

#### Scenario B: Platform-specific behavior difference

```
Symptom: Gesture handler works on iOS but not on Android
Escalation: native-bridge-builder

native-bridge-builder checks:
1. Android gesture handler setup in MainActivity (required for RN Gesture Handler)
2. Threading model difference — Android gestures run on UI thread
3. Provides platform-specific fix in the Android native layer
```

#### Scenario C: Build failure after fix

```
Symptom: Fix works in dev but release build crashes
Escalation: native-bridge-builder + expo-config-resolver

Steps:
1. expo-config-resolver checks build configuration (ProGuard rules, Hermes settings)
2. native-bridge-builder checks if the native module needs ProGuard keep rules
3. Fix applied to android/app/proguard-rules.pro
```

### Escalation Decision Tree

```
Bug reported
  |
  +-- Can reproduce in JS? (React DevTools, console logs)
  |     Yes --> tdd-guide + senior-developer (this runbook)
  |     No  --> Continue below
  |
  +-- Native crash log available? (logcat, Xcode crash report)
  |     Yes --> native-bridge-builder investigates native layer
  |     No  --> Continue below
  |
  +-- Build/config issue? (EAS Build failure, missing native module)
  |     Yes --> expo-config-resolver + native-bridge-builder
  |     No  --> Continue below
  |
  +-- Performance issue? (slow but not crashing)
        Yes --> performance-profiler deep analysis
        No  --> Manual investigation, gather more data
```

---

## Summary Checklist

| Phase | Agent | Action | Status |
|-------|-------|--------|--------|
| Reproduce | performance-profiler | Memory analysis, root cause | Complete |
| Failing test | tdd-guide | 3 tests written (Red) | Complete |
| Fix | senior-developer | FlashList + thumbnail avatars | Complete |
| Tests pass | tdd-guide | 3/3 green (Green) | Complete |
| Review | code-reviewer | Approved with memo fix | Complete |
| Validate | performance-profiler | Memory flat, 59 FPS | Complete |

---

## Commands Used

| Command | What It Triggered |
|---------|-------------------|
| `/debug` | performance-profiler diagnosis |
| `/tdd --failing-test` | tdd-guide writes Red tests |
| `/code-review` | code-reviewer evidence-based review |
| `/perf` | performance-profiler regression check |
| `/native-module debug` | native-bridge-builder (escalation only) |
