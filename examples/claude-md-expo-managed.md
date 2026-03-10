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
