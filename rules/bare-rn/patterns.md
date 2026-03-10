---
description: Bare React Native architectural patterns
globs: "**/*.{ts,tsx}"
alwaysApply: false
---

# Bare React Native Patterns

## Native Module Registration
- Register custom modules in `MainApplication.kt` (Android) and `AppDelegate.swift` (iOS)
- Use `@ReactModule` annotation for Android Turbo Modules
- Implement `RCTBridgeModule` protocol for iOS (legacy) or use new architecture

## Turbo Module Boilerplate

```ts
// specs/NativeMyModule.ts — Codegen spec
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  getData(key: string): Promise<string>;
  setData(key: string, value: string): Promise<void>;
}

export default TurboModuleRegistry.getEnforcing<Spec>('MyModule');
```

## Fabric Component Patterns
- Define component specs in `specs/` directory
- Use codegen for type-safe native component interfaces
- Implement `ViewManager` (Android) and `RCTViewManager` (iOS)

## Build Configuration
- Use Gradle flavors for multi-environment builds (Android)
- Use Xcode schemes + configurations for multi-environment (iOS)
- Configure build variants in `android/app/build.gradle`

```groovy
// android/app/build.gradle
android {
    flavorDimensions "environment"
    productFlavors {
        development { applicationIdSuffix ".dev" }
        staging { applicationIdSuffix ".staging" }
        production { /* default */ }
    }
}
```

## Metro Configuration
- Customize `metro.config.js` for monorepo setups
- Configure asset resolution for custom file types
- Set up module aliases for clean imports
