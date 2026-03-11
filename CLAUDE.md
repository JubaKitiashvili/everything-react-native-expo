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

## Available Commands

Use `/plan`, `/code-review`, `/tdd`, `/build-fix`, `/perf`, `/upgrade`, `/native-module`, `/navigate`, `/animate`, `/deploy`, `/component`, `/debug`, `/quality-gate` for guided workflows.

## Available Skills

Skills in `skills/` activate automatically:
- `coding-standards` — Audit and enforce standards
- `tdd-workflow` — Red-green-refactor cycle
- `performance-optimization` — Diagnose and fix perf issues
- `security-review` — Mobile security audit
- `native-module-scaffold` — Create Turbo/Expo modules
- `upgrade-workflow` — Version migration guide
- `continuous-learning-v2` — Pattern extraction and learning
