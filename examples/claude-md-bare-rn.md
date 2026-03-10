# Example: CLAUDE.md for Bare React Native Project

This is a complete example of what `erne init` generates for a bare React Native project.

```markdown
# Project: MyNativeApp

## Stack
- React Native 0.76 (bare workflow)
- TypeScript 5.5
- NativeWind v5 (Tailwind CSS v4)
- Expo Router v4 (via expo-modules in bare)
- Zustand (client state)
- TanStack Query (server state)

## Architecture
- Feature-based folder structure under `src/features/`
- Native modules in `modules/` directory
- iOS native code in `ios/`
- Android native code in `android/`
- Navigation via Expo Router in `app/` directory

## Conventions
- Functional components only
- NativeWind for JS styling, native styles in Swift/Kotlin
- Swift 5.9+ for iOS native code
- Kotlin for Android native code
- Expo Modules API for new native modules

## Native Development
- `cd ios && pod install` after adding native dependencies
- Xcode for iOS debugging and profiling
- Android Studio for Android debugging
- `npx react-native run-ios` for iOS builds
- `npx react-native run-android` for Android builds

## Testing
- Jest + RNTL for JS/component tests
- XCTest for iOS native tests
- JUnit 5 + MockK for Android native tests
- Detox for E2E testing

<!-- ERNE Configuration -->
<!-- Hook Profile: standard -->
<!-- Platform Layer: bare-rn -->
```
