---
description: Expo-specific architectural patterns and SDK usage
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Expo Patterns

## App Configuration
- Use `app.config.ts` (dynamic) over `app.json` (static) for flexibility
- Split config by environment using `process.env.APP_ENV`
- Keep secrets out of config — use EAS Secrets for build-time injection

```ts
// app.config.ts
const IS_DEV = process.env.APP_ENV === 'development';

export default {
  name: IS_DEV ? 'MyApp (Dev)' : 'MyApp',
  slug: 'myapp',
  scheme: 'myapp',
  ios: {
    bundleIdentifier: IS_DEV ? 'com.myapp.dev' : 'com.myapp',
  },
  android: {
    package: IS_DEV ? 'com.myapp.dev' : 'com.myapp',
  },
};
```

## EAS Update (OTA)
- Use EAS Update for JS-only changes (no native code changes)
- Channel-based deployment: development, preview, production
- Always test updates on preview channel before production
- Set `runtimeVersion` policy to `"appVersion"` or custom policy

```bash
# Publish update to preview channel
eas update --channel preview --message "Fix login button"

# Publish to production
eas update --channel production --message "v1.2.1 hotfix"
```

## Config Plugin Authoring
- Create custom plugins in `plugins/` directory at project root
- Use `withInfoPlist`, `withAndroidManifest` for platform-specific changes
- Test plugins with `npx expo prebuild --clean`

```ts
// plugins/with-custom-scheme.ts
import { ConfigPlugin, withInfoPlist } from 'expo/config-plugins';

const withCustomScheme: ConfigPlugin<{ scheme: string }> = (config, { scheme }) => {
  return withInfoPlist(config, (mod) => {
    mod.modResults.CFBundleURLTypes = [
      ...(mod.modResults.CFBundleURLTypes || []),
      { CFBundleURLSchemes: [scheme] },
    ];
    return mod;
  });
};

export default withCustomScheme;
```

## Expo Modules API
- Prefer Expo Modules API over bare Turbo Modules for Expo projects
- Define modules in `modules/` directory with Swift + Kotlin
- Use `expo-module.config.json` for module configuration
- See `native-bridge-builder` agent for full scaffolding
