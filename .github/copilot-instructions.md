# ERNE — React Native & Expo Development Guidelines

## Stack
- TypeScript (strict mode), React Native, Expo
- Expo Router for file-based navigation
- Zustand (client state) + TanStack Query (server state)
- Jest + React Native Testing Library + Detox

## Code Conventions
- Functional components only: `const Component = () => {}`
- Named exports only — no default exports
- PascalCase for components and types, camelCase for functions and hooks
- Import order: react → react-native → expo → third-party → internal → types
- Maximum 250 lines per component file
- Always use `StyleSheet.create()` — never inline styles

## Performance
- Use `React.memo`, `useMemo`, `useCallback` for expensive computations
- Prefer `FlashList` over `FlatList` for lists with 100+ items
- Avoid anonymous functions in render-path JSX props
- Use WebP images with explicit dimensions and caching
- Use `react-native-reanimated` for animations (runs on UI thread)
- Keep JS bundle under 1.5MB

## Testing
- Every new component or hook requires a test file
- Test user-visible behavior, not implementation details
- Mock native modules in `__mocks__/` directory
- Use Detox for E2E tests on critical user flows

## Security
- Never hardcode secrets — use environment variables
- Validate and sanitize all deep link parameters
- Use SSL certificate pinning for sensitive API endpoints
- Store tokens with `expo-secure-store`, never AsyncStorage

## State Management
- Zustand for UI state, user preferences, navigation state
- TanStack Query for API data, caching, background refetching
- Keep separation: Zustand should not cache server data

## Expo-Specific
- Prefer Expo SDK modules over community alternatives
- Use `app.config.ts` for dynamic configuration
- Use config plugins for native customization (avoid manual ios/android edits)
- EAS Build for CI/CD, EAS Update for OTA deployments

## Navigation
- File-based routing with Expo Router
- Use typed routes via `expo-router/typed-routes`
- Use `_layout.tsx` for shared UI elements
- Validate deep link parameters before navigation

## Git
- Conventional Commits: `feat:`, `fix:`, `refactor:`, `test:`, `docs:`, `chore:`
- Branch naming: `feat/<name>`, `fix/<name>`, `refactor/<name>`
- One logical change per commit
