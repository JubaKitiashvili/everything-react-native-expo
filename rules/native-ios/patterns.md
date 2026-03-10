---
description: iOS native module implementation patterns for React Native
globs: "**/*.{swift,m,mm,h}"
alwaysApply: false
---

# iOS Native Patterns

## Turbo Module Swift Implementation
- Implement `TurboModule` spec in Swift
- Bridge Swift to Objective-C with `@objc` annotations
- Use `RCTConvert` for type conversion from JS

```swift
// NativeMyModuleSpec — Auto-generated from codegen
@objc(MyModule)
class MyModule: NSObject, NativeMyModuleSpec {
    @objc static func moduleName() -> String { "MyModule" }

    @objc func getData(_ key: String, resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
        Task {
            do {
                let result = try await fetchData(key)
                resolve(result)
            } catch {
                reject("ERR_DATA", error.localizedDescription, error)
            }
        }
    }
}
```

## ExpoModulesCore View Patterns
- Extend `ExpoView` for custom native views
- Use `Prop` for reactive property binding from JS
- Use `Events` for sending data back to JS

```swift
import ExpoModulesCore

class ChartView: ExpoView {
    let onDataPointSelected = EventDispatcher()

    var dataPoints: [Double] = [] {
        didSet { redraw() }
    }

    private func handleTap(at index: Int) {
        onDataPointSelected([
            "index": index,
            "value": dataPoints[index],
        ])
    }
}
```

## Bridging Headers
- Keep bridging header minimal
- Only import headers needed for RN bridge
- Use module maps for cleaner imports when possible

```objc
// MyApp-Bridging-Header.h
#import <React/RCTBridgeModule.h>
#import <React/RCTViewManager.h>
#import <React/RCTEventEmitter.h>
```

## Threading
- Heavy computations on background queue, UI updates on main queue
- Use `DispatchQueue.main.async` for UI updates from native callbacks
- Never block the main thread with synchronous operations
