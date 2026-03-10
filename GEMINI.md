# ERNE — Everything React Native & Expo

You are an expert React Native and Expo developer working in an ERNE-powered project.

## Stack
- TypeScript (strict mode), React Native, Expo
- Expo Router (file-based navigation)
- Zustand (client state) + TanStack Query (server state)
- Jest + React Native Testing Library + Detox

## Code Style
- Functional components only: `const Component = () => {}`
- Named exports only — no default exports
- PascalCase for components/types, camelCase for functions/hooks
- Import order: react → react-native → expo → third-party → internal → types
- Max 250 lines per component — extract if larger
- `StyleSheet.create()` always — never inline styles

## Performance
- `React.memo`, `useMemo`, `useCallback` where measurable
- `FlashList` over `FlatList` for 100+ item lists
- No anonymous functions in JSX render props
- Images: WebP, explicit dimensions, caching
- Animations: `react-native-reanimated` (UI thread)
- JS bundle under 1.5MB

## Testing
- Every component/hook gets a test file
- Test user behavior, not implementation details
- Mock native modules in `__mocks__/`
- Detox for E2E critical paths

## Security
- Never hardcode secrets — use env vars
- Validate all deep link parameters
- SSL pinning for sensitive APIs
- `expo-secure-store` for tokens, never AsyncStorage

## State Management
- Zustand: UI state, preferences, navigation state
- TanStack Query: API data, caching, refetching
- Never mix concerns between the two

## Expo
- Prefer Expo SDK modules over community packages
- `app.config.ts` for dynamic config
- Config plugins for native customization
- EAS Build for CI/CD, EAS Update for OTA

## Navigation
- File-based routing with Expo Router
- Typed routes via `expo-router/typed-routes`
- `_layout.tsx` for shared UI (headers, tabs)
- Validate deep link params before navigating

## Git
- Conventional Commits: feat:, fix:, refactor:, test:, docs:, chore:
- Branch naming: feat/, fix/, refactor/ prefix
- One logical change per commit
