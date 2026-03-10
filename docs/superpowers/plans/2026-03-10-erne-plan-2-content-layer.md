# ERNE Plan 2: Content Layer — Agents, Rules, Commands, Contexts & MCP Configs

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create all content markdown and JSON files that define ERNE's behavior — 8 agents, 25 rules (across 5 layers), 16 commands, 3 contexts, 10 MCP configs, and 3 example templates.

**Architecture:** All content files follow Claude Code's native format. Agents use `.claude/agents/` frontmatter (`name`, `description`). Rules use `.claude/rules/` frontmatter (`description`, `globs`, `alwaysApply`). Commands use `.claude/commands/` frontmatter (`name`, `description`). Contexts use `.claude/contexts/` frontmatter. MCP configs are JSON files referencing external servers.

**Tech Stack:** Markdown (content files), JSON (MCP configs), no dependencies beyond Plan 1's foundation.

**Depends on:** Plan 1 (hooks infrastructure must exist for hook-referencing commands like `/retrospective`)

---

## File Structure

### Create:

```
agents/architect.md
agents/code-reviewer.md
agents/tdd-guide.md
agents/performance-profiler.md
agents/native-bridge-builder.md
agents/expo-config-resolver.md
agents/ui-designer.md
agents/upgrade-assistant.md

rules/common/coding-style.md
rules/common/patterns.md
rules/common/performance.md
rules/common/testing.md
rules/common/security.md
rules/common/navigation.md
rules/common/state-management.md
rules/common/git-workflow.md
rules/common/development-workflow.md
rules/expo/coding-style.md
rules/expo/patterns.md
rules/expo/security.md
rules/expo/testing.md
rules/bare-rn/coding-style.md
rules/bare-rn/patterns.md
rules/bare-rn/security.md
rules/bare-rn/testing.md
rules/native-ios/coding-style.md
rules/native-ios/patterns.md
rules/native-ios/security.md
rules/native-ios/testing.md
rules/native-android/coding-style.md
rules/native-android/patterns.md
rules/native-android/security.md
rules/native-android/testing.md

commands/plan.md
commands/code-review.md
commands/tdd.md
commands/build-fix.md
commands/perf.md
commands/upgrade.md
commands/native-module.md
commands/navigate.md
commands/animate.md
commands/deploy.md
commands/component.md
commands/debug.md
commands/learn.md
commands/quality-gate.md
commands/retrospective.md
commands/setup-device.md

contexts/dev.md
contexts/review.md
contexts/vibe.md

mcp-configs/agent-device.json
mcp-configs/github.json
mcp-configs/supabase.json
mcp-configs/firebase.json
mcp-configs/figma.json
mcp-configs/sentry.json
mcp-configs/expo-api.json
mcp-configs/appstore-connect.json
mcp-configs/play-console.json
mcp-configs/memory.json

examples/CLAUDE.md.expo-managed
examples/CLAUDE.md.bare-rn
examples/CLAUDE.md.monorepo
```

### Modify:

None (fresh content files).

---

## Chunk 1: Agents

### Task 1: Core Development Agents (architect, code-reviewer, tdd-guide, performance-profiler)

**Files:**
- Create: `agents/architect.md`, `agents/code-reviewer.md`, `agents/tdd-guide.md`, `agents/performance-profiler.md`

- [ ] **Step 1: Create agents/architect.md**

```markdown
---
name: architect
description: Feature decomposition, navigation design, state management selection, API layer planning. Triggered by /plan and /navigate.
---

You are the ERNE Architect agent — a senior React Native/Expo systems designer.

## Your Role

Design feature architectures, navigation flows, and system structure for React Native and Expo applications.

## Capabilities

- **Feature decomposition**: Break complex features into implementable units with clear interfaces
- **Navigation design**: Design Expo Router file-based layouts, tab structures, modal patterns, deep linking
- **State management selection**: Recommend Zustand (client), TanStack Query (server), or Jotai (atomic) based on requirements
- **API layer planning**: Design data fetching patterns, caching strategies, optimistic updates
- **Monorepo structure**: Organize shared packages, platform-specific code, config management

## Process

1. **Understand the requirement** — Ask clarifying questions about scope, platforms, existing codebase
2. **Analyze constraints** — Check existing navigation structure, state management, API patterns
3. **Design the architecture** — Produce a clear plan with:
   - File/folder structure for the feature
   - Component hierarchy (screens, containers, presentational)
   - Data flow diagram (state sources, API calls, subscriptions)
   - Navigation changes (new routes, params, deep links)
   - Dependencies needed (with justification)
4. **Output actionable tasks** — Numbered implementation steps ready for the tdd-guide agent

## Guidelines

- Prefer colocation: keep feature files together (`features/auth/`, not scattered)
- Use typed routes with Expo Router (`href` type safety)
- Recommend barrel-file-free imports (direct path imports)
- Design for offline-first when applicable (TanStack Query + persistence)
- Consider platform differences upfront (iOS vs Android UX conventions)
- Account for the hook profile — suggest which hooks will run on the new code

## Output Format

```markdown
# Architecture: [Feature Name]

## Overview
[1-2 sentence summary]

## File Structure
[tree of new/modified files]

## Component Design
[hierarchy and responsibilities]

## Data Flow
[state management, API calls, subscriptions]

## Navigation
[route changes, params, deep links]

## Implementation Tasks
1. [Task with clear deliverable]
2. ...
```
```

- [ ] **Step 2: Create agents/code-reviewer.md**

```markdown
---
name: code-reviewer
description: Re-render detection, RN anti-pattern detection, platform parity, Expo SDK validation, accessibility audit. Triggered by /code-review, /quality-gate, /deploy.
---

You are the ERNE Code Reviewer agent — a meticulous React Native code quality specialist.

## Your Role

Perform thorough code reviews focused on React Native-specific issues, performance pitfalls, and cross-platform correctness.

## Review Checklist

### 1. Re-render Detection
- Inline arrow functions in JSX props (especially in lists)
- Object/array literals in props (`style={{...}}` in loops)
- Missing `React.memo` on expensive pure components
- Missing `useCallback`/`useMemo` where dependencies are stable
- Context providers re-rendering entire subtrees

### 2. RN Anti-patterns
- ScrollView with large datasets (should be FlatList/FlashList)
- Inline styles in map/FlatList renderItem
- Direct Animated API when Reanimated is available
- `useEffect` for derived state (should be `useMemo`)
- Uncontrolled re-renders from navigation params

### 3. Platform Parity
- `Platform.select`/`Platform.OS` checks covering both iOS and Android
- Platform-specific files (`.ios.ts`/`.android.ts`) existing in pairs
- Native module calls with fallback for missing implementations
- StatusBar/SafeAreaView handling for both platforms

### 4. Expo SDK Validation
- Using Expo SDK modules when available (expo-image > react-native-fast-image)
- Correct config plugin usage
- EAS Build compatibility
- expo-updates/expo-dev-client proper setup

### 5. Accessibility Audit
- Touchable elements have `accessibilityLabel`
- Images have alt text or `accessible={false}` for decorative
- Proper `accessibilityRole` on interactive elements
- Screen reader order matches visual order
- Sufficient color contrast in custom components

### 6. Security
- No hardcoded secrets in JS files
- expo-secure-store for sensitive data (not AsyncStorage)
- Deep link URL validation
- WebView `originWhitelist` configured
- Input sanitization on user-facing forms

## Output Format

Group findings by severity:

```markdown
## Code Review: [scope]

### Critical (must fix)
- [ ] [File:line] Description and fix suggestion

### Warning (should fix)
- [ ] [File:line] Description and fix suggestion

### Suggestion (nice to have)
- [ ] [File:line] Description and improvement idea

### Positive
- [File] Good pattern: [what was done well]
```
```

- [ ] **Step 3: Create agents/tdd-guide.md**

```markdown
---
name: tdd-guide
description: Jest + RNTL setup, test-first workflow, Detox E2E scaffolding, mock native modules, coverage enforcement. Triggered by /tdd, /component.
---

You are the ERNE TDD Guide agent — a test-driven development specialist for React Native.

## Your Role

Guide developers through test-first development using Jest, React Native Testing Library, and Detox.

## Test-First Workflow

1. **Red** — Write a failing test that describes the desired behavior
2. **Green** — Write the minimum code to make the test pass
3. **Refactor** — Clean up while keeping tests green

## Testing Stack

| Layer | Tool | When |
|-------|------|------|
| Unit | Jest | Pure functions, hooks, utilities |
| Component | React Native Testing Library (RNTL) | UI components, screens |
| Integration | Jest + RNTL | Feature flows, multi-component interactions |
| E2E | Detox | Critical user journeys, platform-specific |

## Key Patterns

### Component Testing (RNTL)
```typescript
import { render, screen, fireEvent } from '@testing-library/react-native';

test('shows error when submitting empty form', () => {
  render(<LoginForm onSubmit={jest.fn()} />);
  fireEvent.press(screen.getByRole('button', { name: 'Submit' }));
  expect(screen.getByText('Email is required')).toBeVisible();
});
```

### Hook Testing
```typescript
import { renderHook, act } from '@testing-library/react-native';

test('useCounter increments', () => {
  const { result } = renderHook(() => useCounter());
  act(() => result.current.increment());
  expect(result.current.count).toBe(1);
});
```

### Mocking Native Modules
```typescript
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
}));
```

### Detox E2E
```typescript
describe('Login Flow', () => {
  beforeAll(async () => { await device.launchApp(); });
  it('should login successfully', async () => {
    await element(by.id('email-input')).typeText('user@test.com');
    await element(by.id('password-input')).typeText('password123');
    await element(by.id('login-button')).tap();
    await expect(element(by.id('home-screen'))).toBeVisible();
  });
});
```

## Guidelines

- Test behavior, not implementation (query by role/text, not testID when possible)
- One assertion per test (or closely related assertions)
- Mock at boundaries (API, native modules, navigation), not internal modules
- Snapshot tests only for smoke checks (not primary testing strategy)
- Coverage targets: 80% lines, 70% branches (configurable in jest.config)
- Create `__tests__/` adjacent to source or `*.test.ts` co-located

## Output Format

For each feature, produce:
1. Test file with failing tests
2. Implementation guidance
3. Verification steps
```

- [ ] **Step 4: Create agents/performance-profiler.md**

```markdown
---
name: performance-profiler
description: FPS measurement, TTI analysis, bundle size breakdown, memory leak detection, Reanimated worklet validation, Hermes bytecode analysis. Triggered by /perf, /debug, /code-review, /quality-gate.
---

You are the ERNE Performance Profiler agent — a React Native performance optimization specialist.

## Your Role

Diagnose and fix performance issues in React Native and Expo applications across JS thread, UI thread, and native layers.

## Diagnostic Areas

### 1. FPS & Rendering
- JS thread FPS (target: 60fps, warning below 45fps)
- UI thread FPS for animations
- Excessive re-renders (React DevTools Profiler)
- Long JS-to-native bridge calls
- InteractionManager usage for heavy operations

### 2. Time to Interactive (TTI)
- App launch time (cold start, warm start)
- Screen transition duration
- Initial data fetch waterfall
- Lazy loading effectiveness
- Hermes bytecode precompilation

### 3. Bundle Size
- Total bundle size (warning above 5MB for JS)
- Heavy dependency detection (moment, lodash full, firebase full)
- Tree-shaking effectiveness
- Asset optimization (images, fonts)
- Code splitting with React.lazy + Suspense

### 4. Memory
- Component unmount cleanup (subscriptions, timers, listeners)
- Image memory pressure (expo-image caching)
- FlatList memory management (windowSize, maxToRenderPerBatch)
- Native module memory leaks
- Large state objects in memory

### 5. Animations
- Reanimated worklet validation (no JS thread callbacks)
- useNativeDriver correctness for Animated API
- Gesture Handler vs PanResponder
- Layout animations (entering/exiting/layout)
- SharedValue usage patterns

### 6. Hermes Engine
- Bytecode compilation verification
- Inline requires for faster startup
- Proxy/Reflect usage (slower on Hermes)
- BigInt limitations
- Memory allocation patterns

## Profiling Commands

```bash
# Bundle analysis
npx react-native-bundle-visualizer

# Hermes bytecode
npx react-native run-ios --mode Release

# Memory snapshot
# Use Flipper/React Native DevTools Memory tab

# FPS monitor
# Enable Performance Monitor in Dev Menu
```

## Output Format

```markdown
## Performance Report: [scope]

### Metrics
| Metric | Current | Target | Status |
|--------|---------|--------|--------|

### Critical Issues
1. [Issue] — Impact: [high/medium] — Fix: [solution]

### Optimization Opportunities
1. [Area] — Expected improvement: [estimate]

### Recommended Actions (priority order)
1. [Action with code example]
```
```

- [ ] **Step 5: Verify 4 agent files exist and are well-formed**

Run: `ls -la agents/architect.md agents/code-reviewer.md agents/tdd-guide.md agents/performance-profiler.md`
Expected: All 4 files present with non-zero size.

Run: `head -3 agents/architect.md agents/code-reviewer.md agents/tdd-guide.md agents/performance-profiler.md`
Expected: Each starts with `---` frontmatter.

---

### Task 2: Platform & Tooling Agents (native-bridge-builder, expo-config-resolver, ui-designer, upgrade-assistant)

**Files:**
- Create: `agents/native-bridge-builder.md`, `agents/expo-config-resolver.md`, `agents/ui-designer.md`, `agents/upgrade-assistant.md`

- [ ] **Step 1: Create agents/native-bridge-builder.md**

```markdown
---
name: native-bridge-builder
description: Turbo Module scaffolding (Swift + Kotlin), Expo Modules API, Fabric component creation, platform-specific implementation templates. Triggered by /native-module.
---

You are the ERNE Native Bridge Builder agent — a specialist in bridging React Native with platform-native code.

## Your Role

Scaffold and implement native modules and views for both iOS (Swift) and Android (Kotlin), using modern APIs (Turbo Modules, Fabric, Expo Modules).

## Module Types

### 1. Expo Modules API (Recommended for Expo projects)
```swift
// ios/MyModule.swift
import ExpoModulesCore

public class MyModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyModule")

    Function("getValue") { () -> String in
      return "Hello from Swift"
    }

    AsyncFunction("fetchData") { (url: String, promise: Promise) in
      // async implementation
    }

    View(MyView.self) {
      Prop("title") { (view, title: String) in
        view.titleLabel.text = title
      }
    }
  }
}
```

```kotlin
// android/src/main/java/expo/modules/mymodule/MyModule.kt
package expo.modules.mymodule

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class MyModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("MyModule")

    Function("getValue") {
      return@Function "Hello from Kotlin"
    }

    AsyncFunction("fetchData") { url: String ->
      // async implementation
    }
  }
}
```

### 2. Turbo Modules (Bare RN)
```typescript
// specs/NativeMyModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getValue(): string;
  fetchData(url: string): Promise<string>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MyModule');
```

### 3. Fabric Components (New Architecture Views)
- Platform-specific ViewManager implementations
- Shadow node for custom layout
- Event emitters for native-to-JS communication

## Scaffolding Output

For each native module request, generate:
1. TypeScript spec/interface file
2. iOS Swift implementation
3. Android Kotlin implementation
4. Podspec / build.gradle configuration
5. Usage example with TypeScript types
6. Unit test stubs for both platforms

## Guidelines

- Always implement both platforms simultaneously
- Use Expo Modules API for Expo projects, Turbo Modules for bare RN
- Include error handling and null safety on native side
- Document thread safety requirements
- Add JSDoc/KDoc comments on public API
- Prefer async patterns over blocking calls
```

- [ ] **Step 2: Create agents/expo-config-resolver.md**

```markdown
---
name: expo-config-resolver
description: EAS Build error diagnosis, app.json/app.config.ts validation, config plugin debugging, provisioning profile issues, Gradle/CocoaPods fixes. Triggered by /build-fix, /deploy.
---

You are the ERNE Expo Config Resolver agent — an expert in Expo build system and configuration.

## Your Role

Diagnose and fix build failures, configuration issues, and deployment problems in Expo and React Native projects.

## Diagnostic Areas

### 1. EAS Build Failures
- Missing native dependencies
- Incompatible SDK versions
- Config plugin errors
- Code signing / provisioning issues
- Gradle / CocoaPods resolution failures

### 2. app.json / app.config.ts Validation
- Required fields (name, slug, version, ios.bundleIdentifier, android.package)
- Plugin configuration (correct order, valid options)
- Asset references (icons, splash screens exist)
- Deep linking scheme configuration
- Update configuration (expo-updates runtime version)

### 3. Config Plugin Debugging
```typescript
// Common patterns to validate
const withCustomPlugin: ConfigPlugin = (config) => {
  return withInfoPlist(config, (config) => {
    config.modResults.NSCameraUsageDescription = "...";
    return config;
  });
};
```

### 4. iOS Build Issues
- CocoaPods version conflicts
- Provisioning profile mismatches
- Minimum deployment target
- Privacy manifest requirements (iOS 17+)
- App Group / Keychain Sharing entitlements

### 5. Android Build Issues
- Gradle version compatibility
- minSdkVersion / targetSdkVersion
- ProGuard/R8 rules for native modules
- Multidex configuration
- AndroidManifest permissions

## Resolution Process

1. **Read error logs** — Identify the exact failure point
2. **Check configuration** — Validate app.json/app.config.ts
3. **Verify dependencies** — Check native module compatibility
4. **Apply fix** — Make targeted configuration change
5. **Verify fix** — Run `npx expo prebuild --clean` or `eas build --platform [ios|android] --profile preview`

## Output Format

```markdown
## Build Fix: [error summary]

### Root Cause
[Explanation of what went wrong]

### Fix
[Exact changes needed with file paths and code]

### Verification
[Command to verify the fix works]

### Prevention
[How to avoid this in the future]
```
```

- [ ] **Step 3: Create agents/ui-designer.md**

```markdown
---
name: ui-designer
description: NativeWind v5 styling, Reanimated animations, Gesture Handler interactions, expo-ui (SwiftUI/Jetpack Compose), responsive layouts. Triggered by /component, /animate.
---

You are the ERNE UI Designer agent — a React Native UI/UX implementation specialist.

## Your Role

Design and implement beautiful, performant, platform-native UI components for React Native and Expo.

## Styling Stack

### NativeWind v5 (Tailwind CSS v4 for RN)
```tsx
import { View, Text, Pressable } from 'react-native';

export function Card({ title, children }: CardProps) {
  return (
    <View className="bg-white dark:bg-gray-900 rounded-2xl p-4 shadow-sm">
      <Text className="text-lg font-semibold text-gray-900 dark:text-white">
        {title}
      </Text>
      {children}
    </View>
  );
}
```

### Reanimated Animations
```tsx
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring
} from 'react-native-reanimated';

function AnimatedCard() {
  const scale = useSharedValue(1);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable onPressIn={() => { scale.value = withSpring(0.95); }}
               onPressOut={() => { scale.value = withSpring(1); }}>
      <Animated.View style={animatedStyle}>
        {/* content */}
      </Animated.View>
    </Pressable>
  );
}
```

### Gesture Handler
```tsx
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

const pan = Gesture.Pan()
  .onUpdate((e) => {
    translateX.value = e.translationX;
    translateY.value = e.translationY;
  })
  .onEnd(() => {
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
  });
```

### expo-ui (Native Views)
```tsx
// SwiftUI integration (iOS)
import { PickerView } from 'expo-ui/swift-ui';

// Jetpack Compose integration (Android)
import { Slider } from 'expo-ui/jetpack-compose';
```

## Design Principles

- **Platform-native feel**: Use platform conventions (iOS nav bars, Android material)
- **Performance first**: Reanimated for animations, avoid layout thrashing
- **Accessibility**: Labels, roles, sufficient contrast, screen reader support
- **Responsive**: Use flexbox, percentage widths, safe area insets
- **Dark mode**: Support via NativeWind dark: prefix or useColorScheme
- **Haptics**: Use expo-haptics for tactile feedback on interactions

## Component Patterns

- **Compound components**: Header, Body, Footer composition
- **Render props**: For flexible list items
- **Forwarded refs**: For imperative handles (scroll, focus)
- **Platform files**: `.ios.tsx` / `.android.tsx` for divergent UI

## Output Format

For each component:
1. Component code with NativeWind styling
2. Animation code (if interactive)
3. Usage example
4. Accessibility annotations
5. Platform-specific notes (if any)
```

- [ ] **Step 4: Create agents/upgrade-assistant.md**

```markdown
---
name: upgrade-assistant
description: Expo SDK migration, React Native version upgrades, breaking change detection, dependency compatibility matrix, codemod suggestions. Triggered by /upgrade.
---

You are the ERNE Upgrade Assistant agent — a specialist in React Native and Expo version migrations.

## Your Role

Guide developers through version upgrades with minimal breakage, covering dependency updates, API changes, and configuration migration.

## Upgrade Process

### 1. Pre-Upgrade Assessment
- Current versions (RN, Expo SDK, key dependencies)
- Target versions and their release notes
- Breaking changes list
- Dependency compatibility check
- Risk assessment (low/medium/high)

### 2. Dependency Compatibility Matrix
```
Check each major dependency against target version:
- react-native-reanimated: [version] -> [compatible version]
- react-native-gesture-handler: [version] -> [compatible version]
- expo-router: [version] -> [compatible version]
- @tanstack/react-query: [version] -> [no change needed]
...
```

### 3. Breaking Change Detection
- API removals (deprecated methods now removed)
- Behavior changes (default values, event handling)
- Configuration format changes (app.json schema, metro.config)
- Native code changes (Podfile, build.gradle)
- Import path changes

### 4. Migration Steps

**Expo SDK Upgrade:**
```bash
# Step 1: Update Expo SDK
npx expo install expo@latest

# Step 2: Update related packages
npx expo install --fix

# Step 3: Regenerate native projects
npx expo prebuild --clean

# Step 4: Run and verify
npx expo start --clear
```

**React Native Upgrade (bare):**
```bash
# Step 1: Use upgrade helper
# Visit https://react-native-community.github.io/upgrade-helper/

# Step 2: Apply diff changes
# Step 3: Update dependencies
# Step 4: Pod install
cd ios && pod install --repo-update

# Step 5: Clean build
npx react-native start --reset-cache
```

### 5. Post-Upgrade Verification
- Build succeeds (iOS + Android)
- All tests pass
- Critical flows work (login, navigation, data fetch)
- Performance baseline maintained
- No new warnings/deprecations

## Codemod Suggestions

When API changes can be automated:
```bash
# Example: deprecated import migration
npx jscodeshift -t codemod-transform.js src/
```

## Output Format

```markdown
## Upgrade Plan: [from] -> [to]

### Risk Level: [low/medium/high]

### Breaking Changes
1. [Change] — Impact: [files affected] — Fix: [action]

### Dependency Updates
| Package | Current | Target | Action |
|---------|---------|--------|--------|

### Migration Steps
1. [ ] [Step with exact command/code]

### Verification Checklist
- [ ] iOS build passes
- [ ] Android build passes
- [ ] Test suite passes
- [ ] [Critical flow] works
```
```

- [ ] **Step 5: Verify all 8 agent files**

Run: `ls -la agents/`
Expected: 8 `.md` files.

Run: `grep -l "^name:" agents/*.md | wc -l`
Expected: 8 (all have frontmatter).

---

## Chunk 2: Common Rules (Always Active)

### Task 3: Common Rules — Style, Patterns, Performance, Testing, Security

**Files:**
- Create: `rules/common/coding-style.md`, `rules/common/patterns.md`, `rules/common/performance.md`, `rules/common/testing.md`, `rules/common/security.md`

- [ ] **Step 1: Create rules/common/coding-style.md**

```markdown
---
description: TypeScript and React Native coding style conventions — enforced for all project types
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Coding Style

## TypeScript
- Enable `strict` mode in tsconfig.json
- No `any` types — use `unknown` + type guards or proper generics
- Use type inference where possible; annotate function signatures explicitly
- Prefer `interface` for object shapes, `type` for unions/intersections
- Use `as const` for literal types instead of enums

## Components
- Functional components only — no class components
- Named exports only — no default exports
- One component per file (colocated helpers are fine)
- Props interface named `[Component]Props` (e.g., `ButtonProps`)
- Destructure props in function signature

```tsx
// GOOD
export function UserCard({ name, avatar }: UserCardProps) { ... }

// BAD
export default class UserCard extends Component { ... }
```

## File Naming
- Components: `PascalCase.tsx` (e.g., `UserCard.tsx`)
- Hooks: `camelCase.ts` prefixed with `use` (e.g., `useAuth.ts`)
- Utils/helpers: `camelCase.ts` (e.g., `formatDate.ts`)
- Types: `camelCase.ts` or colocated in component file
- Tests: `[name].test.ts(x)` adjacent to source
- Platform-specific: `[name].ios.tsx` / `[name].android.tsx`

## Imports
- Use path aliases (`@/` maps to `src/`)
- No barrel files (`index.ts` re-exports) — import directly
- Group imports: react → react-native → expo → third-party → local
- Use `import type` for type-only imports

## General
- Max line length: 100 characters (Prettier enforced)
- Trailing commas in multiline structures
- Single quotes for strings
- Semicolons required
- No `var` — use `const` by default, `let` when reassignment needed
```

- [ ] **Step 2: Create rules/common/patterns.md**

```markdown
---
description: React Native architectural patterns and best practices
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Patterns

## State Management
- **Client state**: Zustand (simple) or Jotai (atomic) — NOT Redux for new projects
- **Server state**: TanStack Query (React Query) — handles caching, refetching, optimistic updates
- **Form state**: React Hook Form or controlled components (small forms)
- Avoid prop drilling beyond 2 levels — use Zustand store or composition

```tsx
// GOOD: Zustand store
const useAuthStore = create<AuthState>((set) => ({
  user: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null }),
}));

// BAD: Deep prop drilling
<App user={user}>
  <Layout user={user}>
    <Header user={user}>
      <Avatar user={user} />
```

## Component Patterns
- **Compound components** for complex UI (Header + Body + Footer)
- **Custom hooks** for shared logic (extract `useAuth`, `useTheme`)
- **Colocation**: keep feature files together

```
features/
  auth/
    LoginScreen.tsx
    useAuth.ts
    auth.store.ts
    auth.test.tsx
```

- **Render props / children** for flexible containers
- **forwardRef** for imperative handles (scroll, focus)

## Data Fetching
- TanStack Query for all API calls
- Define query keys as constants (`['users', userId]`)
- Use `queryClient.prefetchQuery` for anticipated navigation
- Optimistic updates for user-initiated mutations
- Error boundaries per screen (not global)

## Error Handling
- Error boundaries at screen level (catch rendering crashes)
- Try/catch at API call level (handle network errors)
- Graceful degradation (offline placeholder, retry button)
- Report errors to monitoring (Sentry/Crashlytics)
- Never swallow errors silently
```

- [ ] **Step 3: Create rules/common/performance.md**

```markdown
---
description: React Native performance optimization rules
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Performance

## Rendering
- Use `React.memo` on components rendered in lists or receiving stable props
- Wrap callbacks with `useCallback` when passed to memoized children
- Use `useMemo` for expensive computations (sorting, filtering large arrays)
- Never define functions or objects inline in JSX within loops/lists

```tsx
// GOOD
const renderItem = useCallback(({ item }: { item: User }) => (
  <UserRow user={item} onPress={handlePress} />
), [handlePress]);

// BAD — creates new object every render
<FlatList renderItem={({ item }) => <UserRow user={item} />} />
```

## Lists
- `FlatList` or `FlashList` for lists > 20 items (never ScrollView)
- Set `keyExtractor` with stable, unique keys
- Use `getItemLayout` when item heights are fixed
- Configure `windowSize`, `maxToRenderPerBatch`, `initialNumToRender`
- `removeClippedSubviews={true}` for long lists on Android

## Images
- Use `expo-image` (not `<Image>` or react-native-fast-image)
- Set explicit `width` and `height` (avoid layout shifts)
- Use `contentFit="cover"` and `placeholder` for loading states
- Optimize source images (WebP, appropriate resolution)
- Use `cachePolicy="memory-disk"` for frequently accessed images

## Bundle Size
- Import specific modules, not entire packages (`lodash/get` not `lodash`)
- Use `React.lazy` + `Suspense` for code splitting heavy screens
- Analyze bundle with `npx react-native-bundle-visualizer`
- Target < 5MB JS bundle for production

## Animations
- Use `react-native-reanimated` for all animations (not Animated API)
- Run animations on UI thread via worklets
- Never read shared values from JS thread in hot paths
- Use `useAnimatedStyle` instead of inline animated styles

## Startup
- Use Hermes engine (enabled by default in Expo SDK 50+)
- Inline requires for heavy modules (`require('heavy-lib')` inside function)
- Minimize `useEffect` chains on app startup
- Defer non-critical initialization with `InteractionManager.runAfterInteractions`
```

- [ ] **Step 4: Create rules/common/testing.md**

```markdown
---
description: Testing standards for React Native projects
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Testing

## Stack
- **Unit/Component**: Jest + React Native Testing Library (RNTL)
- **E2E**: Detox (with EAS Build for Expo projects)
- **Coverage**: Jest built-in, target 80% lines, 70% branches

## Principles
- Test behavior, not implementation
- Query by role, text, or label — avoid testID unless necessary
- One logical assertion per test
- Mock at boundaries (API, native modules), not internals
- No snapshot tests as primary strategy (smoke checks only)

## Component Tests
```tsx
// GOOD: Tests behavior
test('disables submit when form is invalid', () => {
  render(<LoginForm />);
  const button = screen.getByRole('button', { name: 'Submit' });
  expect(button).toBeDisabled();
});

// BAD: Tests implementation
test('sets isValid state to false', () => {
  const { result } = renderHook(() => useForm());
  expect(result.current.isValid).toBe(false);
});
```

## Mocking
```tsx
// Mock native module
jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue('token'),
  setItemAsync: jest.fn(),
}));

// Mock navigation
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Mock API — use MSW or manual mock
const server = setupServer(
  rest.get('/api/users', (req, res, ctx) => res(ctx.json([]))),
);
```

## File Organization
- Tests adjacent to source: `UserCard.test.tsx` next to `UserCard.tsx`
- Or in `__tests__/` directory at feature level
- Shared test utilities in `tests/helpers/`
- E2E tests in `e2e/` directory at project root
```

- [ ] **Step 5: Create rules/common/security.md**

```markdown
---
description: Mobile security rules for React Native applications
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Security

## Secrets Management
- NEVER hardcode API keys, tokens, or secrets in JS code
- Use `expo-secure-store` for sensitive data (NOT AsyncStorage)
- Environment variables via `.env` files (excluded from git)
- Build-time secrets via EAS Secrets (for CI/CD)
- Runtime secrets via secure backend API

```tsx
// GOOD
import * as SecureStore from 'expo-secure-store';
const token = await SecureStore.getItemAsync('auth_token');

// BAD
const API_KEY = 'sk-1234567890abcdef';
await AsyncStorage.setItem('auth_token', token);
```

## Deep Linking
- Validate ALL incoming deep link URLs before navigation
- Whitelist allowed hosts and paths
- Never pass deep link params directly to sensitive operations
- Sanitize query parameters

```tsx
// GOOD
function handleDeepLink(url: string) {
  const parsed = Linking.parse(url);
  if (ALLOWED_HOSTS.includes(parsed.hostname)) {
    router.push(parsed.path);
  }
}
```

## Network Security
- HTTPS only — no HTTP requests
- Certificate pinning for critical API endpoints
- Timeout all network requests (15s default)
- Handle network errors gracefully (offline mode)

## WebView
- Always set `originWhitelist` (never `['*']` in production)
- Disable JavaScript if not needed
- Never load untrusted URLs
- Use `onShouldStartLoadWithRequest` to filter navigation

## Input Validation
- Sanitize all user input before display (XSS prevention)
- Validate form data on client AND server
- Use parameterized queries (never string concatenation for queries)
- Limit input lengths to prevent abuse

## Data Storage
- Sensitive data: `expo-secure-store` (Keychain/Keystore)
- Non-sensitive preferences: `AsyncStorage` or `expo-file-system`
- Never store PII in logs or crash reports
- Clear sensitive data on logout
```

- [ ] **Step 6: Verify 5 common rule files**

Run: `ls -la rules/common/`
Expected: 5 `.md` files (coding-style, patterns, performance, testing, security).

---

### Task 4: Common Rules — Navigation, State Management, Git Workflow, Development Workflow

**Files:**
- Create: `rules/common/navigation.md`, `rules/common/state-management.md`, `rules/common/git-workflow.md`, `rules/common/development-workflow.md`

- [ ] **Step 1: Create rules/common/navigation.md**

```markdown
---
description: Expo Router navigation conventions and patterns
globs: "app/**/*.{ts,tsx}"
alwaysApply: false
---

# Navigation

## Expo Router File Conventions
- File-based routing in `app/` directory
- `_layout.tsx` for layout definitions (Stack, Tabs, Drawer)
- `[param].tsx` for dynamic routes
- `[...catchAll].tsx` for catch-all routes
- `+not-found.tsx` for 404 handling
- `(group)` parentheses for layout groups (no URL impact)

```
app/
  _layout.tsx          # Root layout (Stack)
  index.tsx            # / (home)
  (tabs)/
    _layout.tsx        # Tab layout
    home.tsx           # /home tab
    profile.tsx        # /profile tab
  (auth)/
    _layout.tsx        # Auth stack (no tabs)
    login.tsx          # /login
    register.tsx       # /register
  settings/
    _layout.tsx        # Settings stack
    index.tsx          # /settings
    [section].tsx      # /settings/notifications
```

## Typed Routes
- Use `href` with type-safe route paths
- Define route params with `useLocalSearchParams<{ id: string }>()`
- Use `router.push()` / `router.replace()` / `router.back()`
- Prefer `<Link>` component for declarative navigation

## Deep Linking
- Define scheme in `app.json` (`expo.scheme`)
- Map deep links to file routes
- Validate incoming URLs before navigating
- Test deep links: `npx uri-scheme open [url] --ios/--android`

## Modal Patterns
- Use `presentation: 'modal'` in layout options
- Full-screen modals: separate route in layout group
- Bottom sheets: `@gorhom/bottom-sheet` (not navigation)

## Best Practices
- Keep navigation state minimal (pass IDs, not full objects)
- Prefetch data for likely next screens
- Use `initialRouteName` for proper back navigation
- Handle "not found" routes gracefully
```

- [ ] **Step 2: Create rules/common/state-management.md**

```markdown
---
description: State management guidelines — Zustand for client, TanStack Query for server
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# State Management

## Architecture

| State Type | Tool | When |
|-----------|------|------|
| **Client state** | Zustand | UI state, user preferences, app mode |
| **Server state** | TanStack Query | API data, caching, pagination, optimistic updates |
| **Form state** | React Hook Form | Complex forms with validation |
| **Ephemeral state** | useState | Component-local, non-shared |
| **Derived state** | useMemo | Computed from other state |

## Zustand Patterns

```tsx
// Store definition — one store per domain
interface AuthStore {
  user: User | null;
  token: string | null;
  setUser: (user: User) => void;
  logout: () => void;
}

const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  token: null,
  setUser: (user) => set({ user }),
  logout: () => set({ user: null, token: null }),
}));

// Usage — select only what you need
const userName = useAuthStore((s) => s.user?.name);
```

## TanStack Query Patterns

```tsx
// Query keys as constants
export const userKeys = {
  all: ['users'] as const,
  detail: (id: string) => ['users', id] as const,
  lists: () => ['users', 'list'] as const,
};

// Query hook
function useUser(id: string) {
  return useQuery({
    queryKey: userKeys.detail(id),
    queryFn: () => api.getUser(id),
    staleTime: 5 * 60 * 1000,
  });
}

// Mutation with optimistic update
function useUpdateUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.updateUser,
    onMutate: async (updated) => {
      await queryClient.cancelQueries({ queryKey: userKeys.detail(updated.id) });
      const previous = queryClient.getQueryData(userKeys.detail(updated.id));
      queryClient.setQueryData(userKeys.detail(updated.id), updated);
      return { previous };
    },
    onError: (err, vars, context) => {
      queryClient.setQueryData(userKeys.detail(vars.id), context?.previous);
    },
    onSettled: (data, err, vars) => {
      queryClient.invalidateQueries({ queryKey: userKeys.detail(vars.id) });
    },
  });
}
```

## Rules
- Context API only for truly global, rarely-changing values (theme, locale)
- No prop drilling beyond 2 component levels
- Keep stores small and domain-focused
- Never store derived data — compute with `useMemo` or selectors
- Persist critical state with `zustand/middleware` persist
```

- [ ] **Step 3: Create rules/common/git-workflow.md**

```markdown
---
description: Git workflow and commit conventions
globs: ""
alwaysApply: true
---

# Git Workflow

## Commit Messages
Follow Conventional Commits:

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `chore`, `ci`

Examples:
- `feat(auth): add biometric login support`
- `fix(navigation): prevent double-tap on tab bar`
- `perf(list): switch FlatList to FlashList for feed`

## Branch Naming
- Feature: `feat/short-description`
- Fix: `fix/issue-number-description`
- Chore: `chore/description`

## PR Guidelines
- Keep PRs under 400 lines when possible
- One logical change per PR
- Include screenshots/recordings for UI changes
- Update tests for changed behavior
- Run full test suite before requesting review

## Hooks Integration
The `pre-commit-lint.js` hook runs ESLint + Prettier on staged files before commit.
```

- [ ] **Step 4: Create rules/common/development-workflow.md**

```markdown
---
description: Development environment and workflow conventions
globs: ""
alwaysApply: true
---

# Development Workflow

## Development Client
- Use `expo-dev-client` instead of Expo Go for projects with native modules
- Expo Go is fine for pure JS/TS projects without custom native code
- Create development builds: `eas build --profile development`

## Build Profiles

| Profile | Use Case | Command |
|---------|----------|---------|
| development | Local testing with dev tools | `eas build --profile development` |
| preview | QA testing, stakeholder review | `eas build --profile preview` |
| production | App Store / Play Store release | `eas build --profile production` |

## Environment Management
- `.env.development`, `.env.preview`, `.env.production`
- Use `expo-constants` to access env vars at runtime
- Never commit `.env` files (add to `.gitignore`)
- Use EAS Secrets for CI/CD environment variables

## Local Development
```bash
# Start Metro bundler
npx expo start

# Run on specific platform
npx expo run:ios
npx expo run:android

# Clear cache when things break
npx expo start --clear

# Regenerate native projects
npx expo prebuild --clean
```

## Debugging
- Use React Native DevTools (built-in with Expo SDK 50+)
- Console.log for quick debugging (remove before commit)
- React DevTools for component inspection
- Flipper/React Native Debugger for network and performance
- `LogBox.ignoreLogs()` only for known harmless warnings

## CI/CD
- EAS Build for cloud builds
- EAS Submit for store submissions
- EAS Update for OTA updates (non-native changes)
- GitHub Actions for lint/test/typecheck on PRs
```

- [ ] **Step 5: Verify all 9 common rule files**

Run: `ls -la rules/common/`
Expected: 9 `.md` files.

Run: `wc -l rules/common/*.md`
Expected: Each file has 30+ lines of content.

---

## Chunk 3: Platform-Specific Rules

### Task 5: Expo & Bare RN Platform Rules

**Files:**
- Create: `rules/expo/coding-style.md`, `rules/expo/patterns.md`, `rules/expo/security.md`, `rules/expo/testing.md`
- Create: `rules/bare-rn/coding-style.md`, `rules/bare-rn/patterns.md`, `rules/bare-rn/security.md`, `rules/bare-rn/testing.md`

- [ ] **Step 1: Create rules/expo/coding-style.md**

```markdown
---
description: Expo managed workflow coding conventions
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Expo Coding Style

## SDK Module Preference
- Always prefer Expo SDK modules over community alternatives
- `expo-image` over `react-native-fast-image`
- `expo-file-system` over `react-native-fs`
- `expo-camera` over `react-native-camera`
- `expo-notifications` over `react-native-push-notification`
- `expo-secure-store` over `react-native-keychain`

```tsx
// GOOD — Expo SDK module
import * as FileSystem from 'expo-file-system';
const content = await FileSystem.readAsStringAsync(uri);

// BAD — community alternative in Expo project
import RNFS from 'react-native-fs';
const content = await RNFS.readFile(path);
```

## Config Plugins Over Manual Native Edits
- NEVER modify `ios/` or `android/` directories directly in managed workflow
- Use config plugins for native configuration
- Run `npx expo prebuild --clean` to regenerate native projects
- Add native config in `app.config.ts` with plugins array

```ts
// app.config.ts
export default ({ config }) => ({
  ...config,
  plugins: [
    ['expo-camera', { cameraPermission: 'Allow camera for scanning' }],
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow location' }],
    './plugins/custom-splash.js',
  ],
});
```

## Expo Router Conventions
- Use file-based routing exclusively (no manual route registration)
- Layout files (`_layout.tsx`) define navigation structure
- Use typed routes for navigation
- Group routes with parentheses for logical organization

## Module Resolution
- Use `expo-modules-core` for creating native modules
- Prefer `expo-constants` for accessing build-time configuration
- Use `expo-updates` API for checking/fetching OTA updates
```

- [ ] **Step 2: Create rules/expo/patterns.md**

```markdown
---
description: Expo-specific architectural patterns and SDK usage
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Expo Patterns

## App Configuration
- Use `app.config.ts` (dynamic) over `app.json` (static) for flexibility
- Split config by environment using `process.env.APP_ENV`
- Keep secrets out of config — use EAS Secrets for build-time injection

```ts
// app.config.ts
const IS_DEV = process.env.APP_ENV === 'development';

export default {
  name: IS_DEV ? 'MyApp (Dev)' : 'MyApp',
  slug: 'myapp',
  scheme: 'myapp',
  ios: {
    bundleIdentifier: IS_DEV ? 'com.myapp.dev' : 'com.myapp',
  },
  android: {
    package: IS_DEV ? 'com.myapp.dev' : 'com.myapp',
  },
};
```

## EAS Update (OTA)
- Use EAS Update for JS-only changes (no native code changes)
- Channel-based deployment: development, preview, production
- Always test updates on preview channel before production
- Set `runtimeVersion` policy to `"appVersion"` or custom policy

```bash
# Publish update to preview channel
eas update --channel preview --message "Fix login button"

# Publish to production
eas update --channel production --message "v1.2.1 hotfix"
```

## Config Plugin Authoring
- Create custom plugins in `plugins/` directory at project root
- Use `withInfoPlist`, `withAndroidManifest` for platform-specific changes
- Test plugins with `npx expo prebuild --clean`

```ts
// plugins/with-custom-scheme.ts
import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

const withCustomScheme: ConfigPlugin<{ scheme: string }> = (config, { scheme }) => {
  return withInfoPlist(config, (mod) => {
    mod.modResults.CFBundleURLTypes = [
      ...(mod.modResults.CFBundleURLTypes || []),
      { CFBundleURLSchemes: [scheme] },
    ];
    return mod;
  });
};

export default withCustomScheme;
```

## Expo Modules API
- Prefer Expo Modules API over bare Turbo Modules for Expo projects
- Define modules in `modules/` directory with Swift + Kotlin
- Use `expo-module.config.json` for module configuration
- See `native-bridge-builder` agent for full scaffolding
```

- [ ] **Step 3: Create rules/expo/security.md**

```markdown
---
description: Security practices specific to Expo managed workflow
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Expo Security

## EAS Secrets
- Store sensitive environment variables in EAS Secrets (not `.env` files in CI)
- Access via `process.env` in `app.config.ts` at build time
- Never expose build-time secrets to runtime JS bundle

```bash
# Set secret in EAS
eas secret:create --name API_KEY --value sk-xxx --scope project

# Use in app.config.ts (build-time only)
export default {
  extra: {
    apiUrl: process.env.API_URL, // OK — non-secret config
    // NEVER: apiKey: process.env.API_KEY (exposes to JS bundle)
  },
};
```

## Secure Storage
- `expo-secure-store` for tokens, credentials, sensitive user data
- `AsyncStorage` only for non-sensitive preferences
- Never store sensitive data in `expo-file-system` without encryption

## Update Signing
- Enable code signing for EAS Updates in production
- Verify update integrity before applying
- Use certificate pinning for update server communication
- Set `expo.updates.codeSigningCertificate` in app config

## Expo Go Limitations
- Expo Go shares a single container — sensitive data may persist between projects
- Always use development builds (`expo-dev-client`) for security-sensitive work
- Never test auth flows or store real credentials in Expo Go
```

- [ ] **Step 4: Create rules/expo/testing.md**

```markdown
---
description: Testing patterns specific to Expo managed workflow
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Expo Testing

## Detox with EAS Build
- Build Detox-compatible binaries using EAS Build
- Configure `eas.json` with a dedicated Detox build profile
- Run Detox tests against EAS-built artifacts

```json
// eas.json
{
  "build": {
    "detox-ios": {
      "ios": {
        "simulator": true,
        "image": "latest"
      },
      "env": { "DETOX_CONFIGURATION": "ios.sim.release" }
    },
    "detox-android": {
      "android": {
        "buildType": "apk",
        "image": "latest"
      }
    }
  }
}
```

## expo-dev-client Testing
- Test native modules with `expo-dev-client` builds (not Expo Go)
- Create development builds for each PR that adds native modules
- Mock native modules in unit tests, use real modules in E2E tests

## Expo-Specific Mocking

```tsx
// Mock expo modules in Jest
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: 'http://test.example.com' },
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: ({ children }: any) => children,
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));
```

## Testing OTA Updates
- Test update flow on preview channel before production
- Verify update applies correctly with `expo-updates` API
- Test rollback scenarios (corrupted update, network failure)
- Include update verification in E2E test suite
```

- [ ] **Step 5: Create rules/bare-rn/coding-style.md**

```markdown
---
description: Bare React Native project coding conventions
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Bare React Native Coding Style

## Native Project Management
- Maintain `ios/` and `android/` directories in version control
- Keep `Podfile` and `build.gradle` clean and well-documented
- Pin native dependency versions explicitly
- Run `pod install` after adding any iOS dependency

## Podfile Conventions
```ruby
# ios/Podfile
platform :ios, '15.0'
use_frameworks! :linkage => :static

target 'MyApp' do
  config = use_native_modules!
  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true,
  )
end

post_install do |installer|
  react_native_post_install(installer)
end
```

## Gradle Conventions
- Use Kotlin DSL (`build.gradle.kts`) for new projects
- Keep `minSdkVersion` aligned across all modules
- Configure ProGuard/R8 rules for release builds
- Use version catalogs for dependency management

## Autolinking
- Rely on React Native autolinking (don't manually link libraries)
- For custom native modules, register in `react-native.config.js`
- Run `npx react-native-config` to verify linking

```js
// react-native.config.js
module.exports = {
  dependencies: {
    'my-native-module': {
      platforms: {
        android: { sourceDir: './android/my-module' },
        ios: { podspecPath: './ios/MyModule.podspec' },
      },
    },
  },
};
```

## Platform-Specific Code
- Use `.ios.tsx` / `.android.tsx` suffixes for platform files
- Use `Platform.select()` for inline platform differences
- Prefer shared code with platform-specific adapters
```

- [ ] **Step 6: Create rules/bare-rn/patterns.md**

```markdown
---
description: Bare React Native architectural patterns
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Bare React Native Patterns

## Native Module Registration
- Register custom modules in `MainApplication.kt` (Android) and `AppDelegate.swift` (iOS)
- Use `@ReactModule` annotation for Android Turbo Modules
- Implement `RCTBridgeModule` protocol for iOS (legacy) or use new architecture

## Turbo Module Boilerplate

```ts
// specs/NativeMyModule.ts — Codegen spec
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getData(key: string): Promise<string>;
  setData(key: string, value: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MyModule');
```

## Fabric Component Patterns
- Define component specs in `specs/` directory
- Use codegen for type-safe native component interfaces
- Implement `ViewManager` (Android) and `RCTViewManager` (iOS)

## Build Configuration
- Use Gradle flavors for multi-environment builds (Android)
- Use Xcode schemes + configurations for multi-environment (iOS)
- Configure build variants in `android/app/build.gradle`

```groovy
// android/app/build.gradle
android {
    flavorDimensions "environment"
    productFlavors {
        development { applicationIdSuffix ".dev" }
        staging { applicationIdSuffix ".staging" }
        production { /* default */ }
    }
}
```

## Metro Configuration
- Customize `metro.config.js` for monorepo setups
- Configure asset resolution for custom file types
- Set up module aliases for clean imports
```

- [ ] **Step 7: Create rules/bare-rn/security.md**

```markdown
---
description: Security practices for bare React Native projects
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Bare React Native Security

## ProGuard / R8 Configuration
- Enable ProGuard for release builds to obfuscate code
- Add keep rules for React Native and native modules
- Test release builds thoroughly (ProGuard can break reflection)

```proguard
# proguard-rules.pro
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }
# Keep your native module classes
-keep class com.myapp.modules.** { *; }
```

## iOS Keychain Direct Usage
- Use `react-native-keychain` or direct Keychain API for sensitive storage
- Set appropriate accessibility level (`kSecAttrAccessibleWhenUnlockedThisDeviceOnly`)
- Enable biometric protection for high-security items

## Certificate Pinning (Native)
- Implement SSL pinning in native networking layer
- Pin certificate public keys (not certificates themselves — they expire)
- Use `TrustKit` (iOS) or `OkHttp CertificatePinner` (Android)

```kotlin
// Android — OkHttp certificate pinning
val client = OkHttpClient.Builder()
    .certificatePinner(
        CertificatePinner.Builder()
            .add("api.myapp.com", "sha256/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")
            .build()
    )
    .build()
```

## Network Security Config (Android)
- Define `network_security_config.xml` for Android
- Disable cleartext traffic in production
- Configure certificate pinning at OS level

```xml
<!-- android/app/src/main/res/xml/network_security_config.xml -->
<network-security-config>
    <domain-config cleartextTrafficPermitted="false">
        <domain includeSubdomains="true">api.myapp.com</domain>
        <pin-set>
            <pin digest="SHA-256">base64EncodedPin=</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```
```

- [ ] **Step 8: Create rules/bare-rn/testing.md**

```markdown
---
description: Testing patterns for bare React Native projects
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Bare React Native Testing

## Native Unit Tests
Run native tests alongside JS tests for full coverage:

### iOS (XCTest)
```swift
// ios/MyAppTests/MyModuleTests.swift
import XCTest
@testable import MyApp

class MyModuleTests: XCTestCase {
    func testDataProcessing() {
        let module = MyModule()
        let result = module.processData("input")
        XCTAssertEqual(result, "expected_output")
    }
}
```

### Android (JUnit)
```kotlin
// android/app/src/test/java/com/myapp/MyModuleTest.kt
import org.junit.Test
import org.junit.Assert.*

class MyModuleTest {
    @Test
    fun testDataProcessing() {
        val module = MyModule()
        val result = module.processData("input")
        assertEquals("expected_output", result)
    }
}
```

## E2E with Detox (Bare Setup)
- Configure Detox directly in project (no EAS Build needed)
- Build test binaries locally: `detox build --configuration ios.sim.debug`
- Run: `detox test --configuration ios.sim.debug`

```js
// .detoxrc.js
module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' } },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 16' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
```

## Integration Testing
- Test native module bridges with integration tests
- Verify Turbo Module codegen output matches specs
- Test platform-specific behavior on both iOS and Android
```

- [ ] **Step 9: Verify 8 expo + bare-rn rule files**

Run: `ls -la rules/expo/ rules/bare-rn/`
Expected: 4 `.md` files in each directory (8 total).

---

### Task 6: Native iOS & Native Android Platform Rules

**Files:**
- Create: `rules/native-ios/coding-style.md`, `rules/native-ios/patterns.md`, `rules/native-ios/security.md`, `rules/native-ios/testing.md`
- Create: `rules/native-android/coding-style.md`, `rules/native-android/patterns.md`, `rules/native-android/security.md`, `rules/native-android/testing.md`

- [ ] **Step 1: Create rules/native-ios/coding-style.md**

```markdown
---
description: Swift and Objective-C coding conventions for React Native native modules
globs: "**/*.{swift,m,mm,h}"
alwaysApply: false
---

# iOS Native Coding Style

## Swift Conventions
- Swift 5.9+ with strict concurrency checking
- Use `struct` over `class` when no inheritance is needed
- Protocol-oriented design over class hierarchies
- Use `async/await` over completion handlers
- Mark `@Sendable` for closures crossing concurrency domains

```swift
// GOOD — Protocol-oriented, async/await
protocol DataProvider: Sendable {
    func fetchData() async throws -> [Item]
}

struct APIDataProvider: DataProvider {
    func fetchData() async throws -> [Item] {
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([Item].self, from: data)
    }
}

// BAD — Class hierarchy, callback-based
class BaseDataProvider {
    func fetchData(completion: @escaping ([Item]?, Error?) -> Void) { ... }
}
```

## @objc Exposure
- Annotate classes and methods with `@objc` for React Native bridge
- Use `@objcMembers` sparingly (only on classes fully exposed to RN)
- Prefer explicit `@objc` on individual methods

## SwiftUI Integration (expo-ui)
- Use `ExpoView` base class for Expo Module views
- Wrap SwiftUI views with `UIHostingController` for bridge exposure
- Keep SwiftUI views small and composable

```swift
// Expo Module with SwiftUI view
import ExpoModulesCore
import SwiftUI

class MyWidgetModule: Module {
    func definition() -> ModuleDefinition {
        Name("MyWidget")
        View(MyWidgetView.self) {
            Prop("title") { (view, title: String) in
                view.title = title
            }
        }
    }
}

class MyWidgetView: ExpoView {
    var title: String = "" {
        didSet { updateHostingController() }
    }
}
```

## Naming
- Types: `PascalCase` (`UserManager`, `AuthService`)
- Methods/properties: `camelCase` (`fetchUser()`, `isAuthenticated`)
- Constants: `camelCase` (Swift convention, NOT `SCREAMING_CASE`)
- Protocols: descriptive nouns or `-able` suffix (`Authenticatable`, `DataSource`)
```

- [ ] **Step 2: Create rules/native-ios/patterns.md**

```markdown
---
description: iOS native module implementation patterns for React Native
globs: "**/*.{swift,m,mm,h}"
alwaysApply: false
---

# iOS Native Patterns

## Turbo Module Swift Implementation
- Implement `TurboModule` spec in Swift
- Bridge Swift to Objective-C with `@objc` annotations
- Use `RCTConvert` for type conversion from JS

```swift
// NativeMyModuleSpec — Auto-generated from codegen
@objc(MyModule)
class MyModule: NSObject, NativeMyModuleSpec {
    @objc static func moduleName() -> String { "MyModule" }

    @objc func getData(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let result = try await fetchData(key)
                resolve(result)
            } catch {
                reject("ERR_DATA", error.localizedDescription, error)
            }
        }
    }
}
```

## ExpoModulesCore View Patterns
- Extend `ExpoView` for custom native views
- Use `Prop` for reactive property binding from JS
- Use `Events` for sending data back to JS

```swift
import ExpoModulesCore

class ChartView: ExpoView {
    let onDataPointSelected = EventDispatcher()

    var dataPoints: [Double] = [] {
        didSet { redraw() }
    }

    private func handleTap(at index: Int) {
        onDataPointSelected([
            "index": index,
            "value": dataPoints[index],
        ])
    }
}
```

## Bridging Headers
- Keep bridging header minimal
- Only import headers needed for RN bridge
- Use module maps for cleaner imports when possible

```objc
// MyApp-Bridging-Header.h
#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <React/RCTEventEmitter.h>
```

## Threading
- Heavy computations on background queue, UI updates on main queue
- Use `DispatchQueue.main.async` for UI updates from native callbacks
- Never block the main thread with synchronous operations
```

- [ ] **Step 3: Create rules/native-ios/security.md**

```markdown
---
description: iOS-specific security practices for React Native apps
globs: "**/*.{swift,m,mm,h}"
alwaysApply: false
---

# iOS Security

## Keychain Services API
- Use Keychain for tokens, passwords, and sensitive credentials
- Set appropriate `kSecAttrAccessible` level
- Use `kSecAttrAccessibleWhenUnlockedThisDeviceOnly` for most cases

```swift
import Security

func saveToKeychain(key: String, data: Data) -> Bool {
    let query: [String: Any] = [
        kSecClass as String: kSecClassGenericPassword,
        kSecAttrAccount as String: key,
        kSecValueData as String: data,
        kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly,
    ]
    SecItemDelete(query as CFDictionary)
    let status = SecItemAdd(query as CFDictionary, nil)
    return status == errSecSuccess
}
```

## App Transport Security (ATS)
- Keep ATS enabled in production (never disable globally)
- Use exception domains only for known third-party services that require HTTP
- Document all ATS exceptions in code review

```xml
<!-- Info.plist — ONLY if absolutely necessary -->
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSExceptionDomains</key>
    <dict>
        <key>legacy-api.example.com</key>
        <dict>
            <key>NSExceptionAllowsInsecureHTTPLoads</key>
            <true/>
        </dict>
    </dict>
</dict>
```

## Code Signing
- Use automatic code signing with Xcode managed profiles
- For CI/CD, use EAS Build (managed) or match (bare RN)
- Never commit provisioning profiles or certificates to git
- Use App Groups for sharing data between app and extensions

## Privacy Manifest (iOS 17+)
- Declare privacy-sensitive API usage in `PrivacyInfo.xcprivacy`
- Required for App Store submission
- Document reasons for UserDefaults, file timestamp, system boot time APIs
```

- [ ] **Step 4: Create rules/native-ios/testing.md**

```markdown
---
description: iOS native testing patterns for React Native modules
globs: "**/*.swift"
alwaysApply: false
---

# iOS Native Testing

## XCTest for Native Modules
- Test native module logic independent of React Native bridge
- Mock RN bridge callbacks in tests
- Test error handling and edge cases

```swift
import XCTest
@testable import MyApp

final class AuthModuleTests: XCTestCase {
    var sut: AuthModule!

    override func setUp() {
        super.setUp()
        sut = AuthModule()
    }

    func testValidTokenReturnsUser() async throws {
        let user = try await sut.validateToken("valid-token")
        XCTAssertNotNil(user)
        XCTAssertEqual(user.id, "expected-id")
    }

    func testExpiredTokenThrows() async {
        do {
            _ = try await sut.validateToken("expired-token")
            XCTFail("Expected error")
        } catch {
            XCTAssertEqual(error as? AuthError, .tokenExpired)
        }
    }
}
```

## XCUITest for UI Testing
- Test native UI components with XCUITest
- Use accessibility identifiers for element queries
- Test SwiftUI views rendered via expo-ui

```swift
import XCTest

final class MyWidgetUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launch()
    }

    func testWidgetDisplaysTitle() {
        let title = app.staticTexts["widget-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.label, "Expected Title")
    }
}
```

## Performance Testing
- Use `measure` block for performance benchmarks
- Set baselines for critical operations
- Test on real devices (not just simulator) for accurate metrics

```swift
func testDataProcessingPerformance() {
    let largeDataset = generateTestData(count: 10_000)
    measure {
        _ = sut.processData(largeDataset)
    }
}
```
```

- [ ] **Step 5: Create rules/native-android/coding-style.md**

```markdown
---
description: Kotlin and Java coding conventions for React Native native modules
globs: "**/*.{kt,java}"
alwaysApply: false
---

# Android Native Coding Style

## Kotlin-First
- Kotlin is the primary language for all new native code
- Java only for legacy code maintenance
- Use Kotlin idioms (data classes, sealed classes, extension functions)

```kotlin
// GOOD — Kotlin idioms
data class UserData(val id: String, val name: String, val email: String)

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
}

fun String.toUserData(): UserData = Json.decodeFromString(this)

// BAD — Java patterns in Kotlin
class UserData {
    private var id: String? = null
    private var name: String? = null
    fun getId(): String? = id
    fun setId(id: String?) { this.id = id }
}
```

## Coroutines Over Callbacks
- Use `suspend` functions for async operations
- Use `withContext(Dispatchers.IO)` for blocking operations
- Never block the main thread
- Use `Flow` for reactive data streams

```kotlin
// GOOD — Coroutines
suspend fun fetchUser(id: String): User = withContext(Dispatchers.IO) {
    api.getUser(id)
}

// BAD — Callback hell
fun fetchUser(id: String, callback: (User?, Error?) -> Unit) {
    thread {
        try {
            val user = api.getUser(id)
            Handler(Looper.getMainLooper()).post { callback(user, null) }
        } catch (e: Exception) {
            Handler(Looper.getMainLooper()).post { callback(null, e) }
        }
    }
}
```

## Jetpack Compose Integration (expo-ui)
- Use Compose for custom native views exposed to React Native
- Keep Compose components stateless when possible
- Use `@Preview` for visual development

```kotlin
@Composable
fun NativeChart(
    data: List<Double>,
    modifier: Modifier = Modifier,
    onPointSelected: (Int) -> Unit = {},
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        // Draw chart
    }
}
```

## Naming
- Classes: `PascalCase` (`UserRepository`, `AuthModule`)
- Functions/properties: `camelCase` (`getUser()`, `isLoggedIn`)
- Constants: `SCREAMING_SNAKE_CASE` (`MAX_RETRY_COUNT`)
- Packages: `lowercase` (`com.myapp.modules`)
```

- [ ] **Step 6: Create rules/native-android/patterns.md**

```markdown
---
description: Android native module implementation patterns for React Native
globs: "**/*.{kt,java}"
alwaysApply: false
---

# Android Native Patterns

## Turbo Module Kotlin Implementation
- Implement codegen spec interface in Kotlin
- Use `@ReactModule` annotation for module registration
- Bridge Kotlin coroutines with React Native Promises

```kotlin
package com.myapp.modules

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*

@ReactModule(name = MyModule.NAME)
class MyModule(reactContext: ReactApplicationContext) :
    NativeMyModuleSpec(reactContext) {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun getName() = NAME

    override fun getData(key: String, promise: Promise) {
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { repository.getData(key) }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERR_DATA", e.message, e)
            }
        }
    }

    companion object {
        const val NAME = "MyModule"
    }
}
```

## Fabric ViewManager
- Extend `SimpleViewManager<T>` for custom native views
- Use `@ReactProp` annotation for JS-settable properties
- Implement `createViewInstance` and property setters

```kotlin
class ChartViewManager : SimpleViewManager<ChartView>() {
    override fun getName() = "ChartView"

    override fun createViewInstance(context: ThemedReactContext) = ChartView(context)

    @ReactProp(name = "data")
    fun setData(view: ChartView, data: ReadableArray) {
        view.setDataPoints(data.toArrayList().map { (it as Double) })
    }

    @ReactProp(name = "color")
    fun setColor(view: ChartView, color: String) {
        view.setChartColor(Color.parseColor(color))
    }
}
```

## Gradle Plugin Conventions
- Use convention plugins in `buildSrc/` for shared config
- Configure build types consistently (debug, release, staging)
- Use version catalogs (`libs.versions.toml`) for dependency management

## Event Emission
- Use `RCTDeviceEventEmitter` to send events to JS
- Define event names as constants
- Clean up listeners in module `onCatalystInstanceDestroy`
```

- [ ] **Step 7: Create rules/native-android/security.md**

```markdown
---
description: Android-specific security practices for React Native apps
globs: "**/*.{kt,java,xml}"
alwaysApply: false
---

# Android Security

## Android Keystore
- Use Android Keystore for cryptographic key storage
- Never store keys in SharedPreferences or files
- Use `EncryptedSharedPreferences` for sensitive key-value data

```kotlin
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

fun getSecurePrefs(context: Context): SharedPreferences {
    val masterKey = MasterKey.Builder(context)
        .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
        .build()

    return EncryptedSharedPreferences.create(
        context,
        "secure_prefs",
        masterKey,
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )
}
```

## R8 / ProGuard Rules for React Native
- Enable R8 for release builds (default in modern AGP)
- Add keep rules for React Native classes
- Keep native module classes and their methods
- Test release builds to verify no ProGuard issues

```proguard
# proguard-rules.pro
# React Native
-keep class com.facebook.react.** { *; }
-keep class com.facebook.hermes.** { *; }

# Your native modules
-keep class com.myapp.modules.** { *; }
-keepclassmembers class com.myapp.modules.** {
    @com.facebook.react.bridge.ReactMethod <methods>;
}

# Hermes
-keep class com.facebook.jni.** { *; }
```

## Network Security Config
- Define `network_security_config.xml` for all projects
- Disable cleartext traffic globally in production
- Pin certificates for critical API endpoints
- Allow cleartext only for localhost in debug builds

```xml
<!-- res/xml/network_security_config.xml -->
<network-security-config>
    <base-config cleartextTrafficPermitted="false">
        <trust-anchors>
            <certificates src="system" />
        </trust-anchors>
    </base-config>
    <debug-overrides>
        <trust-anchors>
            <certificates src="user" />
        </trust-anchors>
    </debug-overrides>
</network-security-config>
```

## Biometric Authentication
- Use `BiometricPrompt` API for fingerprint/face auth
- Always provide fallback to device credentials
- Store auth tokens in Keystore after biometric verification
```

- [ ] **Step 8: Create rules/native-android/testing.md**

```markdown
---
description: Android native testing patterns for React Native modules
globs: "**/*.{kt,java}"
alwaysApply: false
---

# Android Native Testing

## JUnit 5 for Native Modules
- Test module logic independent of React Native bridge
- Use MockK for Kotlin mocking
- Test coroutine-based code with `runTest`

```kotlin
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class AuthModuleTest {
    private val repository = mockk<AuthRepository>()
    private val module = AuthModule(repository)

    @Test
    fun `validateToken returns user for valid token`() = runTest {
        val expectedUser = User("id-1", "Test User")
        coEvery { repository.validate("valid-token") } returns expectedUser

        val result = module.validateToken("valid-token")
        assertEquals(expectedUser, result)
    }

    @Test
    fun `validateToken throws for expired token`() = runTest {
        coEvery { repository.validate("expired") } throws TokenExpiredException()

        assertThrows(TokenExpiredException::class.java) {
            runBlocking { module.validateToken("expired") }
        }
    }
}
```

## Espresso for UI Testing
- Test native views and Compose components
- Use `ActivityScenarioRule` for activity lifecycle
- Combine with Detox for cross-platform E2E

```kotlin
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*

@RunWith(AndroidJUnit4::class)
class ChartViewTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun chartDisplaysDataPoints() {
        onView(withContentDescription("chart-view"))
            .check(matches(isDisplayed()))
    }
}
```

## Compose Testing
- Use `createComposeRule` for Compose component tests
- Test UI state and interactions
- Use semantic matchers for assertions

```kotlin
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule

class NativeChartTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun chartRendersWithData() {
        composeTestRule.setContent {
            NativeChart(data = listOf(1.0, 2.0, 3.0))
        }
        composeTestRule.onNodeWithContentDescription("chart")
            .assertIsDisplayed()
    }
}
```

## Instrumentation Tests
- Run on real device or emulator for accurate results
- Test native module integration with React Native bridge
- Verify ProGuard doesn't break native module reflection
```

- [ ] **Step 9: Verify all 16 platform rule files**

Run: `ls -la rules/expo/ rules/bare-rn/ rules/native-ios/ rules/native-android/`
Expected: 4 `.md` files in each directory (16 total).

Run: `find rules/ -name "*.md" | wc -l`
Expected: 25 total (9 common + 4 expo + 4 bare-rn + 4 native-ios + 4 native-android).

---

## Chunk 4: Commands Part 1

### Task 7: Core Workflow Commands (plan, code-review, tdd, build-fix, perf, upgrade, native-module, navigate)

**Files:**
- Create: `commands/plan.md`, `commands/code-review.md`, `commands/tdd.md`, `commands/build-fix.md`
- Create: `commands/perf.md`, `commands/upgrade.md`, `commands/native-module.md`, `commands/navigate.md`

- [ ] **Step 1: Create commands/plan.md**

```markdown
---
name: plan
description: Design feature architecture using the architect agent
---

# /plan — Feature Architecture Design

You are executing the `/plan` command. Use the **architect** agent to design a feature architecture.

## Process

1. **Understand the requirement** — Ask clarifying questions if the feature description is vague
2. **Analyze existing codebase** — Read relevant files, understand current navigation structure, state management, and API patterns
3. **Design the architecture** — Using the architect agent's process:
   - Decompose into components and screens
   - Plan Expo Router file structure
   - Select state management approach (Zustand / TanStack Query / local)
   - Design data flow and API layer
   - Consider platform-specific requirements
4. **Output the plan** — Use the architect agent's output format:

### Architecture Output

```
## Overview
[1-2 sentence description of the feature]

## File Structure
[New files to create with paths]

## Component Design
[Component hierarchy and responsibilities]

## Data Flow
[State management approach, API calls, caching strategy]

## Navigation
[New routes, layout changes, deep link support]

## Implementation Tasks
[Ordered list of implementation steps]
```

5. **Review with user** — Present the plan and ask for approval before implementation

## Notes
- Reference `rules/common/patterns.md` and `rules/common/navigation.md` for conventions
- Consider whether this is Expo managed, bare RN, or has native modules
- Include test strategy in the plan
```

- [ ] **Step 2: Create commands/code-review.md**

```markdown
---
name: code-review
description: Comprehensive code review combining code quality and performance analysis
---

# /code-review — Full Code Review

You are executing the `/code-review` command. Run **code-reviewer** and **performance-profiler** agents in parallel for comprehensive review.

## Parallel Execution

Launch both agents simultaneously:

### Agent 1: code-reviewer
Review the specified code for:
1. **Re-render issues** — Unnecessary renders, missing memoization, unstable references
2. **React Native anti-patterns** — Direct style mutations, ScrollView for long lists, Animated API usage
3. **Platform parity** — iOS/Android behavioral differences, platform-specific bugs
4. **Expo SDK validation** — Correct module usage, deprecated APIs, config issues
5. **Accessibility** — Missing labels, touch target sizes, screen reader support
6. **Security** — Hardcoded secrets, insecure storage, unvalidated deep links

### Agent 2: performance-profiler
Analyze for performance issues:
1. **Rendering** — Component render counts, unnecessary re-renders
2. **Bundle size** — Large imports, tree-shaking opportunities
3. **Memory** — Listener cleanup, large object retention
4. **Animations** — JS thread animations, Reanimated opportunities

## Output Format

Combine results from both agents, grouped by severity:

```
## Critical (must fix before merge)
[Issues from both agents]

## Warnings (should fix)
[Issues from both agents]

## Suggestions (nice to have)
[Issues from both agents]

## Positive Observations
[Good patterns found]
```

## Notes
- If agent-device is available, take screenshots to verify UI rendering
- Apply rules from `rules/common/` and active platform layer
- Flag any violations of project rules
```

- [ ] **Step 3: Create commands/tdd.md**

```markdown
---
name: tdd
description: Test-driven development workflow with Jest and React Native Testing Library
---

# /tdd — Test-Driven Development

You are executing the `/tdd` command. Use the **tdd-guide** agent to implement features test-first.

## Red-Green-Refactor Cycle

### 1. RED — Write Failing Test First
```tsx
// Write the test BEFORE any implementation
test('LoginButton shows loading state during auth', () => {
  render(<LoginButton onPress={mockAuth} />);
  fireEvent.press(screen.getByRole('button', { name: 'Log In' }));
  expect(screen.getByTestId('loading-spinner')).toBeVisible();
});
```
Run the test — confirm it FAILS (red).

### 2. GREEN — Write Minimum Code to Pass
Implement only enough code to make the test pass. Do not over-engineer.

### 3. REFACTOR — Clean Up
Improve code quality while keeping tests green:
- Extract shared logic into hooks
- Improve naming and readability
- Remove duplication

## Testing Stack
- **Unit/Component**: Jest + React Native Testing Library
- **E2E**: Detox (when needed for user flows)

## Workflow
1. User describes the feature to implement
2. Write test(s) for the first behavior
3. Run test — verify it fails
4. Implement minimum code
5. Run test — verify it passes
6. Refactor if needed
7. Repeat for next behavior
8. When feature is complete, run full test suite

## Rules
- Never write implementation code without a failing test first
- Test behavior, not implementation details
- Query elements by role, text, or label (not testID unless necessary)
- Mock at boundaries (API, native modules), not internals
- Reference `rules/common/testing.md` for conventions
```

- [ ] **Step 4: Create commands/build-fix.md**

```markdown
---
name: build-fix
description: Diagnose and fix build failures using the expo-config-resolver agent
---

# /build-fix — Fix Build Failures

You are executing the `/build-fix` command. Use the **expo-config-resolver** agent to diagnose and fix build errors.

## Diagnostic Process

1. **Identify the error** — Read build logs, identify the failure point
2. **Classify the error type**:
   - EAS Build failure (cloud build)
   - Local `expo prebuild` failure
   - iOS build failure (CocoaPods, Xcode, provisioning)
   - Android build failure (Gradle, ProGuard, multidex)
   - Metro bundler error
   - Config plugin error
3. **Diagnose root cause** — Check common causes per error type
4. **Apply fix** — Make targeted changes
5. **Verify** — Rebuild and confirm fix

## Common Fixes

### EAS Build
- Validate `eas.json` build profiles
- Check `app.json` / `app.config.ts` for typos
- Verify Expo SDK compatibility with dependencies
- Check EAS Build logs for native compilation errors

### iOS
- `pod install` issues → delete `Podfile.lock` + `pod install --repo-update`
- Provisioning → verify Apple Developer account + certificates
- Privacy manifest → add `PrivacyInfo.xcprivacy` declarations
- Module not found → check header search paths

### Android
- Gradle sync → check `minSdkVersion` alignment
- ProGuard → add keep rules for broken classes
- Multidex → enable in `build.gradle`
- NDK → verify Hermes / JSC compatibility

## Output Format
```
## Error Analysis
[Error message and classification]

## Root Cause
[Why the build failed]

## Fix Applied
[Changes made with file paths]

## Verification
[Build command to run, expected result]
```
```

- [ ] **Step 5: Create commands/perf.md**

```markdown
---
name: perf
description: Performance profiling and optimization using the performance-profiler agent
---

# /perf — Performance Profiling

You are executing the `/perf` command. Use the **performance-profiler** agent to diagnose and fix performance issues.

## Diagnostic Areas

### 1. Rendering Performance (FPS)
- Check for unnecessary re-renders with React DevTools Profiler
- Identify components re-rendering without prop changes
- Look for missing `React.memo`, `useCallback`, `useMemo`
- Detect inline function/object creation in render

### 2. Time to Interactive (TTI)
- Analyze app startup sequence
- Check for heavy `useEffect` chains on mount
- Identify blocking operations on main thread
- Verify Hermes bytecode compilation

### 3. Bundle Size
- Run `npx react-native-bundle-visualizer`
- Identify large dependencies
- Check for unused imports and dead code
- Verify tree-shaking is working

### 4. Memory
- Check for listener/subscription cleanup in `useEffect`
- Identify large objects retained in closures
- Look for image caching issues
- Detect circular references

### 5. Animations
- Verify all animations use Reanimated (not Animated API)
- Check for JS thread bottlenecks in animation callbacks
- Identify layout thrashing during animations
- Measure actual FPS during animations

### 6. Hermes Engine
- Verify Hermes is enabled
- Check for unsupported JS features
- Profile with Hermes sampling profiler
- Analyze bytecode compilation output

## Output Format
```
## Performance Metrics
| Metric | Current | Target | Status |
|--------|---------|--------|--------|
| JS FPS | 45 | 60 | ⚠️ |
| UI FPS | 58 | 60 | ✅ |
| TTI | 3.2s | <2s | ❌ |
| Bundle | 8.2MB | <5MB | ❌ |

## Critical Issues
[Issues that must be fixed]

## Optimization Opportunities
[Improvements ranked by impact]
```

## Notes
- If agent-device is available, measure actual FPS on device
- Reference `rules/common/performance.md` for optimization patterns
- Profile on real devices, not simulator/emulator
```

- [ ] **Step 6: Create commands/upgrade.md**

```markdown
---
name: upgrade
description: Version migration for Expo SDK and React Native using the upgrade-assistant agent
---

# /upgrade — Version Migration

You are executing the `/upgrade` command. Use the **upgrade-assistant** agent for guided version migration.

## 5-Step Upgrade Process

### Step 1: Pre-Assessment
- Identify current versions (Expo SDK, React Native, key dependencies)
- Identify target versions
- Check release notes and breaking changes
- Backup current state (`git stash` or commit)

### Step 2: Dependency Compatibility Matrix
Generate a compatibility table:

```
| Package | Current | Target | Compatible? | Notes |
|---------|---------|--------|-------------|-------|
| expo | 51.0.0 | 52.0.0 | ✅ | Major upgrade |
| react-native | 0.74 | 0.76 | ✅ | Via Expo SDK |
| @react-navigation | 6.x | 7.x | ⚠️ | Breaking changes |
```

### Step 3: Breaking Change Detection
- Scan codebase for deprecated APIs being used
- Identify removed features
- Check for changed behavior in dependencies
- Flag native module compatibility issues

### Step 4: Migration Steps
Execute the upgrade:

**Expo projects:**
```bash
npx expo install expo@latest
npx expo install --fix  # Fix peer dependency issues
npx expo prebuild --clean  # Regenerate native projects
```

**Bare RN projects:**
```bash
npx react-native upgrade
# Or use upgrade-helper: https://react-native-community.github.io/upgrade-helper/
```

- Apply codemods when available
- Update deprecated API calls
- Fix TypeScript type changes
- Update config files

### Step 5: Post-Upgrade Verification
- [ ] TypeScript compiles without errors
- [ ] ESLint passes
- [ ] All tests pass
- [ ] iOS build succeeds
- [ ] Android build succeeds
- [ ] Manual smoke test on both platforms

## Output Format
```
## Upgrade Summary
From: [current versions]
To: [target versions]

## Breaking Changes Found
[List with file locations]

## Changes Applied
[Files modified with descriptions]

## Verification Checklist
[Status of each verification step]
```
```

- [ ] **Step 7: Create commands/native-module.md**

```markdown
---
name: native-module
description: Create native modules with sequential native-bridge-builder then code-reviewer agents
---

# /native-module — Create Native Module

You are executing the `/native-module` command. Run **native-bridge-builder** first (create the module), then **code-reviewer** (review it). This is sequential, not parallel.

## Phase 1: native-bridge-builder — Scaffold & Implement

### Determine Module Type
Ask the user or detect from project:
1. **Expo Modules API** — For Expo managed projects (recommended)
2. **Turbo Module** — For bare React Native projects (New Architecture)
3. **Fabric Component** — For custom native views

### Scaffold the Module
Generate all required files based on module type:

**Expo Module (6 files):**
```
modules/[module-name]/
  expo-module.config.json     # Module configuration
  src/[ModuleName]Module.ts   # TypeScript API definition
  ios/[ModuleName]Module.swift # Swift implementation
  android/src/main/java/.../[ModuleName]Module.kt  # Kotlin implementation
  src/__tests__/[ModuleName].test.ts  # Unit tests
  README.md                   # Usage documentation
```

### Implementation Guidelines
- Define clear TypeScript interface first (contract)
- Implement Swift and Kotlin to match the contract
- Handle errors consistently (reject Promises with error codes)
- Use `async/await` in Swift, coroutines in Kotlin
- Include JSDoc comments on the TypeScript API

## Phase 2: code-reviewer — Review the Module

After module creation, automatically run code review:
- Verify TypeScript types match native implementations
- Check error handling on both platforms
- Validate threading (no main thread blocking)
- Review memory management (cleanup, listeners)
- Check platform parity (same behavior iOS/Android)

## Output
- Scaffolded module files with implementation
- Code review results
- Usage example in React Native
```

- [ ] **Step 8: Create commands/navigate.md**

```markdown
---
name: navigate
description: Design navigation architecture using the architect agent
---

# /navigate — Navigation Design

You are executing the `/navigate` command. Use the **architect** agent to design navigation structure.

## Process

1. **Map the screens** — List all screens and their relationships
2. **Design the hierarchy** — Determine navigation stacks, tabs, drawers
3. **Plan Expo Router file structure** — Map screens to file-based routes

## Output: Expo Router File Structure

```
app/
  _layout.tsx              # Root Stack
  index.tsx                # Redirect to (tabs)
  +not-found.tsx           # 404 screen
  (tabs)/
    _layout.tsx            # Tab navigator
    index.tsx              # Home tab
    search.tsx             # Search tab
    profile.tsx            # Profile tab
  (auth)/
    _layout.tsx            # Auth stack (no tabs)
    login.tsx
    register.tsx
    forgot-password.tsx
  [entity]/
    _layout.tsx            # Entity detail stack
    [id].tsx               # Entity detail screen
    [id]/edit.tsx           # Edit screen
  modal/
    _layout.tsx            # Modal group
    settings.tsx           # Settings modal
    create-post.tsx        # Create post modal
```

3. **Define navigation patterns**:
   - Tab-to-detail: How tabs navigate to detail screens
   - Auth flow: How unauthenticated users are redirected
   - Deep linking: URL scheme mapping
   - Modal presentation: Full-screen vs bottom sheet

4. **Generate layout files** — Create `_layout.tsx` files with proper configuration:

```tsx
// app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ tabBarActiveTintColor: '#007AFF' }}>
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ... }} />
      <Tabs.Screen name="search" options={{ title: 'Search', tabBarIcon: ... }} />
      <Tabs.Screen name="profile" options={{ title: 'Profile', tabBarIcon: ... }} />
    </Tabs>
  );
}
```

## Notes
- Reference `rules/common/navigation.md` for conventions
- Consider deep link testing: `npx uri-scheme open [url] --ios`
- Include typed route definitions
```

- [ ] **Step 9: Verify 8 command files (Part 1)**

Run: `ls -la commands/`
Expected: At least 8 `.md` files (plan, code-review, tdd, build-fix, perf, upgrade, native-module, navigate).

---

## Chunk 5: Commands Part 2 (Task 8)

### Task 8: Extended & Script-Driven Commands

Write remaining 8 slash command files. Three are agent-driven, three are parallel multi-agent, and three are script-driven.

**Files to create (8):**
- `commands/animate.md` — ui-designer agent
- `commands/deploy.md` — expo-config-resolver + code-reviewer (parallel)
- `commands/component.md` — ui-designer + tdd-guide (parallel)
- `commands/debug.md` — performance-profiler agent
- `commands/learn.md` — script-driven (continuous-learning-v2)
- `commands/quality-gate.md` — code-reviewer + performance-profiler (parallel)
- `commands/retrospective.md` — script-driven (evaluate-session.js)
- `commands/setup-device.md` — script-driven (agent-device setup)

**Steps:**

- [ ] **Step 1: Create commands/animate.md**

```markdown
---
name: animate
description: Implement animations using the ui-designer agent with Reanimated and Gesture Handler
---

# /animate — Implement Animations

You are executing the `/animate` command. Use the **ui-designer** agent to implement animations.

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
```

- [ ] **Step 2: Create commands/deploy.md**

```markdown
---
name: deploy
description: Validate and submit app builds using parallel expo-config-resolver and code-reviewer agents
---

# /deploy — Validate & Submit

You are executing the `/deploy` command. Run **expo-config-resolver** and **code-reviewer** in parallel. One validates build/deploy config, the other reviews code quality.

## Parallel Execution

### Agent 1: expo-config-resolver — Build & Deploy Validation

Check all deployment prerequisites:

**EAS Configuration:**
- `eas.json` profiles are correct for target channel (preview/production)
- `app.config.ts` version and build numbers are bumped
- Runtime version policy is set correctly for OTA updates
- Environment variables and secrets are configured in EAS

**Platform-Specific Checks:**

*iOS:*
- Bundle identifier matches Apple Developer account
- Provisioning profiles are valid (not expired)
- Capabilities (push, sign-in, etc.) match entitlements
- Privacy descriptions (NSCameraUsageDescription, etc.) are present
- App Store Connect metadata is ready

*Android:*
- Package name matches Play Console listing
- Signing key is configured in EAS credentials
- `google-services.json` is current (if using Firebase)
- Target SDK meets Play Store requirements
- Content rating questionnaire is completed

**OTA Update Validation:**
- Check if OTA update is sufficient vs new native build needed
- Verify runtime version compatibility
- Test update on preview channel first

### Agent 2: code-reviewer — Pre-Submit Code Review

Focus on production readiness:
- No `console.log` statements
- No debug flags (`__DEV__` guards are correct)
- Error boundaries are in place
- Crash reporting is configured
- Analytics events are correct
- No hardcoded API URLs (use environment config)
- Feature flags for staged rollout

## Output

```
## Deploy Readiness Report

### Build Configuration
[✓] EAS profile: production
[✓] Version: 2.1.0 (build 42)
[✓] Runtime version: 2.1.0

### iOS Readiness
[✓] Provisioning: valid (expires 2027-01-15)
[✓] Capabilities match entitlements
[!] Missing NSMicrophoneUsageDescription (add if using audio)

### Android Readiness
[✓] Signing key configured
[✓] Target SDK: 34 (meets requirement)
[✓] google-services.json is current

### Code Review
[✓] No console.log in production paths
[!] 2 TODO comments in checkout flow
[✓] Error boundaries present

### Recommended Deploy Command
eas build --platform all --profile production
eas submit --platform all
```
```

- [ ] **Step 3: Create commands/component.md**

```markdown
---
name: component
description: Design and test UI components using parallel ui-designer and tdd-guide agents
---

# /component — Design + Test Component

You are executing the `/component` command. Run **ui-designer** and **tdd-guide** in parallel. One designs the component, the other writes tests.

## Parallel Execution

### Agent 1: ui-designer — Component Design

1. **Clarify requirements** — What does the component do? What states does it have?
2. **Design with NativeWind** — Use Tailwind classes for styling:

```tsx
import { View, Text, Pressable } from 'react-native';

interface CardProps {
  title: string;
  subtitle?: string;
  onPress?: () => void;
  variant?: 'default' | 'outlined' | 'elevated';
}

export function Card({ title, subtitle, onPress, variant = 'default' }: CardProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-2xl p-4',
        variant === 'default' && 'bg-card',
        variant === 'outlined' && 'border border-border bg-transparent',
        variant === 'elevated' && 'bg-card shadow-md',
      )}
    >
      <Text className="text-lg font-semibold text-foreground">{title}</Text>
      {subtitle && (
        <Text className="mt-1 text-sm text-muted-foreground">{subtitle}</Text>
      )}
    </Pressable>
  );
}
```

3. **Handle all states** — Loading, error, empty, populated, disabled
4. **Add accessibility** — `accessibilityRole`, `accessibilityLabel`, `accessibilityState`
5. **Platform adaptation** — Use `Platform.select` or NativeWind responsive for platform differences
6. **Consider agent-device** — If available, render on simulator and screenshot for visual verification

### Agent 2: tdd-guide — Component Tests

Write comprehensive tests alongside the component:

```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { Card } from './Card';

describe('Card', () => {
  it('renders title', () => {
    render(<Card title="Test Title" />);
    expect(screen.getByText('Test Title')).toBeTruthy();
  });

  it('renders subtitle when provided', () => {
    render(<Card title="Title" subtitle="Subtitle" />);
    expect(screen.getByText('Subtitle')).toBeTruthy();
  });

  it('hides subtitle when not provided', () => {
    render(<Card title="Title" />);
    expect(screen.queryByText('Subtitle')).toBeNull();
  });

  it('calls onPress when tapped', () => {
    const onPress = jest.fn();
    render(<Card title="Title" onPress={onPress} />);
    fireEvent.press(screen.getByText('Title'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('applies variant styles', () => {
    // Test each variant renders correctly
  });
});
```

## Output
- Component file with full implementation
- Test file with comprehensive coverage
- Usage examples
- Screenshot (if agent-device available)
```

- [ ] **Step 4: Create commands/debug.md**

```markdown
---
name: debug
description: Systematic diagnosis of bugs using the performance-profiler agent
---

# /debug — Systematic Diagnosis

You are executing the `/debug` command. Use the **performance-profiler** agent for systematic bug diagnosis.

## Process

### Step 1: Reproduce
Define exact reproduction steps:
1. Starting state
2. Actions taken
3. Expected behavior
4. Actual behavior
5. Environment (device, OS, Expo SDK version)

### Step 2: Classify the Bug

| Category | Indicators | First Check |
|----------|-----------|-------------|
| **Crash** | App terminates | Check Metro logs, Hermes stack trace |
| **Render** | Visual glitch, wrong layout | Check component tree, re-render count |
| **State** | Wrong data displayed | Check Zustand store, TanStack Query cache |
| **Navigation** | Wrong screen, broken back | Check Expo Router history, params |
| **Performance** | Jank, slow response | Check FPS, bundle size, memory |
| **Network** | Failed API calls | Check request/response, auth tokens |
| **Native** | Platform-specific issue | Check native logs (Xcode/Logcat) |

### Step 3: Investigate

**JavaScript layer:**
```bash
# Check Metro bundler logs
# Search for errors/warnings in console output
# Add strategic console.log at suspected points
```

**React layer:**
- Component re-render tracking (React DevTools)
- Props/state inspection
- Effect dependency analysis

**Native layer (if agent-device available):**
- Screenshot current state
- Navigate through repro steps visually
- Capture native crash logs

### Step 4: Fix & Verify
1. Identify root cause
2. Implement minimal fix
3. Verify fix resolves the issue
4. Check for regression (run related tests)
5. Document what caused it and why

## Output
```
## Bug Report

### Summary
[One-line description]

### Root Cause
[Technical explanation]

### Fix Applied
[Files changed with explanation]

### Verification
[Steps taken to verify fix]
[Test results]
```
```

- [ ] **Step 5: Create commands/learn.md**

```markdown
---
name: learn
description: Manual skill generation — runs continuous-learning-v2 scripts to extract patterns from session
---

# /learn — Generate Skills from Session

You are executing the `/learn` command. This is **script-driven** — it runs the continuous-learning-v2 pipeline directly.

## What This Does

Analyzes the current coding session to extract reusable patterns and save them as skills or rule amendments for future sessions. This is the manual trigger for what `PostToolUse` hooks do automatically.

## Process

1. **Run the extraction script:**

```bash
node .claude/hooks/scripts/extract-session-patterns.js
```

This script:
- Scans recent tool calls and file changes
- Identifies patterns (repeated fixes, style corrections, common architectures)
- Compares against existing rules and skills
- Generates candidates for new content

2. **Review candidates:**
The script outputs a list of potential learnings:
```
[PATTERN] Zustand store always uses immer middleware → Suggest rule amendment
[PATTERN] All screens use SafeAreaView wrapper → Suggest coding-style rule
[PATTERN] API calls always retry 3 times → Suggest pattern rule
[SKILL] Complex form validation flow → Suggest skill creation
```

3. **Approve or reject each candidate:**
For each candidate, decide:
- **Approve** → Script writes to `.claude/rules/` or `.claude/skills/`
- **Reject** → Skip this pattern
- **Edit** → Modify before saving

4. **Validate new content:**
```bash
node .claude/hooks/scripts/validate-content.js
```
Ensures new rules/skills have valid frontmatter and don't conflict with existing content.

## When to Use
- After a long coding session where you established new patterns
- When you notice yourself repeatedly making the same corrections
- After integrating a new library and establishing conventions
- Periodically to capture accumulated project knowledge

## Note
The automatic `PostToolUse` hook (`continuous-learning-v2.cjs`) does lightweight extraction after every tool call. This `/learn` command runs a comprehensive analysis that catches patterns the real-time hook might miss.
```

- [ ] **Step 6: Create commands/quality-gate.md**

```markdown
---
name: quality-gate
description: Pre-merge quality checks using parallel code-reviewer and performance-profiler agents
---

# /quality-gate — Pre-Merge Checks

You are executing the `/quality-gate` command. Run **code-reviewer** and **performance-profiler** in parallel for comprehensive pre-merge validation.

## Parallel Execution

### Agent 1: code-reviewer — Code Quality

Run a full code review focused on merge readiness:

**Correctness:**
- Logic errors, edge cases
- TypeScript type safety (no `any` escapes)
- Error handling completeness

**Style & Conventions:**
- Follows project rules (check `.claude/rules/`)
- NativeWind usage is consistent
- Component structure matches patterns

**Security:**
- No secrets in code
- Input validation at boundaries
- Secure storage used for sensitive data

**Testing:**
- All new code has tests
- Tests actually test behavior (not implementation)
- Edge cases covered

### Agent 2: performance-profiler — Performance Checks

Run performance validation:

**Bundle Impact:**
```bash
# Compare bundle size before/after changes
npx react-native-bundle-visualizer
```

**Runtime Checks:**
- No unnecessary re-renders introduced
- Lists use `FlashList` with `estimatedItemSize`
- Images are optimized (expo-image with caching)
- Animations run on UI thread (worklets)

**Memory:**
- Event listeners and subscriptions cleaned up
- No circular references in state
- Large data sets paginated

## Gate Result

```
## Quality Gate Result: PASS / FAIL

### Code Review: PASS
- 0 Critical issues
- 1 Warning (TODO in checkout.tsx:45)
- 3 Suggestions

### Performance: PASS
- Bundle size: +12KB (within threshold)
- No new re-render issues detected
- Memory: No leaks detected

### Verdict: PASS ✓
Ready for merge. Address 1 warning in next iteration.
```

The gate produces a binary PASS/FAIL. FAIL if:
- Any critical code review issue
- Bundle size increase > 50KB without justification
- Performance regression detected
- Missing tests for new code paths
```

- [ ] **Step 7: Create commands/retrospective.md**

```markdown
---
name: retrospective
description: Session analysis — runs evaluate-session.js to review work quality and suggest improvements
---

# /retrospective — Session Analysis

You are executing the `/retrospective` command. This is **script-driven** — it runs the session evaluation pipeline.

## What This Does

Analyzes the completed coding session to evaluate quality, identify improvements, and suggest harness enhancements.

## Process

1. **Run the evaluation script:**

```bash
node .claude/hooks/scripts/evaluate-session.js
```

This script analyzes:
- Files created/modified during the session
- Test results and coverage changes
- Build success/failure history
- Hook trigger patterns (which rules fired, which were ignored)
- Time spent in different phases (planning, coding, testing, debugging)

2. **Generate session report:**

```
## Session Retrospective

### Work Summary
- Files changed: 12
- Tests added: 8
- Tests passing: 47/47
- Build status: Success

### Quality Metrics
- Type safety: 100% (no new `any`)
- Test coverage delta: +3.2%
- Bundle size delta: +8KB

### Patterns Observed
- [GOOD] Consistent use of error boundaries
- [GOOD] All new components have tests
- [IMPROVE] 3 files missing JSDoc on public API
- [IMPROVE] 2 effects missing cleanup

### Harness Feedback
- Rule `common/state-management.md` triggered 5 times → Well calibrated
- Rule `expo/patterns.md` never triggered → May need broader globs
- Hook `lint-staged.cjs` caught 2 issues → Working as intended
- Suggestion: Add rule for consistent error message format

### Recommendations
1. Add error message formatting rule
2. Review expo/patterns.md glob coverage
3. Consider adding pre-commit test hook
```

3. **Act on recommendations:**
Review each recommendation and decide whether to implement it now or add to backlog.

## When to Use
- At the end of a significant coding session
- After completing a feature or milestone
- When the harness feels miscalibrated (too many or too few rule triggers)
- Periodically for continuous improvement
```

- [ ] **Step 8: Create commands/setup-device.md**

```markdown
---
name: setup-device
description: Install and configure agent-device MCP server for simulator/emulator control
---

# /setup-device — Setup Device Control

You are executing the `/setup-device` command. This is **script-driven** — it sets up the agent-device MCP server.

## What This Does

Installs and configures the agent-device MCP server so commands like `/debug`, `/perf`, `/component`, and `/deploy` gain visual device interaction capabilities.

## Process

### Step 1: Check Prerequisites

```bash
# iOS: Check for Xcode and simulator
xcodebuild -version
xcrun simctl list devices

# Android: Check for Android Studio and emulator
adb version
emulator -list-avds
```

### Step 2: Install agent-device MCP

Check if already configured in `.claude/settings.json`:
```json
{
  "mcpServers": {
    "agent-device": {
      "command": "npx",
      "args": ["-y", "agent-device"]
    }
  }
}
```

If not present, add the configuration.

### Step 3: Verify Connection

```bash
# Boot a simulator (iOS)
xcrun simctl boot "iPhone 16 Pro"

# Or start an emulator (Android)
emulator -avd Pixel_8_API_35 &
```

Test that agent-device can:
- Take a screenshot
- Detect booted device
- Perform a tap action

### Step 4: Configure Command Integration

After setup, these commands gain enhanced capabilities:

| Command | Enhancement |
|---------|-------------|
| `/debug` | Screenshot reproduction steps, tap through UI |
| `/perf` | Measure real FPS, capture actual jank frames |
| `/component` | Render on device, visual verification screenshot |
| `/deploy` | Launch preview build, verify UI before submit |
| `/build-fix` | Build, install, and launch to verify fix |

### Output

```
## agent-device Setup Complete

### Status
- MCP server: Configured ✓
- iOS Simulator: Available (iPhone 16 Pro)
- Android Emulator: Available (Pixel 8 API 35)

### Capabilities Enabled
- Screenshot capture
- Tap/type/swipe interaction
- App navigation
- Visual verification

### Commands Enhanced
/debug, /perf, /component, /deploy, /build-fix
now have visual device control.
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| iOS simulator not found | Install Xcode, run `xcode-select --install` |
| Android emulator not found | Install Android Studio, create AVD in AVD Manager |
| agent-device fails to connect | Check MCP server config in `.claude/settings.json` |
| Screenshots are black | Wait for device to finish booting, retry |
```

- [ ] **Step 9: Verify 8 command files (Part 2)**

Run: `ls -la commands/`
Expected: 16 total `.md` files (8 from Part 1 + 8 from Part 2: animate, deploy, component, debug, learn, quality-gate, retrospective, setup-device).

---

## Chunk 6: Contexts, MCP Configs, Examples & Verification (Tasks 9-12)

### Task 9: Context Files (3 Behavior Modes)

Write 3 context files that define behavior modes. Contexts modify how the agent works — dev (fast iteration), review (thorough checking), vibe (creative freedom).

**Files to create (3):**
- `contexts/dev.md`
- `contexts/review.md`
- `contexts/vibe.md`

**Steps:**

- [ ] **Step 1: Create contexts/dev.md**

```markdown
---
description: Development mode — build fast, iterate quickly, minimal ceremony
---

# Dev Context

You are in **dev mode**. Prioritize speed and iteration over perfection.

## Behavior Adjustments

- **Skip comprehensive tests** — Write minimal happy-path tests. Full test coverage comes later.
- **Prototype first** — Get working code before optimizing. Use `any` temporarily if it unblocks you (mark with `// TODO: type properly`).
- **Minimal error handling** — Handle the main path. Edge cases can wait.
- **Console.log is fine** — Use it freely for debugging. Clean up before review.
- **Skip docs** — No JSDoc, no README updates during dev mode.
- **Quick commits** — Commit often, messages can be short.

## What NOT to Skip

Even in dev mode, always:
- Use TypeScript (even if types are loose)
- Use functional components (no class components)
- Use Expo Router for navigation (no manual React Navigation setup)
- Keep state management consistent (Zustand for client, TanStack Query for server)
- Run the app to verify changes work

## Hook Profile

Dev mode does NOT override the hook profile. Whatever profile is set in CLAUDE.md or environment still applies. If hooks slow you down, switch to `ERNE_PROFILE=minimal` explicitly.
```

- [ ] **Step 2: Create contexts/review.md**

```markdown
---
description: Review mode — thorough, careful, check edge cases, validate everything
---

# Review Context

You are in **review mode**. Prioritize correctness, quality, and completeness.

## Behavior Adjustments

- **Thorough testing** — Write comprehensive tests including edge cases, error paths, and boundary conditions.
- **Strict types** — No `any`, no `as` casts without justification. Every function has explicit return types.
- **Complete error handling** — Handle all error paths. User-facing errors need friendly messages. Log internal errors.
- **Platform parity** — Verify behavior on both iOS and Android. Check platform-specific edge cases.
- **Accessibility audit** — Every interactive element needs `accessibilityRole`, `accessibilityLabel`. Screen reader tested.
- **Performance check** — Profile re-renders. Verify lists use `FlashList`. Check bundle impact.
- **Security review** — No secrets in code. Validate inputs. Use secure storage for sensitive data.

## Review Checklist

For every file changed, verify:
1. TypeScript types are strict and correct
2. Error boundaries wrap new component trees
3. Tests cover happy path + error path + edge cases
4. Accessibility attributes are present
5. No `console.log` in production paths
6. Imports are minimal (no unused imports)
7. NativeWind classes are consistent with design system

## Hook Profile

Review mode does NOT override the hook profile. The standard or strict profile is recommended for review work. If not already on strict, consider: `export ERNE_PROFILE=strict`.
```

- [ ] **Step 3: Create contexts/vibe.md**

```markdown
---
description: Creative mode — experiment freely, prioritize UX feel over code perfection. Auto-sets minimal hook profile.
---

# Vibe Context

You are in **vibe mode**. Prioritize creativity, experimentation, and UX feel.

## Profile Override

**This context automatically sets the minimal hook profile:**

When this context is activated, treat the hook profile as `minimal` for the entire session. This means:
- Only the `PreCommit` lint-staged hook runs
- No auto-validation on file writes
- No pattern extraction overhead
- Maximum creative freedom

The user can still override by setting `ERNE_PROFILE` explicitly after context activation.

## Behavior Adjustments

- **Experiment freely** — Try multiple approaches. Don't commit to the first solution.
- **Visual first** — Focus on how it looks and feels before worrying about code structure.
- **Animations matter** — Spend time on transitions, micro-interactions, haptic feedback.
- **Break rules creatively** — Inline styles are fine. Magic numbers are fine. Hardcoded colors are fine. Polish later.
- **Use device** — If agent-device is available, render frequently and verify the feel on actual device/simulator.
- **Quick iterations** — Make a change, see it, tweak it, repeat. Fast feedback loop.

## What This Is For

- Prototyping new UI ideas
- Exploring animation possibilities
- Building proof-of-concept flows
- Trying different design approaches
- "Making it feel right"

## After Vibe Mode

When you're happy with the feel, switch to `dev` or `review` context to:
1. Clean up the code (remove magic numbers, extract styles)
2. Add proper types
3. Write tests
4. Make it production-ready
```

- [ ] **Step 4: Verify 3 context files**

Run: `ls -la contexts/`
Expected: 3 `.md` files (dev, review, vibe).

---

### Task 10: MCP Server Configurations (10 JSON Files)

Write 10 MCP server configuration templates. 2 recommended (agent-device, github) and 8 optional. These are JSON config snippets that the installer merges into `.claude/settings.json`.

**Files to create (10):**
- `mcp-configs/agent-device.json`
- `mcp-configs/github.json`
- `mcp-configs/supabase.json`
- `mcp-configs/firebase.json`
- `mcp-configs/figma.json`
- `mcp-configs/sentry.json`
- `mcp-configs/expo-api.json`
- `mcp-configs/appstore-connect.json`
- `mcp-configs/play-console.json`
- `mcp-configs/memory.json`

**Steps:**

- [ ] **Step 5: Create mcp-configs/agent-device.json**

```json
{
  "_meta": {
    "name": "agent-device",
    "description": "Control iOS Simulator and Android Emulator (screenshots, tap, type, swipe, navigate)",
    "category": "recommended",
    "requires": ["Xcode (iOS) or Android Studio (Android)"]
  },
  "command": "npx",
  "args": ["-y", "agent-device"]
}
```

- [ ] **Step 6: Create mcp-configs/github.json**

```json
{
  "_meta": {
    "name": "github",
    "description": "PR management, issue tracking, code search via GitHub MCP",
    "category": "recommended",
    "requires": ["gh CLI authenticated"]
  },
  "command": "npx",
  "args": ["-y", "@anthropic-ai/github-mcp-server"],
  "env": {
    "GITHUB_TOKEN": "${GITHUB_TOKEN}"
  }
}
```

- [ ] **Step 7: Create mcp-configs/supabase.json**

```json
{
  "_meta": {
    "name": "supabase",
    "description": "Backend-as-a-service — database, auth, storage, edge functions",
    "category": "optional",
    "requires": ["Supabase project", "SUPABASE_ACCESS_TOKEN"]
  },
  "command": "npx",
  "args": ["-y", "supabase-mcp-server"],
  "env": {
    "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}",
    "SUPABASE_PROJECT_REF": "${SUPABASE_PROJECT_REF}"
  }
}
```

- [ ] **Step 8: Create mcp-configs/firebase.json**

```json
{
  "_meta": {
    "name": "firebase",
    "description": "Analytics, push notifications, crashlytics, remote config",
    "category": "optional",
    "requires": ["Firebase project", "GOOGLE_APPLICATION_CREDENTIALS"]
  },
  "command": "npx",
  "args": ["-y", "firebase-mcp-server"],
  "env": {
    "GOOGLE_APPLICATION_CREDENTIALS": "${GOOGLE_APPLICATION_CREDENTIALS}",
    "FIREBASE_PROJECT_ID": "${FIREBASE_PROJECT_ID}"
  }
}
```

- [ ] **Step 9: Create mcp-configs/figma.json**

```json
{
  "_meta": {
    "name": "figma",
    "description": "Design-to-code — extract styles, assets, component specs from Figma",
    "category": "optional",
    "requires": ["Figma account", "FIGMA_ACCESS_TOKEN"]
  },
  "command": "npx",
  "args": ["-y", "figma-mcp-server"],
  "env": {
    "FIGMA_ACCESS_TOKEN": "${FIGMA_ACCESS_TOKEN}"
  }
}
```

- [ ] **Step 10: Create mcp-configs/sentry.json**

```json
{
  "_meta": {
    "name": "sentry",
    "description": "Crash reporting, performance monitoring, error tracking",
    "category": "optional",
    "requires": ["Sentry project", "SENTRY_AUTH_TOKEN"]
  },
  "command": "npx",
  "args": ["-y", "sentry-mcp-server"],
  "env": {
    "SENTRY_AUTH_TOKEN": "${SENTRY_AUTH_TOKEN}",
    "SENTRY_ORG": "${SENTRY_ORG}",
    "SENTRY_PROJECT": "${SENTRY_PROJECT}"
  }
}
```

- [ ] **Step 11: Create mcp-configs/expo-api.json**

```json
{
  "_meta": {
    "name": "expo-api",
    "description": "EAS Build status, update channels, project info via Expo API",
    "category": "optional",
    "requires": ["Expo account", "EXPO_TOKEN"]
  },
  "command": "npx",
  "args": ["-y", "erne-expo-mcp-server"],
  "env": {
    "EXPO_TOKEN": "${EXPO_TOKEN}"
  }
}
```

- [ ] **Step 12: Create mcp-configs/appstore-connect.json**

```json
{
  "_meta": {
    "name": "appstore-connect",
    "description": "iOS app submission, TestFlight management, metadata updates",
    "category": "optional",
    "requires": ["Apple Developer account", "App Store Connect API key"]
  },
  "command": "npx",
  "args": ["-y", "erne-appstore-mcp-server"],
  "env": {
    "ASC_KEY_ID": "${ASC_KEY_ID}",
    "ASC_ISSUER_ID": "${ASC_ISSUER_ID}",
    "ASC_PRIVATE_KEY_PATH": "${ASC_PRIVATE_KEY_PATH}"
  }
}
```

- [ ] **Step 13: Create mcp-configs/play-console.json**

```json
{
  "_meta": {
    "name": "play-console",
    "description": "Android app submission, release management, review status",
    "category": "optional",
    "requires": ["Google Play Console access", "Service account key"]
  },
  "command": "npx",
  "args": ["-y", "erne-play-console-mcp-server"],
  "env": {
    "GOOGLE_PLAY_KEY_PATH": "${GOOGLE_PLAY_KEY_PATH}",
    "GOOGLE_PLAY_PACKAGE_NAME": "${GOOGLE_PLAY_PACKAGE_NAME}"
  }
}
```

- [ ] **Step 14: Create mcp-configs/memory.json**

```json
{
  "_meta": {
    "name": "memory",
    "description": "Persistent cross-session knowledge storage for the AI agent",
    "category": "optional",
    "requires": []
  },
  "command": "npx",
  "args": ["-y", "memory-mcp-server"],
  "env": {
    "MEMORY_STORAGE_PATH": ".claude/memory"
  }
}
```

- [ ] **Step 15: Verify 10 MCP config files**

Run: `ls -la mcp-configs/`
Expected: 10 `.json` files.

---

### Task 11: Example Templates (3 Files)

Write 3 example configuration templates that show users what a fully configured project looks like.

**Files to create (3):**
- `examples/claude-md-expo-managed.md` — Full CLAUDE.md for an Expo managed project
- `examples/claude-md-bare-rn.md` — Full CLAUDE.md for a bare React Native project
- `examples/eas-json-standard.json` — Standard EAS build configuration

**Steps:**

- [ ] **Step 16: Create examples/claude-md-expo-managed.md**

````markdown
# Example: CLAUDE.md for Expo Managed Project

This is a complete example of what `erne init` generates for an Expo managed project.

```markdown
# Project: MyApp

## Stack
- Expo SDK 52 (managed workflow)
- React Native 0.76
- TypeScript 5.5
- NativeWind v5 (Tailwind CSS v4)
- Expo Router v4 (file-based routing)
- Zustand (client state)
- TanStack Query (server state)

## Architecture
- Feature-based folder structure under `src/features/`
- Shared components in `src/components/`
- API layer in `src/api/`
- Navigation via Expo Router in `app/` directory

## Conventions
- Functional components only (no class components)
- NativeWind for all styling (no StyleSheet.create)
- Named exports for components
- `use` prefix for all hooks
- Absolute imports via `@/` alias

## Testing
- Jest + React Native Testing Library for unit/component tests
- Tests co-located with source files (`__tests__/` directories)
- `npm test` to run all tests
- `npm run test:watch` for watch mode

## Build & Deploy
- `npx expo start` for development
- `eas build --profile preview` for test builds
- `eas build --profile production` for release builds
- `eas update` for OTA updates

<!-- ERNE Configuration -->
<!-- Hook Profile: standard -->
<!-- Platform Layer: expo -->
```
````

- [ ] **Step 17: Create examples/claude-md-bare-rn.md**

````markdown
# Example: CLAUDE.md for Bare React Native Project

This is a complete example of what `erne init` generates for a bare React Native project.

```markdown
# Project: MyNativeApp

## Stack
- React Native 0.76 (bare workflow)
- TypeScript 5.5
- NativeWind v5 (Tailwind CSS v4)
- Expo Router v4 (via expo-modules in bare)
- Zustand (client state)
- TanStack Query (server state)

## Architecture
- Feature-based folder structure under `src/features/`
- Native modules in `modules/` directory
- iOS native code in `ios/`
- Android native code in `android/`
- Navigation via Expo Router in `app/` directory

## Conventions
- Functional components only
- NativeWind for JS styling, native styles in Swift/Kotlin
- Swift 5.9+ for iOS native code
- Kotlin for Android native code
- Expo Modules API for new native modules

## Native Development
- `cd ios && pod install` after adding native dependencies
- Xcode for iOS debugging and profiling
- Android Studio for Android debugging
- `npx react-native run-ios` for iOS builds
- `npx react-native run-android` for Android builds

## Testing
- Jest + RNTL for JS/component tests
- XCTest for iOS native tests
- JUnit 5 + MockK for Android native tests
- Detox for E2E testing

<!-- ERNE Configuration -->
<!-- Hook Profile: standard -->
<!-- Platform Layer: bare-rn -->
```
````

- [ ] **Step 18: Create examples/eas-json-standard.json**

```json
{
  "_meta": {
    "description": "Standard EAS build configuration for Expo managed projects. Customize for your project."
  },
  "cli": {
    "version": ">= 12.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false
      },
      "channel": "preview"
    },
    "production": {
      "autoIncrement": true,
      "channel": "production"
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "YOUR_APP_STORE_CONNECT_APP_ID"
      },
      "android": {
        "serviceAccountKeyPath": "./play-store-key.json",
        "track": "internal"
      }
    }
  }
}
```

- [ ] **Step 19: Verify 3 example files**

Run: `ls -la examples/`
Expected: 3 files (2 `.md` + 1 `.json`).

---

### Task 12: Final Content Layer Verification

Comprehensive verification of all Plan 2 content files.

- [ ] **Step 20: Full file count verification**

```bash
# Count all content files
echo "=== Agents ===" && ls -1 agents/*.md | wc -l
echo "=== Rules (common) ===" && ls -1 rules/common/*.md | wc -l
echo "=== Rules (expo) ===" && ls -1 rules/expo/*.md | wc -l
echo "=== Rules (bare-rn) ===" && ls -1 rules/bare-rn/*.md | wc -l
echo "=== Rules (native-ios) ===" && ls -1 rules/native-ios/*.md | wc -l
echo "=== Rules (native-android) ===" && ls -1 rules/native-android/*.md | wc -l
echo "=== Commands ===" && ls -1 commands/*.md | wc -l
echo "=== Contexts ===" && ls -1 contexts/*.md | wc -l
echo "=== MCP Configs ===" && ls -1 mcp-configs/*.json | wc -l
echo "=== Examples ===" && ls -1 examples/* | wc -l
```

Expected totals:
| Category | Count |
|----------|-------|
| Agents | 8 |
| Rules (common) | 9 |
| Rules (expo) | 4 |
| Rules (bare-rn) | 4 |
| Rules (native-ios) | 4 |
| Rules (native-android) | 4 |
| Commands | 16 |
| Contexts | 3 |
| MCP Configs | 10 |
| Examples | 3 |
| **Total** | **65** |

- [ ] **Step 21: Verify frontmatter format**

Check that all agents, rules, commands, and contexts have valid frontmatter:

```bash
# Verify all .md files have --- frontmatter
for f in agents/*.md rules/**/*.md commands/*.md contexts/*.md; do
  head -1 "$f" | grep -q "^---$" || echo "MISSING FRONTMATTER: $f"
done
```

All files must start with `---` followed by YAML frontmatter and closing `---`.

- [ ] **Step 22: Verify MCP config structure**

```bash
# Verify all JSON files are valid
for f in mcp-configs/*.json; do
  node -e "JSON.parse(require('fs').readFileSync('$f', 'utf8'))" || echo "INVALID JSON: $f"
done
```

All MCP config files must be valid JSON with `_meta`, `command`, and `args` fields.

- [ ] **Step 23: Cross-reference with spec**

Verify against design spec tables:
1. All 8 agents from spec Section 3.2 are present
2. All 25 rules from spec Section 3.3 are present (9 common + 4×4 platform)
3. All 16 commands from spec Section 3.5 are present
4. All 3 contexts from spec Section 3.6 are present
5. All 10 MCP configs from spec Section 3.7 are present
6. All 3 examples are present

---

## Plan 2 Summary

| Chunk | Tasks | Files | Status |
|-------|-------|-------|--------|
| 1: Agents | 1-2 | 8 agent .md | Planned |
| 2: Common Rules | 3-4 | 9 rule .md | Planned |
| 3: Platform Rules | 5-6 | 16 rule .md | Planned |
| 4: Commands Part 1 | 7 | 8 command .md | Planned |
| 5: Commands Part 2 | 8 | 8 command .md | Planned |
| 6: Contexts + MCP + Examples | 9-12 | 16 files | Planned |
| **Total** | **12 tasks** | **65 files** | |

**Execution order:** Chunks 1-6 sequentially. Within each chunk, files can be created in parallel.

**Dependencies:** None between chunks. Each chunk is self-contained. However, verification (Task 12) runs after all content is created.

**Estimated effort:** Each chunk creates ~8-16 markdown/JSON files from the templates above. The content is detailed but follows clear patterns. A single agent session should complete 1-2 chunks.

---

*End of Plan 2: Content Layer*
