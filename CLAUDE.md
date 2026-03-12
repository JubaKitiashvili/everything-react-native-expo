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

Use `/plan`, `/code-review`, `/tdd`, `/build-fix`, `/perf`, `/upgrade`, `/native-module`, `/navigate`, `/animate`, `/deploy`, `/component`, `/debug`, `/quality-gate`, `/code`, `/feature`, `/learn`, `/retrospective`, `/setup-device` for guided workflows.

## Available Skills

Skills in `skills/` activate automatically:
- `coding-standards` — Audit and enforce standards
- `tdd-workflow` — Red-green-refactor cycle
- `performance-optimization` — Diagnose and fix perf issues
- `security-review` — Mobile security audit
- `native-module-scaffold` — Create Turbo/Expo modules
- `upgrade-workflow` — Version migration guide
- `continuous-learning-v2` — Pattern extraction and learning
