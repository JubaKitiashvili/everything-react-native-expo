---
name: coding-standards
description: Enforce React Native coding standards as an actionable workflow
---

# Coding Standards Enforcement

You are enforcing coding standards for a React Native project. This skill turns passive rules into an active audit workflow.

## When to Use This Skill

Invoke when:
- Starting work on a new codebase
- Reviewing code for standards compliance
- Setting up a new project's conventions

## Audit Process

### Step 1: Detect Project Configuration

Read the project's `.claude/rules/` to understand which standards apply:
- `common/` rules always apply
- `expo/` rules if Expo managed project
- `bare-rn/` rules if bare React Native
- `native-ios/` if iOS native code present
- `native-android/` if Android native code present

### Step 2: Scan for Violations

Check each category systematically:

**Component Structure:**
- [ ] Functional components only (no class components)
- [ ] Named exports (not default exports)
- [ ] Props interface defined above component
- [ ] Proper TypeScript types (no `any`)

**Styling:**
- [ ] Consistent styling approach (StyleSheet.create, NativeWind, or project's chosen styling system)
- [ ] Consistent color usage (design tokens, not hex literals)
- [ ] Responsive design using the project's styling system
- [ ] Dark mode support via appropriate mechanism

**State Management:**
- [ ] Zustand for client state (no Redux, no Context for global state)
- [ ] TanStack Query for server state (no manual fetch+useState)
- [ ] No prop drilling beyond 2 levels
- [ ] Computed values derived, not stored

**Navigation:**
- [ ] Expo Router file-based routing
- [ ] Typed routes using `href` type safety
- [ ] Proper layout files (`_layout.tsx`)
- [ ] Deep linking configured

**Performance:**
- [ ] `FlashList` for lists (not `FlatList`)
- [ ] `expo-image` for images (not `Image`)
- [ ] Memoization where appropriate (`useMemo`, `useCallback`)
- [ ] Animations on UI thread (Reanimated worklets)

**Testing:**
- [ ] Tests exist for new code
- [ ] Tests use RNTL (not Enzyme)
- [ ] Tests test behavior, not implementation
- [ ] Mock at boundaries only

### Step 3: Generate Report

```
## Coding Standards Audit

### Summary
- Files scanned: N
- Violations found: N
- Auto-fixable: N

### Violations by Category
[Category]: [count]
  - [file:line] — [description]

### Recommendations
[Prioritized list of fixes]
```

### Step 4: Apply Fixes

For auto-fixable violations (imports, styling patterns), offer to fix them. For manual fixes (architecture changes), provide specific guidance.
