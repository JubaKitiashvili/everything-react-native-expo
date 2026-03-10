# ERNE Plan 3: Skills & Knowledge Base

**Spec reference:** `docs/superpowers/specs/2026-03-10-everything-react-native-expo-design.md`
**Depends on:** Plan 2 (content layer must exist for cross-references)
**Creates:** Skills, documentation, schemas

---

## Overview

Plan 3 creates the knowledge layer — 8 core skills, project documentation, and validation schemas. Skills are Claude Code's reusable, invocable knowledge units. Unlike rules (which are passive context), skills are actively invoked by users or agents.

**Total files: ~30**
- 7 skill SKILL.md files (react-native-unified already exists)
- 1 continuous-learning-v2 config + internal files (~8 files)
- 5 documentation files
- 2 schema files
- Verification steps

---

## File Structure

```
skills/
├── react-native-unified/       # EXISTS — 45 reference files already built
│   ├── SKILL.md
│   └── references/
├── continuous-learning-v2/
│   ├── SKILL.md
│   ├── config.json
│   ├── agent-prompts/
│   │   ├── pattern-analyzer.md
│   │   └── skill-generator.md
│   ├── hook-templates/
│   │   ├── observer-hook.cjs.template
│   │   └── evaluate-session.cjs.template
│   └── scripts/
│       ├── extract-session-patterns.js
│       ├── analyze-patterns.js
│       └── validate-content.js
├── tdd-workflow/
│   └── SKILL.md
├── coding-standards/
│   └── SKILL.md
├── security-review/
│   └── SKILL.md
├── performance-optimization/
│   └── SKILL.md
├── native-module-scaffold/
│   └── SKILL.md
└── upgrade-workflow/
    └── SKILL.md

docs/
├── getting-started.md
├── agents.md
├── commands.md
├── hooks-profiles.md
└── creating-skills.md

schemas/
├── hooks.schema.json
└── plugin.schema.json
```

---

## Chunk 1: Core Skills — 6 SKILL.md Files (Tasks 1-2)

### Task 1: Workflow Skills (3 files)

The `react-native-unified/` skill already exists with 45 reference files. Create the remaining workflow-oriented skills.

**Files to create (3):**
- `skills/tdd-workflow/SKILL.md`
- `skills/coding-standards/SKILL.md`
- `skills/security-review/SKILL.md`

**Steps:**

- [ ] **Step 1: Create skills/tdd-workflow/SKILL.md**

```markdown
---
name: tdd-workflow
description: Test-driven development workflow for React Native — Jest, React Native Testing Library, and Detox
---

# TDD Workflow

You are executing a test-driven development workflow for React Native. Follow the Red-Green-Refactor cycle strictly.

## When to Use This Skill

Invoke this skill when:
- Implementing a new feature or component
- Fixing a bug (write test to reproduce first)
- Refactoring existing code (ensure tests exist first)

## Red-Green-Refactor Cycle

### Phase 1: RED — Write a Failing Test

Before writing any implementation code, write a test that describes the expected behavior:

**Component test (React Native Testing Library):**
```tsx
import { render, screen, fireEvent } from '@testing-library/react-native';
import { LoginForm } from '../LoginForm';

describe('LoginForm', () => {
  it('disables submit when fields are empty', () => {
    render(<LoginForm onSubmit={jest.fn()} />);
    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeDisabled();
  });

  it('calls onSubmit with email and password', () => {
    const onSubmit = jest.fn();
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), 'secret123');
    fireEvent.press(screen.getByRole('button', { name: /sign in/i }));

    expect(onSubmit).toHaveBeenCalledWith({
      email: 'user@test.com',
      password: 'secret123',
    });
  });

  it('shows error message on failed login', async () => {
    const onSubmit = jest.fn().mockRejectedValue(new Error('Invalid credentials'));
    render(<LoginForm onSubmit={onSubmit} />);

    fireEvent.changeText(screen.getByPlaceholderText(/email/i), 'user@test.com');
    fireEvent.changeText(screen.getByPlaceholderText(/password/i), 'wrong');
    fireEvent.press(screen.getByRole('button', { name: /sign in/i }));

    expect(await screen.findByText(/invalid credentials/i)).toBeTruthy();
  });
});
```

Run the test. It MUST fail (red).

### Phase 2: GREEN — Minimal Implementation

Write the minimum code to make the test pass. Do NOT add anything extra:

```tsx
export function LoginForm({ onSubmit }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    try {
      await onSubmit({ email, password });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
    }
  };

  return (
    <View>
      <TextInput placeholder="Email" value={email} onChangeText={setEmail} />
      <TextInput placeholder="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Pressable
        onPress={handleSubmit}
        disabled={!email || !password}
        accessibilityRole="button"
        accessibilityLabel="Sign in"
      >
        <Text>Sign In</Text>
      </Pressable>
      {error && <Text>{error}</Text>}
    </View>
  );
}
```

Run tests again. All MUST pass (green).

### Phase 3: REFACTOR — Clean Up

Now improve the code without changing behavior:
- Extract hooks (`useLoginForm`)
- Add NativeWind styling
- Improve types
- Add accessibility labels

Run tests after every change. They MUST stay green.

## Testing Layers

| Layer | Tool | What to Test |
|-------|------|-------------|
| Unit | Jest | Pure functions, hooks, utilities |
| Component | RNTL | Component rendering, user interactions |
| Integration | RNTL | Multiple components working together |
| E2E | Detox | Full user flows on real app |

## Test File Placement

Tests live next to their source:
```
src/features/auth/
  LoginForm.tsx
  __tests__/
    LoginForm.test.tsx
  hooks/
    useLoginForm.ts
    __tests__/
      useLoginForm.test.ts
```

## Rules

1. **Never write implementation before tests**
2. **One behavior per test** — test name should describe expected behavior
3. **Test behavior, not implementation** — don't test internal state
4. **Use `screen` queries** — prefer `getByRole`, `getByText`, `getByPlaceholderText`
5. **Mock at boundaries** — mock API calls, not internal functions
6. **No snapshot tests** — they break too easily, test specific assertions
```

- [ ] **Step 2: Create skills/coding-standards/SKILL.md**

```markdown
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
- [ ] NativeWind/Tailwind classes used (no `StyleSheet.create`)
- [ ] Consistent color usage (design tokens, not hex literals)
- [ ] Responsive design using NativeWind breakpoints
- [ ] Dark mode support via `dark:` variants

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
```

- [ ] **Step 3: Create skills/security-review/SKILL.md**

```markdown
---
name: security-review
description: Mobile security audit for React Native applications
---

# Security Review

You are performing a security audit on a React Native application. This skill provides a systematic security checklist specific to mobile apps.

## When to Use This Skill

Invoke when:
- Before deploying to production
- After adding authentication or payment features
- During code review of sensitive features
- Periodically as a security health check

## Audit Categories

### 1. Data Storage Security

- [ ] Sensitive data uses `expo-secure-store` (Expo) or Keychain/Keystore (bare)
- [ ] No sensitive data in `AsyncStorage` (it's unencrypted)
- [ ] No secrets in source code or environment files committed to git
- [ ] `.env` is in `.gitignore`
- [ ] API keys use EAS Secrets for builds (not hardcoded)

### 2. Network Security

- [ ] All API calls use HTTPS
- [ ] Certificate pinning implemented for sensitive endpoints
- [ ] Auth tokens stored securely, not in plain AsyncStorage
- [ ] Token refresh logic handles expiration correctly
- [ ] No sensitive data in URL query parameters

### 3. Authentication & Authorization

- [ ] Passwords never stored locally
- [ ] Biometric auth uses platform APIs (FaceID, fingerprint)
- [ ] Session tokens have reasonable expiry
- [ ] Logout clears all sensitive cached data
- [ ] Deep links validate auth state before navigating

### 4. Code Security

- [ ] No `eval()` or dynamic code execution
- [ ] WebView `javaScriptEnabled` only when necessary
- [ ] Input validation on all user inputs
- [ ] SQL injection prevention (parameterized queries)
- [ ] No debug logging of sensitive data

### 5. Build Security

- [ ] ProGuard/R8 enabled for Android release builds
- [ ] iOS binary stripped in release
- [ ] Source maps not included in production bundles
- [ ] App Transport Security (ATS) properly configured (iOS)
- [ ] Android `networkSecurityConfig` restricts cleartext traffic

### 6. Platform-Specific

**iOS:**
- [ ] Privacy Manifest (iOS 17+) includes required reasons
- [ ] Keychain access group properly configured
- [ ] No private API usage
- [ ] Background fetch/processing doesn't leak data

**Android:**
- [ ] Exported components require permissions
- [ ] Content providers are not unnecessarily exported
- [ ] Backup rules exclude sensitive data (`android:allowBackup="false"`)
- [ ] Minimum SDK version is current (API 24+)

### 7. Third-Party Dependencies

- [ ] No known vulnerabilities (`npm audit`)
- [ ] Dependencies are up to date
- [ ] No abandoned packages with known issues
- [ ] Native dependencies reviewed for permissions

## Output

```
## Security Audit Report

### Risk Level: LOW / MEDIUM / HIGH / CRITICAL

### Findings
[Severity] [Category] — [Description]
  Location: [file:line]
  Recommendation: [fix]

### Summary
- Critical: N
- High: N
- Medium: N
- Low: N
- Passed: N checks
```
```

- [ ] **Step 4: Verify 3 workflow skills**

Run: `ls -la skills/tdd-workflow/ skills/coding-standards/ skills/security-review/`
Expected: Each directory contains a `SKILL.md` file.

---

### Task 2: Domain Skills (3 files)

Create domain-specific skills for performance, native modules, and upgrades.

**Files to create (3):**
- `skills/performance-optimization/SKILL.md`
- `skills/native-module-scaffold/SKILL.md`
- `skills/upgrade-workflow/SKILL.md`

**Steps:**

- [ ] **Step 5: Create skills/performance-optimization/SKILL.md**

```markdown
---
name: performance-optimization
description: Step-by-step performance diagnosis and optimization for React Native apps
---

# Performance Optimization

You are performing a systematic performance diagnosis on a React Native application. Follow this step-by-step process.

## When to Use This Skill

Invoke when:
- App feels slow or janky
- Startup time is too long
- Lists scroll poorly
- Animations stutter
- Bundle size is too large
- Memory usage is high

## Diagnostic Process

### Step 1: Identify the Problem

| Symptom | Likely Cause | First Check |
|---------|-------------|-------------|
| Slow startup | Large bundle, heavy init | Bundle size, eager imports |
| Janky scrolling | List renderer, heavy cells | FlatList vs FlashList, cell complexity |
| Stuttering animations | JS thread blocking | Worklets, `useAnimatedStyle` |
| High memory | Leaks, large images | Image caching, subscription cleanup |
| Slow navigation | Heavy screens, eager loading | Lazy loading, screen weight |

### Step 2: Measure

**Bundle Analysis:**
```bash
npx react-native-bundle-visualizer
# or for Expo:
npx expo export --dump-sourcemap
```

Target: < 1.5MB JavaScript bundle

**FPS Monitoring:**
- Enable Perf Monitor in dev menu
- Or use `useFrameCallback` from Reanimated
- Target: 60fps constant, no drops below 55fps

**TTI (Time to Interactive):**
- Measure from app launch to first interactive frame
- Target: < 2 seconds on mid-range device

**Memory:**
- Use Xcode Instruments (iOS) or Android Profiler
- Watch for monotonically increasing memory (leak indicator)

### Step 3: Optimize by Category

**Bundle Size:**
1. Analyze imports — find large dependencies
2. Lazy load screens: `React.lazy()` with `Suspense`
3. Tree-shake unused exports
4. Replace large libraries with lighter alternatives
5. Use Hermes (enabled by default in Expo SDK 50+)

**Rendering:**
1. Replace `FlatList` with `FlashList` + `estimatedItemSize`
2. Memoize expensive components: `React.memo`
3. Use `useCallback` for event handlers passed to children
4. Avoid inline object/array creation in JSX
5. Profile re-renders with React DevTools Profiler

**Animations:**
1. Move all animations to UI thread (Reanimated worklets)
2. Use `useAnimatedStyle` instead of inline animated values
3. Batch related animations with `withSequence`/`withDelay`
4. Reduce animated property count (transform is cheaper than layout)
5. Use `cancelAnimation` for cleanup

**Images:**
1. Use `expo-image` with `cachePolicy="memory-disk"`
2. Serve correct sizes (don't scale 4K images to thumbnails)
3. Use WebP format for smaller file sizes
4. Implement progressive loading (blurhash placeholder)

**Memory:**
1. Clean up listeners in `useEffect` return
2. Remove event subscriptions on unmount
3. Use WeakRef for caches where appropriate
4. Paginate large data sets (don't load all at once)

### Step 4: Verify Improvements

Re-measure after each optimization:
```
## Performance Report

| Metric | Before | After | Target | Status |
|--------|--------|-------|--------|--------|
| Bundle size | 2.1MB | 1.4MB | <1.5MB | PASS |
| TTI | 3.2s | 1.8s | <2s | PASS |
| List FPS | 45fps | 60fps | 60fps | PASS |
| Memory (5min) | +80MB | +12MB | <20MB | PASS |
```
```

- [ ] **Step 6: Create skills/native-module-scaffold/SKILL.md**

```markdown
---
name: native-module-scaffold
description: Guided wizard for creating Turbo Modules and Expo Modules with iOS and Android implementations
---

# Native Module Scaffold

You are creating a native module for React Native. This skill guides you through the entire process from TypeScript API design to native implementations.

## When to Use This Skill

Invoke when:
- Need to access native platform APIs not available in React Native
- Building a bridge between JavaScript and Swift/Kotlin
- Creating a custom UI component with native rendering
- Integrating a native SDK

## Module Type Selection

### Option A: Expo Modules API (Recommended for Expo projects)

Simplest approach. Uses `expo-modules-core` for bridging:

```bash
npx create-expo-module my-module
```

**Generated structure:**
```
modules/my-module/
  expo-module.config.json
  src/MyModuleModule.ts          # TypeScript API
  ios/MyModuleModule.swift        # Swift implementation
  android/src/.../MyModuleModule.kt  # Kotlin implementation
  src/__tests__/MyModule.test.ts
```

### Option B: Turbo Modules (For bare RN / New Architecture)

Lower level, more control. Uses codegen from TypeScript spec:

**Step 1: Define TypeScript spec**
```tsx
// NativeMyModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  multiply(a: number, b: number): Promise<number>;
  getDeviceInfo(): { model: string; os: string; version: string };
}

export default TurboModuleRegistry.getEnforcing<Spec>('MyModule');
```

**Step 2: Implement iOS (Swift)**
```swift
@objc(MyModule)
class MyModule: NSObject {
  @objc func multiply(_ a: Double, b: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(a * b)
  }

  @objc func getDeviceInfo() -> [String: String] {
    return [
      "model": UIDevice.current.model,
      "os": UIDevice.current.systemName,
      "version": UIDevice.current.systemVersion
    ]
  }
}
```

**Step 3: Implement Android (Kotlin)**
```kotlin
class MyModuleModule(reactContext: ReactApplicationContext) :
  NativeMyModuleSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Promise {
    return Promise.resolve(a * b)
  }

  override fun getDeviceInfo(): WritableMap {
    return Arguments.createMap().apply {
      putString("model", Build.MODEL)
      putString("os", "Android")
      putString("version", Build.VERSION.RELEASE)
    }
  }
}
```

### Option C: Fabric Components (For custom native views)

For custom UI components rendered natively:

```tsx
// NativeMyView.ts
import type { ViewProps } from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

interface NativeProps extends ViewProps {
  color?: string;
  radius?: number;
}

export default codegenNativeComponent<NativeProps>('MyView');
```

## Post-Scaffold Checklist

- [ ] TypeScript types match native implementations
- [ ] Error handling uses reject/Promise.reject with error codes
- [ ] Threading: heavy work on background thread, UI on main
- [ ] Memory: cleanup listeners and subscriptions
- [ ] Platform parity: same API surface iOS and Android
- [ ] Tests cover the TypeScript API
- [ ] README documents usage
```

- [ ] **Step 7: Create skills/upgrade-workflow/SKILL.md**

```markdown
---
name: upgrade-workflow
description: Guided version migration for React Native and Expo SDK upgrades
---

# Upgrade Workflow

You are performing a version upgrade on a React Native or Expo project. This skill provides a systematic migration process.

## When to Use This Skill

Invoke when:
- Upgrading Expo SDK version (e.g., SDK 51 → 52)
- Upgrading React Native version (e.g., 0.75 → 0.76)
- Upgrading major dependencies (React Navigation, Reanimated, etc.)
- Migrating from Expo managed to bare workflow

## 5-Step Upgrade Process

### Step 1: Pre-Assessment

Before changing anything:

1. **Document current state:**
   ```bash
   npx expo-doctor  # Expo projects
   npx react-native info  # All RN projects
   ```

2. **Check compatibility matrix:**
   - Expo SDK → React Native version mapping
   - React Native → React version mapping
   - Key dependency version requirements

3. **Identify breaking changes:**
   - Read the official changelog/migration guide
   - Check each major dependency's changelog
   - List all breaking changes that affect this project

4. **Ensure clean state:**
   ```bash
   git status  # Must be clean
   git checkout -b upgrade/[target-version]
   ```

### Step 2: Core Upgrade

**Expo managed:**
```bash
npx expo install expo@latest
npx expo install --fix  # Fix peer dependency issues
```

**Bare React Native:**
```bash
npx react-native upgrade [version]
# Or use the upgrade helper:
# https://react-native-community.github.io/upgrade-helper/
```

### Step 3: Dependency Updates

Update dependencies in order of importance:
1. React and React Native core
2. Navigation (expo-router or React Navigation)
3. State management (zustand, tanstack-query)
4. UI libraries (nativewind, reanimated, gesture-handler)
5. Native modules and Expo packages
6. Dev dependencies (jest, typescript, eslint)

```bash
# Check for outdated packages
npx npm-check-updates

# Update with Expo compatibility
npx expo install [package]@latest
```

### Step 4: Migration Steps

Apply breaking changes systematically:

1. **API changes** — Update deprecated API calls
2. **Import changes** — Fix moved/renamed imports
3. **Config changes** — Update app.config.ts, babel.config.js, metro.config.js
4. **Native changes** — Update Podfile, build.gradle if bare workflow
5. **Type changes** — Fix TypeScript type errors from updated types

For each change:
```bash
# Make change
# Run: npx tsc --noEmit  (type check)
# Run: npm test  (unit tests)
# Fix any failures before moving to next change
```

### Step 5: Verification

Complete verification checklist:

- [ ] `npx tsc --noEmit` passes (no type errors)
- [ ] `npm test` passes (all unit tests)
- [ ] `npx expo start` launches dev server (Expo)
- [ ] iOS build succeeds
- [ ] Android build succeeds
- [ ] Critical user flows work on both platforms
- [ ] No new console warnings related to deprecation
- [ ] Bundle size hasn't increased significantly

## Output

```
## Upgrade Report

### Versions
From: [previous versions]
To: [new versions]

### Breaking Changes Applied
[List with file locations and descriptions]

### Dependencies Updated
[Package] [old] → [new]

### Verification
[Status of each check]

### Known Issues
[Any remaining warnings or known issues with notes]
```

## Rollback

If upgrade fails:
```bash
git checkout main
git branch -D upgrade/[target-version]
```

Never force through a broken upgrade. It's better to wait for fixes.
```

- [ ] **Step 8: Verify 3 domain skills**

Run: `ls -la skills/performance-optimization/ skills/native-module-scaffold/ skills/upgrade-workflow/`
Expected: Each directory contains a `SKILL.md` file.

---

## Chunk 2: Continuous Learning System (Task 3)

### Task 3: continuous-learning-v2 Skill

This is the self-improving system. It observes coding patterns and auto-generates new rules/skills. Adapted from the everything-claude-code architecture.

**Files to create (~9):**
- `skills/continuous-learning-v2/SKILL.md`
- `skills/continuous-learning-v2/config.json`
- `skills/continuous-learning-v2/agent-prompts/pattern-analyzer.md`
- `skills/continuous-learning-v2/agent-prompts/skill-generator.md`
- `skills/continuous-learning-v2/hook-templates/observer-hook.cjs.template`
- `skills/continuous-learning-v2/hook-templates/evaluate-session.cjs.template`
- `skills/continuous-learning-v2/scripts/extract-session-patterns.js`
- `skills/continuous-learning-v2/scripts/analyze-patterns.js`
- `skills/continuous-learning-v2/scripts/validate-content.js`

**Steps:**

- [ ] **Step 9: Create skills/continuous-learning-v2/SKILL.md**

```markdown
---
name: continuous-learning-v2
description: Auto-generate skills and rules from observed React Native development patterns
---

# Continuous Learning v2

This skill manages the continuous learning pipeline — observing patterns during development sessions and converting them into persistent rules and skills.

## Architecture

```
PostToolUse hook (real-time)
  → continuous-learning-observer.cjs (lightweight pattern capture)
  → patterns stored in .claude/memory/observations/

/learn command (manual, comprehensive)
  → extract-session-patterns.js (full session analysis)
  → analyze-patterns.js (pattern clustering + dedup)
  → skill-generator prompt (create new content)
  → validate-content.js (verify new content is valid)

/retrospective command (session end)
  → evaluate-session.js (quality metrics + suggestions)
```

## How It Works

### Real-Time (Automatic)

The `continuous-learning-observer.cjs` hook runs on `PostToolUse` events. It:
1. Captures the tool name, file paths, and outcome
2. Detects repeated patterns (same fix applied > 3 times)
3. Stores observations in `.claude/memory/observations/` as JSON
4. Lightweight — adds < 50ms to each tool call

### Manual Analysis (`/learn`)

When the user runs `/learn`, the pipeline:
1. Reads all observations from the current session
2. Clusters them by type (style fix, import pattern, architecture choice)
3. Compares against existing rules and skills
4. Generates candidates for new content
5. Presents candidates for user approval
6. Writes approved content to `.claude/rules/` or `.claude/skills/`

### Session Evaluation (`/retrospective`)

At session end, `evaluate-session.js`:
1. Aggregates all metrics (files changed, tests added, build status)
2. Evaluates which rules triggered and their usefulness
3. Suggests rule calibration (tighten/loosen globs, adjust content)
4. Generates a session quality report

## Configuration

See `config.json` for tuning parameters:
- `observationThreshold`: How many times a pattern must repeat before flagging (default: 3)
- `maxObservationsPerSession`: Prevent memory bloat (default: 100)
- `autoApprove`: If true, auto-approve low-risk content (default: false)
- `contentTypes`: What types to generate — `["rule", "skill"]`
```

- [ ] **Step 10: Create skills/continuous-learning-v2/config.json**

```json
{
  "version": "2.0.0",
  "observationThreshold": 3,
  "maxObservationsPerSession": 100,
  "autoApprove": false,
  "contentTypes": ["rule", "skill"],
  "observationDir": ".claude/memory/observations",
  "generatedDir": ".claude/memory/generated",
  "patterns": {
    "minOccurrences": 3,
    "categories": [
      "style-fix",
      "import-pattern",
      "architecture-choice",
      "error-handling",
      "testing-pattern",
      "performance-fix"
    ]
  },
  "generation": {
    "ruleTemplate": "agent-prompts/skill-generator.md",
    "analyzerPrompt": "agent-prompts/pattern-analyzer.md",
    "validationScript": "scripts/validate-content.js"
  }
}
```

- [ ] **Step 11: Create skills/continuous-learning-v2/agent-prompts/pattern-analyzer.md**

```markdown
---
name: pattern-analyzer
description: Internal prompt for analyzing collected patterns — NOT a top-level agent
---

# Pattern Analysis Prompt

You are analyzing patterns observed during a React Native development session. Your job is to identify recurring patterns worth capturing as rules or skills.

## Input

You receive a JSON array of observations:
```json
[
  {
    "timestamp": "2024-03-10T14:30:00Z",
    "tool": "Edit",
    "files": ["src/components/Button.tsx"],
    "pattern": "Replaced StyleSheet.create with NativeWind classes",
    "count": 5
  }
]
```

## Analysis Process

1. **Group by category** — Cluster similar observations
2. **Filter by threshold** — Only patterns with 3+ occurrences
3. **Check novelty** — Compare against existing rules in `.claude/rules/`
4. **Assess value** — Is this pattern worth encoding as a rule?

## Output

For each candidate:
```json
{
  "type": "rule",
  "category": "common/coding-style",
  "title": "Prefer NativeWind over StyleSheet",
  "confidence": "high",
  "occurrences": 5,
  "suggestedContent": "..."
}
```

## Rules for Analysis

- High confidence: Pattern appeared 5+ times with same fix
- Medium confidence: Pattern appeared 3-4 times
- Low confidence: Pattern appeared but context varied
- Skip: One-off patterns, project-specific hacks, temporary workarounds
```

- [ ] **Step 12: Create skills/continuous-learning-v2/agent-prompts/skill-generator.md**

```markdown
---
name: skill-generator
description: Internal prompt for generating new skill content from analyzed patterns — NOT a top-level agent
---

# Skill/Rule Generation Prompt

You are generating a new Claude Code rule or skill from an analyzed pattern. Create content that follows ERNE conventions.

## Input

You receive a pattern analysis:
```json
{
  "type": "rule",
  "category": "common/coding-style",
  "title": "Prefer NativeWind over StyleSheet",
  "confidence": "high",
  "occurrences": 5,
  "examples": ["..."]
}
```

## Generation Rules

### For Rules (`.claude/rules/*.md`)

Format:
```markdown
---
description: [One-line description of what this rule enforces]
globs: [File patterns this applies to, e.g., "src/**/*.tsx"]
alwaysApply: false
---

# [Rule Title]

[Clear statement of the rule]

## Do This
[Correct example with code]

## Don't Do This
[Incorrect example with code]

## Why
[Brief rationale]
```

### For Skills (`.claude/skills/*/SKILL.md`)

Format:
```markdown
---
name: [kebab-case-name]
description: [One-line description]
---

# [Skill Title]

[When to invoke]
[Step-by-step workflow]
[Examples]
[Expected output]
```

## Quality Checks

Before outputting:
- [ ] Frontmatter is valid YAML
- [ ] Content is specific and actionable (not generic advice)
- [ ] Code examples are correct and runnable
- [ ] Rule doesn't conflict with existing rules
- [ ] Skill has clear invocation criteria
```

- [ ] **Step 13: Create skills/continuous-learning-v2/hook-templates/observer-hook.cjs.template**

```javascript
// Template for continuous-learning-observer.cjs hook
// This runs on PostToolUse events and captures patterns

const fs = require('fs');
const path = require('path');

const CONFIG = {
  observationDir: '{{observationDir}}',
  maxPerSession: {{maxObservationsPerSession}},
  threshold: {{observationThreshold}},
};

module.exports = async ({ tool, filePaths, result }) => {
  // Only observe file-editing tools
  if (!['Edit', 'Write', 'NotebookEdit'].includes(tool)) return;

  const sessionFile = path.join(CONFIG.observationDir, `session-${Date.now()}.json`);

  // Ensure observation directory exists
  fs.mkdirSync(CONFIG.observationDir, { recursive: true });

  // Read existing observations for this session
  let observations = [];
  const sessionFiles = fs.readdirSync(CONFIG.observationDir)
    .filter(f => f.startsWith('session-'))
    .sort()
    .slice(-1);

  if (sessionFiles.length > 0) {
    try {
      observations = JSON.parse(
        fs.readFileSync(path.join(CONFIG.observationDir, sessionFiles[0]), 'utf8')
      );
    } catch { /* fresh session */ }
  }

  // Don't exceed max observations
  if (observations.length >= CONFIG.maxPerSession) return;

  // Record observation
  observations.push({
    timestamp: new Date().toISOString(),
    tool,
    files: filePaths || [],
    resultPreview: typeof result === 'string' ? result.slice(0, 200) : '',
  });

  // Write back
  const targetFile = sessionFiles.length > 0
    ? path.join(CONFIG.observationDir, sessionFiles[0])
    : sessionFile;

  fs.writeFileSync(targetFile, JSON.stringify(observations, null, 2));
};
```

- [ ] **Step 14: Create skills/continuous-learning-v2/hook-templates/evaluate-session.cjs.template**

```javascript
// Template for evaluate-session.cjs hook
// This runs on session end to generate a retrospective

const fs = require('fs');
const path = require('path');

const CONFIG = {
  observationDir: '{{observationDir}}',
  generatedDir: '{{generatedDir}}',
};

module.exports = async () => {
  // Read all session observations
  const obsDir = CONFIG.observationDir;
  if (!fs.existsSync(obsDir)) {
    return { message: 'No observations found for this session.' };
  }

  const sessionFiles = fs.readdirSync(obsDir)
    .filter(f => f.startsWith('session-'))
    .sort();

  if (sessionFiles.length === 0) {
    return { message: 'No observations found for this session.' };
  }

  // Aggregate observations
  let allObservations = [];
  for (const file of sessionFiles) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(obsDir, file), 'utf8'));
      allObservations = allObservations.concat(data);
    } catch { /* skip corrupt files */ }
  }

  // Generate metrics
  const metrics = {
    totalObservations: allObservations.length,
    toolUsage: {},
    filesModified: new Set(),
    timespan: {
      start: allObservations[0]?.timestamp,
      end: allObservations[allObservations.length - 1]?.timestamp,
    },
  };

  for (const obs of allObservations) {
    metrics.toolUsage[obs.tool] = (metrics.toolUsage[obs.tool] || 0) + 1;
    (obs.files || []).forEach(f => metrics.filesModified.add(f));
  }

  metrics.filesModified = [...metrics.filesModified];

  // Write retrospective
  const retro = {
    timestamp: new Date().toISOString(),
    metrics,
    observations: allObservations,
  };

  fs.mkdirSync(CONFIG.generatedDir, { recursive: true });
  const retroFile = path.join(CONFIG.generatedDir, `retro-${Date.now()}.json`);
  fs.writeFileSync(retroFile, JSON.stringify(retro, null, 2));

  return {
    message: `Retrospective saved to ${retroFile}`,
    metrics,
  };
};
```

- [ ] **Step 15: Create skills/continuous-learning-v2/scripts/extract-session-patterns.js**

```javascript
#!/usr/bin/env node
// Extract patterns from session observations for /learn command

const fs = require('fs');
const path = require('path');

const OBS_DIR = path.resolve('.claude/memory/observations');

function extractPatterns() {
  if (!fs.existsSync(OBS_DIR)) {
    console.log('No observations directory found.');
    process.exit(0);
  }

  const files = fs.readdirSync(OBS_DIR).filter(f => f.endsWith('.json'));
  let allObs = [];

  for (const file of files) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(OBS_DIR, file), 'utf8'));
      allObs = allObs.concat(Array.isArray(data) ? data : [data]);
    } catch (e) {
      console.error(`Skipping corrupt file: ${file}`);
    }
  }

  console.log(`Loaded ${allObs.length} observations from ${files.length} files.`);

  // Group by file extension to find patterns
  const byExtension = {};
  for (const obs of allObs) {
    for (const file of (obs.files || [])) {
      const ext = path.extname(file);
      if (!byExtension[ext]) byExtension[ext] = [];
      byExtension[ext].push(obs);
    }
  }

  // Group by tool to find repeated fix patterns
  const byTool = {};
  for (const obs of allObs) {
    if (!byTool[obs.tool]) byTool[obs.tool] = [];
    byTool[obs.tool].push(obs);
  }

  // Output summary
  console.log('\n=== Pattern Summary ===');
  console.log(`File types modified: ${Object.keys(byExtension).join(', ')}`);
  console.log(`Tools used: ${JSON.stringify(byTool, (k, v) => Array.isArray(v) ? v.length : v)}`);

  return { byExtension, byTool, total: allObs.length };
}

extractPatterns();
```

- [ ] **Step 16: Create skills/continuous-learning-v2/scripts/analyze-patterns.js**

```javascript
#!/usr/bin/env node
// Analyze extracted patterns and generate candidates

const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../config.json');
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function analyzePatterns(patterns) {
  const candidates = [];

  // Find repeated edits to same file patterns
  const filePatterns = {};
  for (const obs of patterns) {
    for (const file of (obs.files || [])) {
      const dir = path.dirname(file);
      const ext = path.extname(file);
      const key = `${dir}/*${ext}`;
      if (!filePatterns[key]) filePatterns[key] = { count: 0, files: [] };
      filePatterns[key].count++;
      filePatterns[key].files.push(file);
    }
  }

  // Generate candidates for patterns above threshold
  for (const [pattern, data] of Object.entries(filePatterns)) {
    if (data.count >= config.observationThreshold) {
      candidates.push({
        type: 'rule',
        pattern,
        occurrences: data.count,
        files: [...new Set(data.files)].slice(0, 5),
        confidence: data.count >= 5 ? 'high' : 'medium',
      });
    }
  }

  return candidates;
}

// Read from stdin or file
const input = process.argv[2];
if (input && fs.existsSync(input)) {
  const data = JSON.parse(fs.readFileSync(input, 'utf8'));
  const candidates = analyzePatterns(data);
  console.log(JSON.stringify(candidates, null, 2));
} else {
  console.log('Usage: node analyze-patterns.js <observations.json>');
}
```

- [ ] **Step 17: Create skills/continuous-learning-v2/scripts/validate-content.js**

```javascript
#!/usr/bin/env node
// Validate generated rules and skills have correct format

const fs = require('fs');
const path = require('path');

function validateFrontmatter(content) {
  const errors = [];

  // Check starts with ---
  if (!content.startsWith('---\n')) {
    errors.push('File must start with --- (YAML frontmatter)');
    return errors;
  }

  // Find closing ---
  const endIndex = content.indexOf('\n---\n', 4);
  if (endIndex === -1) {
    errors.push('Frontmatter must be closed with ---');
    return errors;
  }

  const frontmatter = content.slice(4, endIndex);

  // Check required fields based on type
  if (content.includes('name:') && content.includes('description:')) {
    // Skill or command format — valid
  } else if (content.includes('description:')) {
    // Rule format — valid
  } else {
    errors.push('Frontmatter must contain at least a "description" field');
  }

  return errors;
}

function validateFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const errors = validateFrontmatter(content);

  // Check for content after frontmatter
  const contentStart = content.indexOf('\n---\n', 4);
  if (contentStart !== -1) {
    const body = content.slice(contentStart + 5).trim();
    if (body.length < 50) {
      errors.push('Content body is too short (< 50 chars)');
    }
  }

  return {
    file: filePath,
    valid: errors.length === 0,
    errors,
  };
}

// Validate all .md files in given directory
const targetDir = process.argv[2] || '.claude';
const results = [];

function walkDir(dir) {
  if (!fs.existsSync(dir)) return;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkDir(fullPath);
    } else if (entry.name.endsWith('.md') && !entry.name.startsWith('README')) {
      results.push(validateFile(fullPath));
    }
  }
}

walkDir(targetDir);

// Output results
let hasErrors = false;
for (const result of results) {
  if (!result.valid) {
    hasErrors = true;
    console.error(`INVALID: ${result.file}`);
    result.errors.forEach(e => console.error(`  - ${e}`));
  } else {
    console.log(`OK: ${result.file}`);
  }
}

process.exit(hasErrors ? 1 : 0);
```

- [ ] **Step 18: Verify continuous-learning-v2 files**

```bash
find skills/continuous-learning-v2/ -type f | sort
```

Expected: 9 files (SKILL.md, config.json, 2 agent-prompts, 2 hook-templates, 3 scripts).

---

## Chunk 3: Documentation & Schemas (Tasks 4-5)

### Task 4: Project Documentation (5 files)

Write documentation for users and contributors.

**Files to create (5):**
- `docs/getting-started.md`
- `docs/agents.md`
- `docs/commands.md`
- `docs/hooks-profiles.md`
- `docs/creating-skills.md`

**Steps:**

- [ ] **Step 19: Create docs/getting-started.md**

```markdown
# Getting Started with ERNE

ERNE (Everything React Native Expo) is an AI coding agent harness that supercharges Claude Code for React Native and Expo development.

## Quick Install

```bash
npx erne-universal init
```

The installer will:
1. Detect your project type (Expo managed, bare RN, or both)
2. Ask you to choose a hook profile (minimal, standard, or strict)
3. Let you select MCP integrations (agent-device, GitHub, etc.)
4. Generate all configuration files in `.claude/`

## What Gets Installed

```
.claude/
  agents/       # 8 specialized AI agents
  rules/        # 25 coding standard rules (layered by platform)
  commands/     # 16 slash commands
  contexts/     # 3 behavior modes (dev, review, vibe)
  hooks.json    # Git-style hooks for quality enforcement
  skills/       # 8 reusable knowledge skills
  mcp-configs/  # Optional MCP server configurations
```

## First Steps

1. **Start building:** `/plan` to design a feature
2. **Write tests first:** `/tdd` for test-driven development
3. **Review code:** `/code-review` for comprehensive analysis
4. **Check performance:** `/perf` for performance profiling

## Behavior Modes

Switch contexts to change how the AI works:

- **dev** — Fast iteration, minimal ceremony
- **review** — Thorough, check everything
- **vibe** — Creative mode, experiment freely

## Hook Profiles

Control quality enforcement level:

- **minimal** — Only pre-commit lint
- **standard** — Format + typecheck + common validations
- **strict** — All checks including security, performance budgets, accessibility

Change profile: set `ERNE_PROFILE=minimal|standard|strict` in your environment.

## Learn More

- [Agents](agents.md) — How specialized agents work
- [Commands](commands.md) — All 16 slash commands
- [Hook Profiles](hooks-profiles.md) — Quality enforcement system
- [Creating Skills](creating-skills.md) — Extend ERNE with custom knowledge
```

- [ ] **Step 20: Create docs/agents.md**

```markdown
# ERNE Agents

Agents are specialized AI personas with focused expertise. Each agent has specific knowledge areas and behavioral guidelines.

## Available Agents

| Agent | Specialty | Used By Commands |
|-------|-----------|-----------------|
| architect | System design, navigation, file structure | /plan, /navigate |
| code-reviewer | Code quality, best practices, security | /code-review, /quality-gate, /deploy |
| tdd-guide | Test-driven development, testing patterns | /tdd, /component |
| performance-profiler | FPS, memory, bundle size, animations | /perf, /quality-gate, /debug |
| native-bridge-builder | Swift/Kotlin bridges, Expo Modules | /native-module |
| expo-config-resolver | EAS, app.config, build fixes | /build-fix, /deploy |
| ui-designer | NativeWind, Reanimated, components | /animate, /component |
| upgrade-assistant | Version migrations, breaking changes | /upgrade |

## How Agents Work

Agents are defined in `.claude/agents/` as markdown files with frontmatter:

```yaml
---
name: agent-name
description: What this agent does
---
```

The content of the agent file provides the agent's system prompt — its expertise, guidelines, and behavioral rules.

## Agent Orchestration

Commands can use agents in three patterns:

1. **Single agent** — One agent handles the task (e.g., `/plan` uses architect)
2. **Parallel agents** — Multiple agents work simultaneously (e.g., `/code-review` runs code-reviewer + performance-profiler)
3. **Sequential agents** — One agent feeds into another (e.g., `/native-module` runs native-bridge-builder then code-reviewer)

## Customizing Agents

You can modify agent behavior by editing their files in `.claude/agents/`. Changes take effect immediately — no restart needed.
```

- [ ] **Step 21: Create docs/commands.md**

```markdown
# ERNE Commands

Commands are slash-prefixed actions that orchestrate agents for specific tasks.

## All Commands

### Core Workflow
| Command | Purpose | Agents |
|---------|---------|--------|
| `/plan` | Design feature architecture | architect |
| `/code-review` | Full code review | code-reviewer + performance-profiler |
| `/tdd` | Test-first development | tdd-guide |
| `/build-fix` | Fix build failures | expo-config-resolver |
| `/perf` | Performance profiling | performance-profiler |
| `/upgrade` | Version migration | upgrade-assistant |
| `/native-module` | Create native modules | native-bridge-builder → code-reviewer |
| `/navigate` | Navigation design | architect |

### Extended
| Command | Purpose | Agents |
|---------|---------|--------|
| `/animate` | Implement animations | ui-designer |
| `/deploy` | Validate and submit | expo-config-resolver + code-reviewer |
| `/component` | Design + test component | ui-designer + tdd-guide |
| `/debug` | Systematic diagnosis | performance-profiler |
| `/quality-gate` | Pre-merge checks | code-reviewer + performance-profiler |

### Script-Driven
| Command | Purpose | What It Runs |
|---------|---------|-------------|
| `/learn` | Generate skills from patterns | continuous-learning-v2 scripts |
| `/retrospective` | Session analysis | evaluate-session.js |
| `/setup-device` | Install agent-device MCP | Setup script |

## Using Commands

Type any command in Claude Code:
```
/plan Add user authentication with biometric login
```

Commands that use multiple agents show combined output. Parallel agents run simultaneously for speed.

## agent-device Enhancement

When agent-device MCP is installed, several commands gain visual capabilities:

| Command | Without | With agent-device |
|---------|---------|------------------|
| `/debug` | Log analysis | + Screenshots, tap through steps |
| `/perf` | Code analysis | + Actual FPS measurement |
| `/component` | Generate code | + Render and screenshot |
| `/deploy` | Config validation | + Preview build verification |
```

- [ ] **Step 22: Create docs/hooks-profiles.md**

```markdown
# Hooks & Profiles

ERNE uses Claude Code hooks to enforce quality standards automatically. Hooks are git-style triggers that run scripts at specific events.

## Hook Profiles

Three profiles control which hooks are active:

### minimal
- Pre-commit lint only
- Maximum speed, minimal friction
- Best for: prototyping, vibe mode, quick experiments

### standard (recommended)
- Format on edit
- TypeScript type checking
- Console.log detection
- Platform-specific code validation
- Pre-commit lint
- Best for: daily development

### strict
- Everything in standard, plus:
- Security scanning
- Performance budget checking
- Accessibility audit
- Bundle size monitoring
- Native compatibility checks
- Best for: pre-release, production code

## Changing Profile

```bash
# Environment variable (highest priority)
export ERNE_PROFILE=strict

# Or in CLAUDE.md comment
<!-- Hook Profile: standard -->

# Or via context (vibe auto-sets minimal)
/context vibe
```

## Precedence (highest to lowest)

1. Explicit `ERNE_PROFILE` env var
2. Context preamble (vibe → minimal)
3. CLAUDE.md comment
4. Default: standard

## Hook Events

| Event | When | Example Hook |
|-------|------|-------------|
| PreToolUse | Before a tool runs | Test gate (block edit if tests fail) |
| PostToolUse | After a tool runs | Format code, typecheck, pattern capture |
| PreCommit | Before git commit | Lint staged files |
| SessionStart | On session start | Load profile, check environment |

## Adding Custom Hooks

Add hooks in `.claude/hooks.json`:
```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "tools": ["Edit", "Write"],
      "command": "node .claude/scripts/hooks/my-custom-hook.js $FILE"
    }
  ]
}
```
```

- [ ] **Step 23: Create docs/creating-skills.md**

```markdown
# Creating Custom Skills

Skills are ERNE's extensibility mechanism. They're reusable knowledge units that Claude can invoke.

## Skill Structure

```
skills/my-skill/
  SKILL.md          # Required: skill definition
  references/       # Optional: supporting documents
    api-docs.md
    examples.md
```

## SKILL.md Format

```markdown
---
name: my-skill
description: One-line description of what this skill does
---

# Skill Title

[When to invoke this skill]
[Step-by-step workflow]
[Code examples]
[Expected output format]
```

## Writing Good Skills

### Do
- Be specific and actionable
- Include code examples that work
- Define clear output format
- State when to invoke (triggers)
- Reference existing rules where relevant

### Don't
- Write generic advice
- Include outdated API examples
- Duplicate what rules already enforce
- Create skills for one-time tasks

## Auto-Generated Skills

ERNE's continuous learning system (`/learn` command) automatically generates skills from observed patterns. These appear in `.claude/skills/` after approval.

### How Auto-Generation Works

1. PostToolUse hook observes your coding patterns
2. When a pattern repeats 3+ times, it's flagged
3. Running `/learn` analyzes and generates candidates
4. You approve/reject each candidate
5. Approved content becomes a permanent skill

## Sharing Skills

Skills are plain markdown files. Share them by:
1. Copying the skill directory to another project
2. Publishing as an npm package
3. Contributing to the ERNE community repository
```

- [ ] **Step 24: Verify 5 documentation files**

Run: `ls -la docs/`
Expected: 5 `.md` files (getting-started, agents, commands, hooks-profiles, creating-skills).

---

### Task 5: Validation Schemas (2 files)

JSON schemas for validating hook configurations and plugin structure.

**Files to create (2):**
- `schemas/hooks.schema.json`
- `schemas/plugin.schema.json`

**Steps:**

- [ ] **Step 25: Create schemas/hooks.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ERNE Hooks Configuration",
  "description": "Schema for .claude/hooks.json defining Claude Code hook scripts",
  "type": "object",
  "required": ["hooks"],
  "properties": {
    "hooks": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["event", "command"],
        "properties": {
          "event": {
            "type": "string",
            "enum": ["PreToolUse", "PostToolUse", "PreCommit", "SessionStart"],
            "description": "Claude Code event that triggers this hook"
          },
          "tools": {
            "type": "array",
            "items": { "type": "string" },
            "description": "Tool names to filter on (only for PreToolUse/PostToolUse)"
          },
          "command": {
            "type": "string",
            "description": "Shell command to execute. Use $FILE for the affected file path."
          },
          "profiles": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": ["minimal", "standard", "strict"]
            },
            "description": "Which profiles this hook is active in"
          },
          "timeout": {
            "type": "integer",
            "minimum": 1000,
            "maximum": 30000,
            "default": 5000,
            "description": "Maximum execution time in milliseconds"
          },
          "failAction": {
            "type": "string",
            "enum": ["block", "warn", "silent"],
            "default": "warn",
            "description": "What to do if the hook fails"
          }
        }
      }
    }
  }
}
```

- [ ] **Step 26: Create schemas/plugin.schema.json**

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "ERNE Plugin Structure",
  "description": "Schema for validating the overall ERNE plugin file structure",
  "type": "object",
  "required": ["version", "name"],
  "properties": {
    "version": {
      "type": "string",
      "pattern": "^\\d+\\.\\d+\\.\\d+",
      "description": "Semantic version of the plugin"
    },
    "name": {
      "type": "string",
      "const": "erne-universal",
      "description": "Plugin package name"
    },
    "platform": {
      "type": "string",
      "enum": ["expo", "bare-rn", "both"],
      "description": "Detected project platform type"
    },
    "profile": {
      "type": "string",
      "enum": ["minimal", "standard", "strict"],
      "default": "standard",
      "description": "Active hook profile"
    },
    "layers": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["common", "expo", "bare-rn", "native-ios", "native-android"]
      },
      "description": "Active rule layers based on project detection"
    },
    "mcpServers": {
      "type": "array",
      "items": { "type": "string" },
      "description": "Installed MCP server names"
    },
    "structure": {
      "type": "object",
      "description": "Expected directory structure",
      "properties": {
        "agents": { "type": "integer", "minimum": 8 },
        "rules": { "type": "integer", "minimum": 9 },
        "commands": { "type": "integer", "minimum": 16 },
        "contexts": { "type": "integer", "minimum": 3 },
        "skills": { "type": "integer", "minimum": 8 },
        "hooks": { "type": "integer", "minimum": 1 }
      }
    }
  }
}
```

- [ ] **Step 27: Verify 2 schema files**

Run: `ls -la schemas/`
Expected: 2 `.json` files (hooks.schema.json, plugin.schema.json).

---

### Task 6: Final Plan 3 Verification

- [ ] **Step 28: Full file count verification**

```bash
echo "=== Skills ===" && find skills/ -name "SKILL.md" | wc -l
echo "=== CL2 Files ===" && find skills/continuous-learning-v2/ -type f | wc -l
echo "=== Docs ===" && ls -1 docs/*.md | wc -l
echo "=== Schemas ===" && ls -1 schemas/*.json | wc -l
```

Expected totals:
| Category | Count |
|----------|-------|
| Skill SKILL.md files | 8 (including react-native-unified which pre-exists) |
| continuous-learning-v2 internal files | 9 |
| Documentation | 5 |
| Schemas | 2 |
| **Total new files** | **~24** |

- [ ] **Step 29: Cross-reference with spec**

Verify all 8 core skills from spec Section 5 are present:
1. react-native-unified (pre-existing)
2. continuous-learning-v2
3. tdd-workflow
4. coding-standards
5. security-review
6. performance-optimization
7. native-module-scaffold
8. upgrade-workflow

Verify all 5 docs from file structure (spec lines 171-176).
Verify both schemas from file structure (spec lines 164-166).

---

## Plan 3 Summary

| Chunk | Tasks | Files | Status |
|-------|-------|-------|--------|
| 1: Core Skills | 1-2 | 6 SKILL.md | Planned |
| 2: Continuous Learning | 3 | ~9 files | Planned |
| 3: Docs & Schemas | 4-5 | 7 files | Planned |
| Verification | 6 | — | Planned |
| **Total** | **6 tasks** | **~24 files** | |

**Execution order:** Chunks 1-3 sequentially. Tasks within chunks can be parallelized. The react-native-unified skill pre-exists and should NOT be recreated.

**Dependencies:** Plan 2 content (agents, rules, commands) must exist for cross-references in documentation. Skills themselves are self-contained.

---

*End of Plan 3: Skills & Knowledge Base*