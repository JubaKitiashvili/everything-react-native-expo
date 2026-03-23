---
description: Development environment and workflow conventions (Expo SDK 54+, RN 0.84+)
globs: ''
alwaysApply: true
---

# Development Workflow

## Minimum Requirements (as of RN 0.84 / Expo SDK 54)

| Requirement       | Minimum                                        |
| ----------------- | ---------------------------------------------- |
| Node.js           | **22.11+**                                     |
| Xcode             | **16.1+**                                      |
| Android targetSdk | 36 (Android 16)                                |
| Kotlin            | 2.1.20                                         |
| Gradle            | 9.0.0                                          |
| TypeScript        | ~5.9                                           |
| Architecture      | **New Architecture only** (Legacy removed)     |
| JS Engine         | **Hermes V1** (default, JSC removed from core) |

## Development Client

- Use `expo-dev-client` instead of Expo Go for projects with native modules
- Expo Go is fine for pure JS/TS projects without custom native code
- Create development builds: `eas build --profile development`

## Build Profiles

| Profile     | Use Case                       | Command                           |
| ----------- | ------------------------------ | --------------------------------- |
| development | Local testing with dev tools   | `eas build --profile development` |
| preview     | QA testing, stakeholder review | `eas build --profile preview`     |
| production  | App Store / Play Store release | `eas build --profile production`  |

- **Precompiled XCFrameworks** (SDK 54+): iOS clean builds ~10x faster
- **Build caching** (`buildCacheProvider`): stable with GitHub/EAS integrations

## Environment Management

- `.env.development`, `.env.preview`, `.env.production`
- Use `expo-constants` to access env vars at runtime
- Never commit `.env` files (add to `.gitignore`)
- Use EAS Secrets for CI/CD environment variables

## Local Development

```bash
# Start Metro bundler
npx expo start

# Run on specific platform
npx expo run:ios
npx expo run:android

# Clear cache when things break
npx expo start --clear

# Regenerate native projects
npx expo prebuild --clean

# Create new project (react-native init is REMOVED since RN 0.77)
npx create-expo-app my-app
# or: npx @react-native-community/cli init MyApp
```

## Debugging

- **React Native DevTools** desktop app (RN 0.82+) — zero-install, no browser needed
- Network inspection panel with initiator tracking (RN 0.83+)
- Performance tracing panel with timeline view (RN 0.83+)
- Console.log for quick debugging (remove before commit)
- ~~Flipper~~ / ~~React Native Debugger~~ — **removed**, use RN DevTools instead
- ~~Remote JS Debugging~~ — **removed since RN 0.79**, use RN DevTools
- ~~`XHRInterceptor`~~ / ~~`WebSocketInterceptor`~~ — **deprecated (RN 0.84)**, use CDP Network domain in DevTools
- Console.log streaming was removed in RN 0.77, restored as opt-in `--client-logs` flag in RN 0.78
- `LogBox.ignoreLogs()` only for known harmless warnings

## Android Edge-to-Edge

- **Mandatory on Android 16** (API 36) — no opt-out
- Built-in `<SafeAreaView>` is **deprecated** — use `react-native-safe-area-context`
- Android predictive back gesture enabled by default

### SafeAreaView Migration

```bash
npx expo install react-native-safe-area-context
```

```tsx
// ❌ OLD — deprecated built-in SafeAreaView
import { SafeAreaView } from 'react-native';

<SafeAreaView style={{ flex: 1 }}>
  <App />
</SafeAreaView>

// ✅ NEW — react-native-safe-area-context
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

// Wrap app root with provider
<SafeAreaProvider>
  <App />
</SafeAreaProvider>

// Option 1: SafeAreaView component
<SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
  <Content />
</SafeAreaView>

// Option 2: useSafeAreaInsets hook (more control)
function Header() {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: insets.top, paddingLeft: insets.left, paddingRight: insets.right }}>
      <Text>Header</Text>
    </View>
  );
}
```

## React Native DevTools Setup

~~Flipper~~ and ~~React Native Debugger~~ are removed. Use **React Native DevTools**:

```bash
# Automatic — opens when you press 'j' in Metro terminal
npx expo start
# Then press 'j' to open DevTools

# Or launch standalone desktop app (RN 0.82+)
# No install needed — Metro auto-launches it
```

**Available panels:**

- **Console** — console.log output (opt-in via `--client-logs` flag if not showing)
- **Components** — React component tree inspector
- **Network** — HTTP/WebSocket requests with initiator tracking (RN 0.83+)
- **Performance** — timeline tracing, flame charts (RN 0.83+)
- **Sources** — breakpoints, step debugging

## CI/CD

- EAS Build for cloud builds
- EAS Submit for store submissions
- EAS Update for OTA updates (non-native changes) — `downloadProgress` in `useUpdates()` for custom UI
- GitHub Actions for lint/test/typecheck on PRs
- ESLint v9 Flat Config supported (RN 0.84+)
