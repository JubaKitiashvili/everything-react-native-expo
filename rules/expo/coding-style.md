---
description: Expo managed workflow coding conventions
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Expo Coding Style

## SDK Module Preference
- Always prefer Expo SDK modules over community alternatives
- `expo-image` over `react-native-fast-image`
- `expo-file-system` over `react-native-fs`
- `expo-camera` over `react-native-camera`
- `expo-notifications` over `react-native-push-notification`
- `expo-secure-store` over `react-native-keychain`

```tsx
// GOOD — Expo SDK module
import * as FileSystem from 'expo-file-system';
const content = await FileSystem.readAsStringAsync(uri);

// BAD — community alternative in Expo project
import RNFS from 'react-native-fs';
const content = await RNFS.readFile(path);
```

## Config Plugins Over Manual Native Edits
- NEVER modify `ios/` or `android/` directories directly in managed workflow
- Use config plugins for native configuration
- Run `npx expo prebuild --clean` to regenerate native projects
- Add native config in `app.config.ts` with plugins array

```ts
// app.config.ts
export default ({ config }) => ({
  ...config,
  plugins: [
    ['expo-camera', { cameraPermission: 'Allow camera for scanning' }],
    ['expo-location', { locationAlwaysAndWhenInUsePermission: 'Allow location' }],
    './plugins/custom-splash.js',
  ],
});
```

## Expo Router Conventions
- Use file-based routing exclusively (no manual route registration)
- Layout files (`_layout.tsx`) define navigation structure
- Use typed routes for navigation
- Group routes with parentheses for logical organization

## Module Resolution
- Use `expo-modules-core` for creating native modules
- Prefer `expo-constants` for accessing build-time configuration
- Use `expo-updates` API for checking/fetching OTA updates
