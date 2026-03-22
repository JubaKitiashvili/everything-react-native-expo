---
description: Development environment and workflow conventions
globs: ""
alwaysApply: true
---

# Development Workflow

## Development Client
- Use `expo-dev-client` instead of Expo Go for projects with native modules
- Expo Go is fine for pure JS/TS projects without custom native code
- Create development builds: `eas build --profile development`

## Build Profiles

| Profile | Use Case | Command |
|---------|----------|---------|
| development | Local testing with dev tools | `eas build --profile development` |
| preview | QA testing, stakeholder review | `eas build --profile preview` |
| production | App Store / Play Store release | `eas build --profile production` |

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
```

## Debugging
- Use React Native DevTools (built-in with Expo SDK 50+)
- Console.log for quick debugging (remove before commit)
- React DevTools for component inspection
- Flipper/React Native Debugger for network and performance
- `LogBox.ignoreLogs()` only for known harmless warnings

## CI/CD
- EAS Build for cloud builds
- EAS Submit for store submissions
- EAS Update for OTA updates (non-native changes)
- GitHub Actions for lint/test/typecheck on PRs
