# Workflow: Upgrading React Native / Expo SDK

> Example: Upgrading from Expo SDK 52 to SDK 53.

## Overview

This workflow coordinates 5 agents to perform a safe, measured SDK upgrade with rollback capability at every step.

**Agents involved:**
- upgrade-assistant -- breaking change analysis, dependency matrix, migration steps
- architect -- architecture impact review
- senior-developer -- implements migration changes
- tdd-guide -- verifies test suite integrity
- performance-profiler -- checks for regressions

---

## Pre-Requisites

Before starting any upgrade:

```bash
# Ensure clean working tree
git status  # must be clean

# Create upgrade branch
git checkout -b feat/expo-sdk-53-upgrade

# Snapshot current state
git tag pre-upgrade-sdk52
```

---

## Step 1: upgrade-assistant Analyzes Breaking Changes

```
/upgrade Expo SDK 52 to SDK 53
```

upgrade-assistant reads changelogs and produces a structured upgrade plan:

```markdown
## Upgrade Plan: Expo SDK 52 -> SDK 53

### Risk Level: MEDIUM

Reason: Reanimated v4 changes worklet API, Expo Router v5 changes layout conventions.

### Breaking Changes
1. react-native-reanimated v3 -> v4
   - `useAnimatedStyle` callback must return a plain object (no nested shared values)
   - Impact: 8 files in features/animations/
   - Fix: Flatten shared value reads inside the callback

2. expo-router v4 -> v5
   - `<Stack.Screen options>` no longer accepts function form
   - Impact: 12 layout files in app/
   - Fix: Move dynamic options to `useNavigation().setOptions()` in useEffect

3. expo-image v2 -> v3
   - `cachePolicy` renamed to `cacheType`
   - Impact: 15 files
   - Fix: Find-and-replace (codemod available)

### Dependency Updates
| Package                      | Current  | Target   | Action       |
|------------------------------|----------|----------|--------------|
| expo                         | 52.0.0   | 53.0.0   | Update       |
| react-native                 | 0.76.x   | 0.78.x   | Auto-updated |
| react-native-reanimated      | 3.16.1   | 4.0.0    | Update       |
| expo-router                  | 4.1.0    | 5.0.0    | Update       |
| expo-image                   | 2.0.0    | 3.0.0    | Update       |
| @tanstack/react-query        | 5.x      | 5.x      | No change    |

### Migration Steps
1. [ ] Update Expo SDK
2. [ ] Run npx expo install --fix for compatible versions
3. [ ] Apply Reanimated v4 migration
4. [ ] Apply Expo Router v5 migration
5. [ ] Run expo-image codemod
6. [ ] Regenerate native projects
7. [ ] Run full test suite
8. [ ] Verify builds (iOS + Android)
9. [ ] Performance baseline comparison
```

**Handoff:** upgrade-assistant passes the plan to architect for impact review.

---

## Step 2: architect Reviews Architecture Impact

architect evaluates how the breaking changes affect the overall system design:

```markdown
## Architecture Impact: SDK 53 Upgrade

### Navigation (Expo Router v5)
- 12 layout files need migration from function-form options to useEffect pattern
- Deep link structure is unchanged -- no impact on external integrations
- Tab navigator configuration is compatible

### Animation Layer (Reanimated v4)
- 8 animation files need worklet API updates
- Recommendation: Extract all animated styles into a shared animations/ module
  during this migration to reduce future upgrade surface area
- Gesture Handler is compatible -- no changes needed

### Data Layer
- No impact. TanStack Query and Zustand are version-independent of SDK.

### Risk Areas
1. Reanimated worklet changes could introduce subtle animation glitches.
   Recommend visual regression testing on both platforms.
2. Expo Router layout migration touches navigation skeleton.
   Recommend testing every deep link after migration.
```

**Handoff:** architect provides prioritized implementation order to senior-developer.

---

## Step 3: senior-developer Implements Changes

senior-developer follows the migration steps in order, committing after each logical change:

### Step 3a: SDK Update

```bash
# Update core SDK
npx expo install expo@53

# Fix all dependent packages to compatible versions
npx expo install --fix

# Commit checkpoint
git add -A && git commit -m "chore: update Expo SDK 52 -> 53 and fix dependencies"
```

**Rollback point:** `git revert HEAD`

### Step 3b: Reanimated v4 Migration

```typescript
// BEFORE (v3)
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
  opacity: opacity,  // shared value passed directly -- no longer valid
}));

// AFTER (v4)
const animatedStyle = useAnimatedStyle(() => ({
  transform: [{ translateX: offset.value }],
  opacity: opacity.value,  // must read .value inside callback
}));
```

```bash
git add -A && git commit -m "refactor: migrate Reanimated v3 -> v4 worklet API"
```

**Rollback point:** `git revert HEAD`

### Step 3c: Expo Router v5 Migration

```typescript
// BEFORE (v4) -- function-form options
<Stack.Screen
  name="profile"
  options={({ route }) => ({ title: route.params.name })}
/>

// AFTER (v5) -- static options + useEffect for dynamic
<Stack.Screen name="profile" options={{ title: 'Profile' }} />

// Inside ProfileScreen:
const navigation = useNavigation();
const { name } = useLocalSearchParams<{ name: string }>();
useEffect(() => {
  navigation.setOptions({ title: name });
}, [name, navigation]);
```

```bash
git add -A && git commit -m "refactor: migrate Expo Router v4 -> v5 layout options"
```

**Rollback point:** `git revert HEAD`

### Step 3d: expo-image Codemod

```bash
# Automated find-and-replace
npx jscodeshift -t node_modules/expo-image/codemods/cache-policy.js src/

git add -A && git commit -m "refactor: apply expo-image v3 cachePolicy -> cacheType codemod"
```

**Rollback point:** `git revert HEAD`

### Step 3e: Regenerate Native Projects

```bash
npx expo prebuild --clean
cd ios && pod install --repo-update && cd ..

git add -A && git commit -m "chore: regenerate native projects for SDK 53"
```

**Rollback point:** `git checkout pre-upgrade-sdk52 -- ios/ android/`

---

## Step 4: tdd-guide Verifies Test Suite

```
/tdd --verify
```

tdd-guide runs the full test suite and reports:

```markdown
## Test Suite Verification: Post-Upgrade

### Results
- Total tests: 342
- Passed: 338
- Failed: 4
- Skipped: 0

### Failures
1. features/animations/__tests__/FadeIn.test.tsx
   - `useAnimatedStyle` mock needs update for v4 API
   - Fix: Update mock to expect .value reads

2. features/animations/__tests__/SlidePanel.test.tsx
   - Same Reanimated mock issue

3. app/__tests__/layout.test.tsx (2 tests)
   - Expo Router v5 layout rendering changed
   - Fix: Update test to use new options pattern

### Action Required
Update 3 test files to match new API signatures. The failures are
test-level issues, not implementation bugs.
```

senior-developer fixes the 4 failing tests:

```bash
git add -A && git commit -m "test: update test mocks for Reanimated v4 and Expo Router v5"
```

tdd-guide re-runs: **342/342 passing. Coverage: 84% lines, 72% branches.**

---

## Step 5: performance-profiler Checks for Regressions

```
/perf --baseline-comparison
```

performance-profiler compares pre-upgrade and post-upgrade metrics:

```markdown
## Performance Report: SDK 53 Upgrade

### Comparison (SDK 52 vs SDK 53)
| Metric              | SDK 52  | SDK 53  | Delta   | Status |
|---------------------|---------|---------|---------|--------|
| Cold start TTI      | 2.8s    | 2.5s    | -300ms  | BETTER |
| JS FPS (scroll)     | 57      | 58      | +1      | STABLE |
| JS bundle size      | 1.38MB  | 1.41MB  | +30KB   | WATCH  |
| Memory (idle)       | 84MB    | 82MB    | -2MB    | BETTER |
| Memory (navigation) | +12MB   | +11MB   | -1MB    | BETTER |

### Notes
- Cold start improvement likely from Hermes engine update in RN 0.78
- Bundle size increase of 30KB is from Reanimated v4 (larger runtime).
  Still well under 1.5MB target.
- No memory leaks detected in 50-screen navigation stress test.

### Verdict: PASS -- No regressions detected.
```

---

## Rollback Plan

If issues are found after merging, rollback is straightforward because each step was committed atomically:

### Full Rollback

```bash
# Return to pre-upgrade state
git checkout pre-upgrade-sdk52
git checkout -b fix/rollback-sdk53

# Restore native projects
npx expo prebuild --clean
cd ios && pod install && cd ..
```

### Partial Rollback (single breaking change)

```bash
# Find the specific commit to revert
git log --oneline

# Revert only the problematic migration step
git revert <commit-hash>

# Rebuild native projects
npx expo prebuild --clean
```

### Emergency Rollback (production)

```bash
# If already deployed via EAS Update:
eas update --branch production --message "Rollback SDK 53"

# Point to the last known good update group:
eas update:rollback --branch production
```

---

## Final Checklist

| Step | Agent | Status |
|------|-------|--------|
| Breaking change analysis | upgrade-assistant | Complete |
| Architecture impact | architect | No structural issues |
| SDK + dependency update | senior-developer | 5 atomic commits |
| Reanimated v4 migration | senior-developer | 8 files updated |
| Expo Router v5 migration | senior-developer | 12 files updated |
| expo-image codemod | senior-developer | 15 files updated |
| Test suite verification | tdd-guide | 342/342 passing |
| Performance comparison | performance-profiler | No regressions |

The upgrade is ready for PR and merge.

---

## Commands Used

| Command | What It Triggered |
|---------|-------------------|
| `/upgrade` | upgrade-assistant analysis + migration plan |
| `/plan` | architect architecture impact review |
| `/tdd --verify` | tdd-guide full test suite run |
| `/perf --baseline-comparison` | performance-profiler regression check |
