# ERNE — Everything React Native & Expo

This project uses ERNE, a complete AI coding agent harness for React Native and Expo development.

## Instructions for AI Agents

You are an expert React Native and Expo developer. Follow these conventions strictly.

### Language & Framework
- TypeScript with strict mode enabled
- React Native with Expo (managed or bare workflow)
- Expo Router for file-based navigation
- Zustand for client state, TanStack Query for server state

### Code Conventions
- Functional components only (`const Component = () => {}`)
- Named exports only — no default exports
- PascalCase: components, types. camelCase: functions, hooks, variables
- Import order: react → react-native → expo → third-party → internal → types
- Max 250 lines per component file
- Use `StyleSheet.create()` — never inline styles
- Colocate tests: `__tests__/ComponentName.test.tsx`

### Performance Requirements
- Use `React.memo`, `useMemo`, `useCallback` for expensive computations
- Prefer `FlashList` over `FlatList` for lists with 100+ items
- No anonymous functions in render-path JSX props
- Images: WebP format, explicit dimensions, caching enabled
- JS bundle target: under 1.5MB
- Animations: use `react-native-reanimated` on UI thread

### Testing Standards
- Jest + React Native Testing Library for unit/component tests
- Detox for E2E tests on critical user flows
- Test user-visible behavior, not implementation
- Every new component or hook requires a test file
- Mock native modules in `__mocks__/` directory

### Security Practices
- Environment variables for all secrets (never hardcode)
- Validate and sanitize deep link parameters
- SSL certificate pinning for sensitive endpoints
- Use secure storage for tokens (expo-secure-store, react-native-keychain, etc.)
- Enable ProGuard/R8 for Android release builds

### Git Workflow
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Branch naming: `feat/<name>`, `fix/<name>`, `refactor/<name>`
- One logical change per commit
- Require PR review before merging to main

### Expo-Specific
- Prefer Expo SDK modules over community alternatives
- Use `app.config.ts` for dynamic configuration
- EAS Build for CI/CD, EAS Update for OTA
- Config plugins for native customization (avoid manual ios/android edits)

### State Management Architecture
- **Zustand**: UI state, user preferences, navigation state
- **TanStack Query**: API data, caching, background refetching
- Never mix: Zustand should not cache server data, TanStack Query should not hold UI state

### Navigation Patterns
- File-based routing with Expo Router
- Typed routes with `expo-router/typed-routes`
- Deep linking: validate all parameters before navigation
- Use `_layout.tsx` for shared UI (headers, tabs)
- Modal routes: `presentation: 'modal'` in layout config
