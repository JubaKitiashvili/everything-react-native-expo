# Memory Integration for Multi-Agent Workflows

ERNE agents use persistent memory to build project knowledge over time. This document defines the tagging convention, save/retrieve patterns, and MCP integration for all 11 core agents.

## Tagging Convention

All memory observations follow a three-part tag pattern:

```
[agent-name, project-name, category]
```

- **agent-name**: One of the 11 core agents (e.g., `architect`, `code-reviewer`, `pipeline-orchestrator`)
- **project-name**: The current project identifier (e.g., `my-app`, `acme-mobile`)
- **category**: One of the defined categories below

## Categories

| Category | Purpose | Typical Agents |
|----------|---------|----------------|
| `navigation-plan` | Route structures, deep link schemas, tab layouts | architect, senior-developer |
| `review-findings` | Code review issues, recurring anti-patterns, blocking issues | code-reviewer, performance-profiler |
| `test-plan` | Test strategies, mock patterns, coverage gaps, flaky test fixes | tdd-guide, code-reviewer |
| `implementation-notes` | Code patterns, API integrations, hook abstractions, edge cases | senior-developer, feature-builder |
| `architecture-decisions` | State management choices, folder structure, dependency selections | architect, senior-developer |
| `performance-baselines` | FPS metrics, bundle sizes, TTI measurements, memory profiles | performance-profiler |
| `upgrade-history` | SDK migrations, breaking changes encountered, codemod results | upgrade-assistant, expo-config-resolver |

## Agent-Specific Examples

### 1. architect

**Save:**
```
save_observation(
  content: "Auth feature uses Zustand for session state + TanStack Query for user profile. Tab navigator with 4 tabs, modal stack for auth flow. Deep link scheme: myapp://auth/reset?token=X",
  tags: ["architect", "my-app", "architecture-decisions"]
)
```

**Search:**
```
search(query: "navigation structure auth flow", tags: ["architect", "my-app"])
```

### 2. senior-developer

**Save:**
```
save_observation(
  content: "useOptimisticUpdate hook pattern: wrap TanStack mutation with manual cache update + rollback on error. Used in cart feature, reusable for any list mutation.",
  tags: ["senior-developer", "my-app", "implementation-notes"]
)
```

**Search:**
```
search(query: "hook patterns optimistic update", tags: ["senior-developer", "my-app"])
```

### 3. feature-builder

**Save:**
```
save_observation(
  content: "ProfileScreen component uses compound pattern: ProfileHeader + ProfileStats + ProfileActions. Interface contract: requires useUser hook to return User type with stats field.",
  tags: ["feature-builder", "my-app", "implementation-notes"]
)
```

**Search:**
```
search(query: "component interface contract profile", tags: ["feature-builder", "my-app"])
```

### 4. code-reviewer

**Save:**
```
save_observation(
  content: "Recurring issue in features/chat: inline arrow functions in FlatList renderItem causing re-renders. Found in 3 separate PRs. Team needs a lint rule or shared pattern.",
  tags: ["code-reviewer", "my-app", "review-findings"]
)
```

**Search:**
```
search(query: "recurring anti-patterns FlatList", tags: ["code-reviewer", "my-app"])
```

### 5. tdd-guide

**Save:**
```
save_observation(
  content: "expo-secure-store mock at __mocks__/expo-secure-store.ts survived SDK 51 upgrade without changes. Stable pattern: export getItemAsync/setItemAsync as jest.fn().",
  tags: ["tdd-guide", "my-app", "test-plan"]
)
```

**Search:**
```
search(query: "native module mock patterns expo", tags: ["tdd-guide", "my-app"])
```

### 6. performance-profiler

**Save:**
```
save_observation(
  content: "Baseline 2024-01: Cold start TTI 2.1s, JS bundle 1.2MB, FPS during feed scroll 58. After adding react-native-maps: TTI 2.8s, bundle 1.6MB.",
  tags: ["performance-profiler", "my-app", "performance-baselines"]
)
```

**Search:**
```
search(query: "bundle size baseline TTI", tags: ["performance-profiler", "my-app"])
```

### 7. ui-designer

**Save:**
```
save_observation(
  content: "Design token structure: colors/spacing/typography in theme.ts. Dark mode via NativeWind dark: prefix. Haptic feedback on all primary buttons using expo-haptics impact(Light).",
  tags: ["ui-designer", "my-app", "architecture-decisions"]
)
```

**Search:**
```
search(query: "design tokens theme dark mode", tags: ["ui-designer", "my-app"])
```

### 8. native-bridge-builder

**Save:**
```
save_observation(
  content: "Expo Modules API: AsyncFunction with Promise on iOS runs on a background queue by default. On Android it runs on the main thread unless dispatched. Wrap Android impl in Dispatchers.IO coroutine.",
  tags: ["native-bridge-builder", "my-app", "implementation-notes"]
)
```

**Search:**
```
search(query: "threading model expo modules async", tags: ["native-bridge-builder", "my-app"])
```

### 9. expo-config-resolver

**Save:**
```
save_observation(
  content: "Config plugin ordering issue: withSentry must come AFTER withExpoUpdates in app.config.ts plugins array, otherwise the source map upload step fails during EAS Build.",
  tags: ["expo-config-resolver", "my-app", "upgrade-history"]
)
```

**Search:**
```
search(query: "config plugin ordering EAS Build", tags: ["expo-config-resolver", "my-app"])
```

### 10. upgrade-assistant

**Save:**
```
save_observation(
  content: "Expo SDK 51->52 upgrade: react-native-reanimated required 3.16.1 (not 3.15.x). Undocumented: babel plugin config changed from 'react-native-reanimated/plugin' to 'react-native-reanimated/babel'.",
  tags: ["upgrade-assistant", "my-app", "upgrade-history"]
)
```

**Search:**
```
search(query: "expo SDK upgrade breaking changes reanimated", tags: ["upgrade-assistant", "my-app"])
```

### 11. pipeline-orchestrator

**Save:**
```
save_observation(
  content: "Profile screen pipeline: architect phase took 2 min, parallel implement (senior-developer + feature-builder) took 8 min, test phase needed 1 retry due to missing mock. Total: 18 min for 3 files.",
  tags: ["pipeline-orchestrator", "my-app", "architecture-decisions"]
)
```

**Search:**
```
search(query: "pipeline timing retries profile feature", tags: ["pipeline-orchestrator", "my-app"])
```

## When to Save vs. When to Retrieve

### Save (save_observation) When:

- A non-obvious decision is made (architecture choice, dependency selection, workaround)
- A recurring problem is identified (same anti-pattern in multiple reviews)
- A baseline measurement is taken (performance metrics, bundle size)
- An upgrade reveals an undocumented breaking change
- A test pattern proves stable across SDK upgrades
- A workaround is needed for a platform-specific bug
- An interface contract is established between agents working in parallel

### Retrieve (search) When:

- Starting a new feature in a module that was previously architected
- Reviewing code in a module with known recurring issues
- Writing tests for a module that required specific mock patterns
- Profiling performance to compare against historical baselines
- Planning an upgrade to check past upgrade pain points
- Resolving a build error that may have occurred before
- Coordinating parallel implementation to check established contracts

## MCP Memory Integration

ERNE agents interact with memory through the MCP (Model Context Protocol) memory server, using two primary tools:

### save_observation

Persists a piece of knowledge with structured tags for later retrieval.

```
Tool: save_observation
Parameters:
  content: string   — The observation text (be specific, include versions and file paths)
  tags: string[]    — Array of tags following the [agent, project, category] convention
```

**Best practices for saving:**
- Include specific versions, file paths, and metric values -- not vague summaries
- One observation per concept -- do not bundle unrelated findings
- Use the agent name tag even when saving cross-cutting observations
- Prefer factual statements over opinions ("TTI is 2.8s" not "startup feels slow")

### search

Retrieves past observations matching a query and optional tag filters.

```
Tool: search
Parameters:
  query: string     — Natural language search query
  tags: string[]    — Optional tag filter to narrow results
```

**Best practices for searching:**
- Search before making decisions that may have prior context
- Use broad queries first, then narrow with tags if results are too noisy
- Cross-agent searches are valid -- an architect can search code-reviewer findings
- Combine project tag with category tag for targeted retrieval

### Cross-Agent Memory Flow

Agents can and should read observations from other agents. Common flows:

1. **architect** saves architecture decisions -> **senior-developer** and **feature-builder** search before implementing
2. **code-reviewer** saves recurring findings -> **tdd-guide** searches to write targeted tests
3. **performance-profiler** saves baselines -> **code-reviewer** searches during review to catch regressions
4. **upgrade-assistant** saves migration results -> **expo-config-resolver** searches when diagnosing build failures
5. **senior-developer** saves implementation patterns -> **feature-builder** searches to maintain consistency in parallel work
6. **pipeline-orchestrator** saves pipeline timing and retry data -> **pipeline-orchestrator** searches to optimize future pipeline runs
