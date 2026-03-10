---
description: Bare React Native project coding conventions
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Bare React Native Coding Style

## Native Project Management
- Maintain `ios/` and `android/` directories in version control
- Keep `Podfile` and `build.gradle` clean and well-documented
- Pin native dependency versions explicitly
- Run `pod install` after adding any iOS dependency

## Podfile Conventions
```ruby
# ios/Podfile
platform :ios, '15.0'
use_frameworks! :linkage => :static

target 'MyApp' do
  config = use_native_modules!
  use_react_native!(
    :path => config[:reactNativePath],
    :hermes_enabled => true,
  )
end

post_install do |installer|
  react_native_post_install(installer)
end
```

## Gradle Conventions
- Use Kotlin DSL (`build.gradle.kts`) for new projects
- Keep `minSdkVersion` aligned across all modules
- Configure ProGuard/R8 rules for release builds
- Use version catalogs for dependency management

## Autolinking
- Rely on React Native autolinking (don't manually link libraries)
- For custom native modules, register in `react-native.config.js`
- Run `npx react-native-config` to verify linking

```js
// react-native.config.js
module.exports = {
  dependencies: {
    'my-native-module': {
      platforms: {
        android: { sourceDir: './android/my-module' },
        ios: { podspecPath: './ios/MyModule.podspec' },
      },
    },
  },
};
```

## Platform-Specific Code
- Use `.ios.tsx` / `.android.tsx` suffixes for platform files
- Use `Platform.select()` for inline platform differences
- Prefer shared code with platform-specific adapters
