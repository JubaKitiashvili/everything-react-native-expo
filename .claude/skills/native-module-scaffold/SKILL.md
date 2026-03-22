---
name: native-module-scaffold
description: Guided wizard for creating Turbo Modules and Expo Modules with iOS and Android implementations
---

# Native Module Scaffold

You are creating a native module for React Native. This skill guides you through the entire process from TypeScript API design to native implementations.

## When to Use This Skill

Invoke when:
- Need to access native platform APIs not available in React Native
- Building a bridge between JavaScript and Swift/Kotlin
- Creating a custom UI component with native rendering
- Integrating a native SDK

## Module Type Selection

### Option A: Expo Modules API (Recommended for Expo projects)

Simplest approach. Uses `expo-modules-core` for bridging:

```bash
npx create-expo-module my-module
```

**Generated structure:**
```
modules/my-module/
  expo-module.config.json
  src/MyModuleModule.ts          # TypeScript API
  ios/MyModuleModule.swift        # Swift implementation
  android/src/.../MyModuleModule.kt  # Kotlin implementation
  src/__tests__/MyModule.test.ts
```

### Option B: Turbo Modules (For bare RN / New Architecture)

Lower level, more control. Uses codegen from TypeScript spec:

**Step 1: Define TypeScript spec**
```tsx
// NativeMyModule.ts
import type { TurboModule } from 'react-native';
import { TurboModuleRegistry } from 'react-native';

export interface Spec extends TurboModule {
  multiply(a: number, b: number): Promise<number>;
  getDeviceInfo(): { model: string; os: string; version: string };
}

export default TurboModuleRegistry.getEnforcing<Spec>('MyModule');
```

**Step 2: Implement iOS (Swift)**
```swift
@objc(MyModule)
class MyModule: NSObject {
  @objc func multiply(_ a: Double, b: Double, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    resolve(a * b)
  }

  @objc func getDeviceInfo() -> [String: String] {
    return [
      "model": UIDevice.current.model,
      "os": UIDevice.current.systemName,
      "version": UIDevice.current.systemVersion
    ]
  }
}
```

**Step 3: Implement Android (Kotlin)**
```kotlin
class MyModuleModule(reactContext: ReactApplicationContext) :
  NativeMyModuleSpec(reactContext) {

  override fun multiply(a: Double, b: Double): Promise {
    return Promise.resolve(a * b)
  }

  override fun getDeviceInfo(): WritableMap {
    return Arguments.createMap().apply {
      putString("model", Build.MODEL)
      putString("os", "Android")
      putString("version", Build.VERSION.RELEASE)
    }
  }
}
```

### Option C: Fabric Components (For custom native views)

For custom UI components rendered natively:

```tsx
// NativeMyView.ts
import type { ViewProps } from 'react-native';
import codegenNativeComponent from 'react-native/Libraries/Utilities/codegenNativeComponent';

interface NativeProps extends ViewProps {
  color?: string;
  radius?: number;
}

export default codegenNativeComponent<NativeProps>('MyView');
```

## Post-Scaffold Checklist

- [ ] TypeScript types match native implementations
- [ ] Error handling uses reject/Promise.reject with error codes
- [ ] Threading: heavy work on background thread, UI on main
- [ ] Memory: cleanup listeners and subscriptions
- [ ] Platform parity: same API surface iOS and Android
- [ ] Tests cover the TypeScript API
- [ ] README documents usage
