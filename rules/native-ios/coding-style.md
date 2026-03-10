---
description: Swift and Objective-C coding conventions for React Native native modules
globs: "**/*.{swift,m,mm,h}"
alwaysApply: false
---

# iOS Native Coding Style

## Swift Conventions
- Swift 5.9+ with strict concurrency checking
- Use `struct` over `class` when no inheritance is needed
- Protocol-oriented design over class hierarchies
- Use `async/await` over completion handlers
- Mark `@Sendable` for closures crossing concurrency domains

```swift
// GOOD — Protocol-oriented, async/await
protocol DataProvider: Sendable {
    func fetchData() async throws -> [Item]
}

struct APIDataProvider: DataProvider {
    func fetchData() async throws -> [Item] {
        let (data, _) = try await URLSession.shared.data(from: url)
        return try JSONDecoder().decode([Item].self, from: data)
    }
}

// BAD — Class hierarchy, callback-based
class BaseDataProvider {
    func fetchData(completion: @escaping ([Item]?, Error?) -> Void) { ... }
}
```

## @objc Exposure
- Annotate classes and methods with `@objc` for React Native bridge
- Use `@objcMembers` sparingly (only on classes fully exposed to RN)
- Prefer explicit `@objc` on individual methods

## SwiftUI Integration (expo-ui)
- Use `ExpoView` base class for Expo Module views
- Wrap SwiftUI views with `UIHostingController` for bridge exposure
- Keep SwiftUI views small and composable

```swift
// Expo Module with SwiftUI view
import ExpoModulesCore
import SwiftUI

class MyWidgetModule: Module {
    func definition() -> ModuleDefinition {
        Name("MyWidget")
        View(MyWidgetView.self) {
            Prop("title") { (view, title: String) in
                view.title = title
            }
        }
    }
}

class MyWidgetView: ExpoView {
    var title: String = "" {
        didSet { updateHostingController() }
    }
}
```

## Naming
- Types: `PascalCase` (`UserManager`, `AuthService`)
- Methods/properties: `camelCase` (`fetchUser()`, `isAuthenticated`)
- Constants: `camelCase` (Swift convention, NOT `SCREAMING_CASE`)
- Protocols: descriptive nouns or `-able` suffix (`Authenticatable`, `DataSource`)
