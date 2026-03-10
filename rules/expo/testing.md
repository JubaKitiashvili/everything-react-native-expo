---
description: Testing patterns specific to Expo managed workflow
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Expo Testing

## Detox with EAS Build
- Build Detox-compatible binaries using EAS Build
- Configure `eas.json` with a dedicated Detox build profile
- Run Detox tests against EAS-built artifacts

```json
// eas.json
{
  "build": {
    "detox-ios": {
      "ios": {
        "simulator": true,
        "image": "latest"
      },
      "env": { "DETOX_CONFIGURATION": "ios.sim.release" }
    },
    "detox-android": {
      "android": {
        "buildType": "apk",
        "image": "latest"
      }
    }
  }
}
```

## expo-dev-client Testing
- Test native modules with `expo-dev-client` builds (not Expo Go)
- Create development builds for each PR that adds native modules
- Mock native modules in unit tests, use real modules in E2E tests

## Expo-Specific Mocking

```tsx
// Mock expo modules in Jest
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: { apiUrl: 'http://test.example.com' },
    },
  },
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useSegments: () => [],
  Link: ({ children }: any) => children,
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));
```

## Testing OTA Updates
- Test update flow on preview channel before production
- Verify update applies correctly with `expo-updates` API
- Test rollback scenarios (corrupted update, network failure)
- Include update verification in E2E test suite
