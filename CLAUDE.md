# ERNE — Everything React Native & Expo

You are working in an ERNE-powered React Native/Expo project.

## Project Stack

> **Note:** When `erne init` runs in a project, this section is replaced with a stack summary generated from deep detection of the project's actual dependencies (state management, navigation, styling, lists, images, forms, storage, testing, build system).

- **Framework**: React Native with Expo (managed or bare)
- **Language**: TypeScript (strict mode)
- **Navigation**: Detected at init (Expo Router, React Navigation, etc.)
- **State**: Detected at init (Zustand, Redux Toolkit, MobX, etc.)
- **Testing**: Jest + React Native Testing Library + Detox
- **Styling**: Detected at init (StyleSheet.create, NativeWind, etc.)

## Documentation Verification

When working with Expo or React Native APIs:

1. **If context7 MCP is available** — always verify API usage against current docs before writing code (`resolve-library-id` → `query-docs`)
2. **If context7 is not available** — note in comments that API usage should be verified against current docs
3. Agent training data has a fixed cutoff — newer APIs, deprecations, and breaking changes may not be known. The `.claude/rules/` files are auto-maintained by the knowledge updater but always prefer live docs when available.

## Key Rules

### Code Style

- Functional components only with `const` + arrow functions
- PascalCase for components, camelCase for hooks/utils, SCREAMING_SNAKE for constants
- Named exports only (no default exports)
- Group imports: react → react-native → expo → external → internal → types
- Max component length: 250 lines — extract if larger

### Performance

- Memoize with `React.memo`, `useMemo`, `useCallback` where measurable
- Use `FlashList` over `FlatList` for large lists (100+ items)
- Avoid anonymous functions in JSX render paths
- Optimize images: WebP format, resizeMode, caching
- Keep JS bundle under 1.5MB

### Testing

- Every new component/hook needs a test file
- Test user behavior, not implementation details
- Mock native modules at `__mocks__/` level
- E2E critical paths with Detox

### Security

- Never hardcode secrets — use environment variables
- Validate all deep link parameters
- Pin SSL certificates for sensitive API calls
- Use secure storage for tokens (expo-secure-store, react-native-keychain, etc.)

### Git

- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Branch naming: `feat/`, `fix/`, `refactor/` prefix
- Atomic commits — one logical change per commit

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately — don't keep pushing
- Use plan mode for verification steps, not just building
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- For complex problems, throw more compute at it via subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: save a `feedback` memory via the memory system
- Write rules for yourself that prevent the same mistake
- Memory is auto-loaded each session — no manual review needed

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Diff behavior between main and your changes when relevant
- Ask yourself: "Would a staff engineer approve this?"
- Run tests, check logs, demonstrate correctness

### 5. Demand Elegance (Balanced)

- For non-trivial changes: pause and ask "is there a more elegant way?"
- If a fix feels hacky: "Knowing everything I know now, implement the elegant solution"
- Skip this for simple, obvious fixes — don't over-engineer
- Challenge your own work before presenting it

### 6. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Point at logs, errors, failing tests — then resolve them
- Zero context switching required from the user
- Go fix failing CI tests without being told how

## Smart Agent Routing

When a user's message matches these signals, automatically use the corresponding agent via a subagent. The user should NOT need to type explicit `/commands` — detect intent from context. Explicit `/command` invocations always override auto-routing.

**How routing works:** Read the user's message. If it matches trigger signals below, dispatch the matching agent as a subagent. If multiple agents could match, prefer the more specific one. If unclear, ask the user.

**Image detection:** When the user shares an image/screenshot alongside a description of a visual problem, ALWAYS route to visual-debugger.

| Agent                     | Trigger Signals                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual-debugger`         | Image in chat with UI issue, screenshot, "doesn't look right", "UI is broken", "layout not working", "fix this" + image, spacing, alignment, overflow, "wrong colors", "doesn't match Figma", pixel, responsive, "design issue", "visual bug", "cut off", overlapping, "not centered", "wrong font", "dark mode broken", "safe area", notch, "status bar", "keyboard covers" |
| `performance-profiler`    | "slow", lag, FPS, "memory leak", jank, freeze, hanging, "bundle size", TTI, "startup time", "re-render", heavy, "animation stutter", "frame drop", "battery drain", "CPU usage", "JS thread blocked", "bridge overhead", "large list", "image loading slow", "splash screen long", ANR                                                                                       |
| `code-reviewer`           | review, PR, refactor, "code quality", "clean up", "best practice", "technical debt", "code smell", maintainability, "check my code", "is this okay", "anti-pattern", readability, DRY, SOLID, "type safety"                                                                                                                                                                  |
| `architect`               | "how to build", architecture, structure, plan, "system design", "new feature", "want to add", "how to approach", decompose, "design pattern", "folder structure", "state management", "data flow", "API design", "navigation structure", monorepo, "separation of concerns"                                                                                                  |
| `feature-builder`         | implement, build, create, "add feature", "create component", "write this", "make this", scaffold, "add screen", "wire up", integrate, "connect to API", "hook up", "add functionality", CRUD                                                                                                                                                                                 |
| `tdd-guide`               | test, coverage, jest, detox, TDD, "write test", "unit test", e2e, "failing test", "test broken", "snapshot test", mock, fixture, "testing library", "integration test", "test flaky"                                                                                                                                                                                         |
| `expo-config-resolver`    | build error, red screen, crash, "won't start", error, "build failed", metro, babel, "config issue", "EAS build", "can't build", "module not found", "pod install", gradle, "Xcode error", "Android build", "iOS build", "linking error", prebuild, "app.json", "app.config", "plugin not working", "white screen", "blank screen"                                            |
| `native-bridge-builder`   | "native module", bridge, "turbo module", Swift, Kotlin, Java, "Objective-C", "native code", "platform specific", "expo module", JSI, Fabric, "New Architecture", codegen, "C++", "native view", Nitro, "expo-modules-core"                                                                                                                                                   |
| `upgrade-assistant`       | upgrade, update, version, migration, "breaking change", deprecated, "Expo SDK", "React Native version", bump, migrate, changelog, compatibility, "peer dependency", outdated, "npx expo install --fix"                                                                                                                                                                       |
| `ui-designer`             | component, button, modal, form, screen, page, tab, "navigation UI", "build UI", "design system", styled, theme, icon, animation, transition, gesture, "bottom sheet", drawer, header, card, skeleton, loading, toast                                                                                                                                                         |
| `pipeline-orchestrator`   | deploy, publish, EAS, "app store", "play store", "CI/CD", release, "OTA update", submit, distribution, TestFlight, "internal testing", "code signing", provisioning, certificate, keystore, fastlane, "GitHub Actions"                                                                                                                                                       |
| `senior-developer`        | "what do you think", opinion, advice, approach, tradeoff, "not sure how", mentor, "help me decide", "best way to", "should I", "pros and cons", "compare options", "which is better", "common pitfall", "production ready", scalable                                                                                                                                         |
| `documentation-generator` | "generate docs", "document this", "write documentation", "project overview", "architecture docs", "what does this project do", "onboard me", "explain codebase", "project structure", "how does this work"                                                                                                                                                                   |

## Task Management

1. **Plan First**: Use plan mode or TodoWrite for non-trivial tasks
2. **Verify Plan**: Check in before starting implementation
3. **Track Progress**: Use built-in task system (TodoWrite/TaskCreate) to mark progress
4. **Explain Changes**: High-level summary at each step
5. **Capture Lessons**: Save corrections as `feedback` memories

## Core Principles

- **Simplicity First**: Make every change as simple as possible. Impact minimal code.
- **No Laziness**: Find root causes. No temporary fixes. Senior developer standards.
- **Minimal Impact**: Changes should only touch what's necessary. Avoid introducing bugs.

## Available Commands

Use `/erne-plan`, `/erne-code-review`, `/erne-tdd`, `/erne-build-fix`, `/erne-perf`, `/erne-upgrade`, `/erne-native-module`, `/erne-navigate`, `/erne-animate`, `/erne-deploy`, `/erne-component`, `/erne-debug`, `/erne-debug-visual`, `/erne-audit`, `/erne-quality-gate`, `/erne-code`, `/erne-feature`, `/erne-learn`, `/erne-retrospective`, `/erne-setup-device` for guided workflows.

## Worker Mode (Autonomous Ticket Execution)

ERNE can run as an autonomous worker that polls a ticket provider, picks up ready tasks, and executes the full pipeline without human intervention.

### Quick Start

```bash
erne worker --config worker.json
```

### How It Works

1. Polls a configured provider (ClickUp, GitHub Issues, Linear, Jira, or local JSON) for tickets marked as ready
2. Validates each ticket has sufficient detail (title, description, acceptance criteria)
3. Scores confidence (0-100) — skips tickets below the configured threshold
4. Generates an implementation plan from ticket context + project audit data
5. Executes in an isolated git worktree to avoid disrupting the main branch
6. Runs the test suite and verifies no regressions
7. Performs automated self-review against ERNE coding standards
8. Compares audit health score before and after changes
9. Creates a pull request with summary, test results, and ticket link

### Quality Gates

Each ticket must pass these gates before a PR is created:

- Confidence score above threshold (default: 70)
- All existing tests pass
- No audit score regression
- Self-review finds no critical issues

### Configuration

See `worker.example.json` for a full template. Key options:

- `provider.type` — clickup, github, linear, jira, local
- `provider.poll_interval_seconds` — How often to check for new tickets (default: 60)
- `erne.min_confidence` — Minimum confidence score to attempt a ticket (default: 70)
- `erne.hook_profile` — ERNE hook profile to use (minimal, standard, strict)
- `repo.path` — Absolute path to the local repository
- `repo.base_branch` — Branch to create worktrees from (default: main)

### CLI Options

| Flag              | Description                                 |
| ----------------- | ------------------------------------------- |
| `--config <path>` | Path to worker config JSON (required)       |
| `--dry-run`       | Fetch and display tickets without executing |
| `--once`          | Process one ticket then exit                |

## Available Skills

Skills in `skills/` activate automatically:

- `coding-standards` — Audit and enforce standards
- `tdd-workflow` — Red-green-refactor cycle
- `performance-optimization` — Diagnose and fix perf issues
- `security-review` — Mobile security audit
- `native-module-scaffold` — Create Turbo/Expo modules
- `upgrade-workflow` — Version migration guide
- `continuous-learning-v2` — Pattern extraction and learning

---

<!-- erne-profile: standard -->

# ERNE Configuration (auto-generated)

## Rules

@import .claude/rules/common/

## Skills

@import .claude/skills/

## Available Commands

/erne-plan, /erne-code-review, /erne-tdd, /erne-build-fix, /erne-perf, /erne-upgrade, /erne-native-module, /erne-debug, /erne-debug-visual, /erne-deploy,
/erne-component, /erne-navigate, /erne-animate, /erne-orchestrate, /erne-quality-gate, /erne-code, /erne-feature, /erne-worker, /erne-audit, /erne-learn, /erne-retrospective, /erne-setup-device

## Dashboard

ERNE includes a visual dashboard. Launch: `npx erne-universal dashboard`
