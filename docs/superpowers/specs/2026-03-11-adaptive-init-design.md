# ERNE Adaptive Init System — Design Spec

> **Goal:** Make `npx erne-universal init` produce perfect, project-specific configurations by deeply scanning the target project's stack and selecting matching content variants.

> **Decision:** Option A — Init-time generation. Detection determines what gets installed. Content is selected from pre-written variant files, not generated dynamically.

> **Validated against:** 4 real projects — GPC (bare RN monorepo), gpc-expo (modern Expo), ImediL (early Expo), viani-app (mature Expo).

---

## 1. Deep Stack Detection (`lib/detect.js`)

### Output Shape

```javascript
{
  isRNProject: boolean,
  framework: 'expo-managed' | 'expo-bare' | 'bare-rn' | 'unknown',
  stack: {
    state:       'zustand' | 'redux-toolkit' | 'redux-saga' | 'mobx' | 'none',
    serverState: 'tanstack-query' | 'rtk-query' | 'swr' | 'none',
    navigation:  'expo-router' | 'react-navigation' | 'none',
    styling:     'stylesheet' | 'nativewind' | 'tamagui' | 'unistyles',
    lists:       'flashlist' | 'flatlist',
    images:      'expo-image' | 'fast-image' | 'rn-image',
    forms:       'react-hook-form' | 'formik' | 'redux-form' | 'none',
    storage:     'expo-secure-store' | 'rn-keychain' | 'async-storage',
    testing:     'jest-rntl' | 'jest-detox' | 'none',
    build:       'eas' | 'fastlane' | 'manual',
  },
  hasMonorepo: boolean,
  hasNewArch: boolean,
  hasTypescript: boolean,
  existingClaudeMd: boolean,
  componentStyle: 'functional' | 'class' | 'mixed',
}
```

### Detection Logic

| Field | Source | Logic |
|-------|--------|-------|
| `framework` | `package.json` deps + file system | `expo` in deps → expo. Then: `ios/` or `android/` with native code AND no `expo` → `bare-rn`. Expo + native dirs → `expo-bare`. Expo + no native dirs → `expo-managed`. |
| `state` | `package.json` deps | Priority: `zustand` > `@reduxjs/toolkit` > `redux-saga` (check for `redux-saga` dep) > `mobx-react` > `none` |
| `serverState` | `package.json` deps | `@tanstack/react-query` > `swr` > `none`. Note: RTK Query is bundled in `@reduxjs/toolkit` and cannot be detected from deps alone — if `state` is `redux-toolkit`, default `serverState` to `none` (RTK Query detection is not worth source scanning). |
| `navigation` | `package.json` deps | `expo-router` > `@react-navigation/native` > `none` |
| `styling` | `package.json` deps | `nativewind` > `tamagui` > `react-native-unistyles` > default `stylesheet` |
| `lists` | `package.json` deps | `@shopify/flash-list` present → `flashlist`, else `flatlist` |
| `images` | `package.json` deps | `expo-image` > `react-native-fast-image` > default `rn-image` |
| `forms` | `package.json` deps | `react-hook-form` > `formik` > `redux-form` > `none` |
| `storage` | `package.json` deps | `expo-secure-store` > `react-native-keychain` > default `async-storage` |
| `testing` | `package.json` devDeps | `@testing-library/react-native` → `jest-rntl`. `detox` → `jest-detox`. Neither → `none` |
| `build` | `package.json` deps + files | `eas.json` exists → `eas`. `fastlane/` dir exists → `fastlane`. Else `manual` |
| `hasMonorepo` | files | `lerna.json` OR `pnpm-workspace.yaml` OR `pnpm-workspace.yml` OR `nx.json` OR `rush.json` OR `workspaces` field in package.json |
| `hasNewArch` | `package.json` + files | `newArchEnabled` in app.json/package.json, or `RCTAppDelegate` in iOS code |
| `hasTypescript` | files | `tsconfig.json` exists |
| `existingClaudeMd` | files | `CLAUDE.md` exists in cwd |
| `componentStyle` | source scan | Recursive scan of `.tsx`/`.ts` files from project root (excluding `node_modules/`, `ios/`, `android/`, `.expo/`), sample first 30 files found. Check for `class.*extends.*Component` patterns. >50% class → `class`, any class → `mixed`, else `functional` |

### Bug Fixes from Current Implementation

1. **app.json false positive**: Current code treats `app.json` presence as Expo. Fix: require `expo` in `package.json` dependencies.
2. **hasBareRN inversion**: Current `hasBareRN = !hasExpo` misses expo-bare projects. Fix: separate framework detection logic.
3. **No native code scanning**: Current checks for `.swift`/`.kt` files only. Fix: also check `.m`, `.mm` (Objective-C) and `.java` files.

---

## 2. Template Variants

### Directory Structure

```
rules/variants/
  state-management/
    zustand-tanstack.md
    zustand-only.md
    redux-saga.md
    redux-toolkit.md
  navigation/
    expo-router.md
    react-navigation.md
  performance/
    modern.md              # FlashList + expo-image + Hermes
    legacy.md              # FlatList + RN Image + optimization tips
  styling/
    stylesheet.md
    nativewind.md
  coding-style/
    functional.md
    mixed.md               # Class + functional (legacy support)
  security/
    expo-secure.md
    rn-keychain.md
    async-storage.md

agents/variants/
  ui-designer/
    stylesheet.md
    nativewind.md
  architect/
    zustand.md
    redux.md
    monorepo.md
  senior-developer/
    modern-expo.md
    legacy-bare.md
  feature-builder/
    modern-expo.md
    legacy-bare.md
```

### Variant Selection Map

```javascript
const VARIANT_MAP = {
  // Rules
  'rules/common/state-management.md': {
    fields: ['state', 'serverState'],
    variants: {
      'zustand+tanstack-query': 'state-management/zustand-tanstack.md',
      'zustand+none':           'state-management/zustand-only.md',
      'redux-saga+none':        'state-management/redux-saga.md',
      'redux-saga+tanstack-query': 'state-management/redux-saga.md',
      'redux-toolkit+rtk-query':'state-management/redux-toolkit.md',
      'redux-toolkit+tanstack-query': 'state-management/redux-toolkit.md',
      'redux-toolkit+none':     'state-management/redux-toolkit.md',
    },
    default: 'state-management/zustand-tanstack.md'
  },
  'rules/common/navigation.md': {
    fields: ['navigation'],
    variants: {
      'expo-router':      'navigation/expo-router.md',
      'react-navigation': 'navigation/react-navigation.md',
    },
    default: 'navigation/expo-router.md'
  },
  'rules/common/performance.md': {
    fields: ['lists', 'images'],
    variants: {
      'flashlist+expo-image':  'performance/modern.md',
      'flashlist+rn-image':    'performance/modern.md',
      'flatlist+expo-image':   'performance/modern.md',
      'flatlist+rn-image':     'performance/legacy.md',
      'flatlist+fast-image':   'performance/legacy.md',
    },
    default: 'performance/modern.md'
  },
  'rules/common/coding-style.md': {
    fields: ['componentStyle'],
    variants: {
      'functional': 'coding-style/functional.md',
      'class':      'coding-style/mixed.md',
      'mixed':      'coding-style/mixed.md',
    },
    default: 'coding-style/functional.md'
  },
  'rules/common/security.md': {
    fields: ['storage'],
    variants: {
      'expo-secure-store': 'security/expo-secure.md',
      'rn-keychain':       'security/rn-keychain.md',
      'async-storage':     'security/async-storage.md',
    },
    default: 'security/async-storage.md'  // safe default — warns about insecure storage
  },

  // Styling rules (currently missing from common/ — will be added)
  'rules/common/styling.md': {
    fields: ['styling'],
    variants: {
      'stylesheet':  'styling/stylesheet.md',
      'nativewind':  'styling/nativewind.md',
      'tamagui':     'styling/stylesheet.md',   // TODO: tamagui variant in future
      'unistyles':   'styling/stylesheet.md',   // TODO: unistyles variant in future
    },
    default: 'styling/stylesheet.md'
  },

  // Agents
  'agents/ui-designer.md': {
    fields: ['styling'],
    variants: {
      'stylesheet':  'ui-designer/stylesheet.md',
      'nativewind':  'ui-designer/nativewind.md',
      'tamagui':     'ui-designer/stylesheet.md',
      'unistyles':   'ui-designer/stylesheet.md',
    },
    default: 'ui-designer/stylesheet.md'
  },
  'agents/architect.md': {
    fields: ['state', 'hasMonorepo'],
    variants: {
      'zustand+false':       'architect/zustand.md',
      'zustand+true':        'architect/monorepo.md',
      'redux-toolkit+false': 'architect/redux.md',
      'redux-toolkit+true':  'architect/monorepo.md',
      'redux-saga+false':    'architect/redux.md',
      'redux-saga+true':     'architect/monorepo.md',
    },
    default: 'architect/zustand.md'
  },
  'agents/senior-developer.md': {
    fields: ['framework', 'state'],
    variants: {
      'expo-managed+zustand':      'senior-developer/modern-expo.md',
      'expo-managed+redux-toolkit':'senior-developer/legacy-bare.md',
      'expo-bare+zustand':         'senior-developer/modern-expo.md',
      'bare-rn+redux-saga':        'senior-developer/legacy-bare.md',
      'bare-rn+redux-toolkit':     'senior-developer/legacy-bare.md',
      'bare-rn+zustand':           'senior-developer/modern-expo.md',
    },
    default: 'senior-developer/modern-expo.md'
  },
  'agents/feature-builder.md': {
    fields: ['framework', 'state'],
    // Same mapping as senior-developer
    variants: {
      'expo-managed+zustand':      'feature-builder/modern-expo.md',
      'expo-managed+redux-toolkit':'feature-builder/legacy-bare.md',
      'expo-bare+zustand':         'feature-builder/modern-expo.md',
      'bare-rn+redux-saga':        'feature-builder/legacy-bare.md',
      'bare-rn+redux-toolkit':     'feature-builder/legacy-bare.md',
      'bare-rn+zustand':           'feature-builder/modern-expo.md',
    },
    default: 'feature-builder/modern-expo.md'
  },
};
```

### Variant Lookup Contract

When the variant key (built from concatenating field values with `+`) does not match any entry in `variants`, the `default` file is used. This is intentional — not every combination of framework x state x serverState needs an explicit entry. The `default` is the recommended best-practice variant (modern Expo patterns). Unlisted combos like `expo-managed+mobx`, `bare-rn+none`, or `unknown+zustand` all fall through to the default.

The `forms` detection field is captured in `settings.json` for informational display but has no variant mapping — form library choice does not significantly affect agent behavior or rule content.

### Universal Content (no variants)

These are copied as-is for all projects:

- **Agents:** `code-reviewer.md`, `performance-profiler.md`, `tdd-guide.md`, `upgrade-assistant.md`
- **Agents (conditional):** `expo-config-resolver.md` (Expo only), `native-bridge-builder.md` (bare-rn only)
- **Skills:** All files in `skills/` directory (universally applicable)
- **Commands:** All files in `commands/` directory
- **Contexts:** All files in `contexts/` directory
- **Hooks:** Profile-based (existing system works)

---

## 3. CLAUDE.md Handling (`lib/claude-md.js`)

### Three Scenarios

**Scenario A — No existing CLAUDE.md:** Generate a comprehensive project-specific file with detected stack summary, key rules, available commands, and `@import` directives.

**Scenario B — Existing CLAUDE.md (non-ERNE):** Back up to `CLAUDE.md.pre-erne`, then append ERNE section with `---` separator. Preserves all existing project documentation.

**Scenario C — Existing ERNE-generated CLAUDE.md (re-install):** Detected by presence of `<!-- ERNE-GENERATED -->` marker comment in the file. All generated CLAUDE.md files include this marker on line 1. Regenerate fully using Scenario A logic.

### Generated CLAUDE.md Structure (Scenario A)

```markdown
<!-- ERNE-GENERATED -->
# {Project Name} — ERNE Configuration

## Project Stack
- **Framework**: {detected framework}
- **Language**: TypeScript
- **Navigation**: {detected navigation}
- **State**: {detected state} + {detected serverState}
- **Styling**: {detected styling}
- **Lists**: {detected lists}
- **Images**: {detected images}
- **Testing**: {detected testing}
- **Build**: {detected build}

## Key Rules
- Functional components with const + arrow functions
- Named exports only (no default exports)
- {state-specific rules — e.g., "Zustand selective subscriptions"}
- {navigation-specific rules — e.g., "File-based routing with Expo Router"}
- {list-specific rules — e.g., "FlashList over FlatList for 100+ items"}
- {storage-specific rules — e.g., "expo-secure-store for tokens"}
- Conventional Commits: feat:, fix:, refactor:, test:, docs:, chore:

## Available Commands
/plan, /code-review, /tdd, /build-fix, /perf, /upgrade, /debug, /deploy,
/component, /navigate, /animate, /quality-gate, /security-review

## Rules
@import .claude/rules/common/
@import .claude/rules/{framework-layer}/

## Skills
@import .claude/skills/
```

---

## 4. Updated Init Flow (`lib/init.js`)

### Module Structure

```
lib/
  init.js        — Orchestrator: CLI args, user prompts, calls other modules
  detect.js      — Deep stack detection (reads package.json, scans files)
  generate.js    — Variant selection + file copying
  claude-md.js   — CLAUDE.md merge/generate logic
```

### Flow

```
Step 1: Deep scan (detect.js)
  → Read package.json, scan directories, build full stack profile

Step 2: Print detection report
  → Rich output showing every detected dimension

Step 3: Hook profile selection
  → Same as current (minimal/standard/strict)
  → Non-interactive: --profile flag or default "standard"

Step 4: MCP server selection
  → Same as current
  → Non-interactive: --mcp flag, --no-mcp, or defaults

Step 5: Generate configuration (generate.js + claude-md.js)
  → Copy universal content (commands, contexts, hook scripts, skills)
  → Copy base rules (common + framework layer)
  → Apply variant overrides based on VARIANT_MAP
  → Skip irrelevant agents (native-bridge-builder for Expo, expo-config-resolver for bare-rn)
  → Apply hook profile
  → Apply MCP configs
  → Handle CLAUDE.md (append/generate/regenerate)
  → Write settings.json with full detection profile
```

### Detection Report Output

```
  Scanning project...

    Framework:   Expo SDK 55 (managed)
    State:       Zustand + TanStack Query
    Navigation:  Expo Router
    Styling:     StyleSheet.create
    Lists:       FlashList
    Images:      expo-image
    Forms:       React Hook Form
    Storage:     expo-secure-store
    Testing:     Jest + RNTL
    Build:       EAS Build
    TypeScript:  Yes
    New Arch:    Yes
    Monorepo:    No
    Components:  Functional
    CLAUDE.md:   Exists (will append, backup to CLAUDE.md.pre-erne)
```

---

## 5. What Each Real Project Would Get

### GPC (bare RN monorepo, Redux + Saga)

- **Framework layer:** `bare-rn/`
- **State rules:** `redux-saga.md`
- **Navigation rules:** `react-navigation.md`
- **Performance rules:** `legacy.md`
- **Coding style:** `mixed.md` (class components)
- **Security:** `async-storage.md`
- **Agents:** `architect/monorepo.md`, `senior-developer/legacy-bare.md`, `ui-designer/stylesheet.md`
- **Skipped:** `expo-config-resolver.md`
- **Included:** `native-bridge-builder.md`
- **CLAUDE.md:** Appended (existing comprehensive CLAUDE.md preserved)

### gpc-expo (modern Expo, Zustand + TQ)

- **Framework layer:** `expo/`
- **State rules:** `zustand-tanstack.md`
- **Navigation rules:** `expo-router.md`
- **Performance rules:** `modern.md`
- **Coding style:** `functional.md`
- **Security:** `expo-secure.md`
- **Agents:** `architect/zustand.md`, `senior-developer/modern-expo.md`, `ui-designer/stylesheet.md`
- **Skipped:** `native-bridge-builder.md`
- **CLAUDE.md:** Generated new

### ImediL (early Expo, RTK installed unused)

- **Framework layer:** `expo/`
- **State rules:** `redux-toolkit.md` (detected from deps)
- **Navigation rules:** `react-navigation.md`
- **Performance rules:** `legacy.md`
- **Coding style:** `functional.md`
- **Security:** `async-storage.md`
- **Agents:** `architect/redux.md`, `senior-developer/legacy-bare.md`, `ui-designer/stylesheet.md`
- **CLAUDE.md:** Generated new

### viani-app (mature Expo, Zustand + TQ)

- **Framework layer:** `expo/`
- **State rules:** `zustand-tanstack.md`
- **Navigation rules:** `expo-router.md`
- **Performance rules:** `modern.md`
- **Coding style:** `functional.md`
- **Security:** `expo-secure.md`
- **Agents:** `architect/zustand.md`, `senior-developer/modern-expo.md`, `ui-designer/stylesheet.md`
- **CLAUDE.md:** Regenerated (detected as previous ERNE overwrite)

---

## 6. Testing Strategy

- **Unit tests for `detect.js`**: Mock package.json with different dep combos, assert correct profile output
- **Unit tests for `generate.js`**: Mock detection profile, verify correct variant files selected
- **Unit tests for `claude-md.js`**: Test all 3 scenarios (new, append, regenerate)
- **Integration test**: Run `init --yes` in a temp directory with a mock package.json, verify all output files

---

## 7. Scope Exclusions

- **No runtime adaptation**: All decisions happen at init time. No session-start hook changes.
- **No custom theme detection**: We detect library choices, not project-specific theme tokens (that's user's CLAUDE.md content).
- **No NativeWind variant content writing**: We define the structure; actual variant file content is written during implementation.
- **No changes to dashboard, website, or npm publishing**: Separate tasks.
- **No `--dry-run` flag in v1**: May be added later. For now, init is safe — it creates a backup before overwriting CLAUDE.md.

## 8. Error Handling

- **No `package.json`**: Exit with message "No package.json found. Run this from a React Native project root." Detection still runs but marks `isRNProject: false`.
- **Corrupt `package.json`**: Catch JSON parse error, log warning, continue with `isRNProject: false` and all stack values as defaults.
- **Missing variant file**: If a selected variant file doesn't exist on disk, fall back to the default variant and log a warning. Never crash.
- **Multiple state libraries detected**: Log informational note (e.g., "Detected both zustand and @reduxjs/toolkit — using zustand"). Use the highest-priority library per the detection table.
