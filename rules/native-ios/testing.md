---
description: iOS native testing patterns for React Native modules
globs: "**/*.swift"
alwaysApply: false
---

# iOS Native Testing

## XCTest for Native Modules
- Test native module logic independent of React Native bridge
- Mock RN bridge callbacks in tests
- Test error handling and edge cases

```swift
import XCTest
@testable import MyApp

final class AuthModuleTests: XCTestCase {
    var sut: AuthModule!

    override func setUp() {
        super.setUp()
        sut = AuthModule()
    }

    func testValidTokenReturnsUser() async throws {
        let user = try await sut.validateToken("valid-token")
        XCTAssertNotNil(user)
        XCTAssertEqual(user.id, "expected-id")
    }

    func testExpiredTokenThrows() async {
        do {
            _ = try await sut.validateToken("expired-token")
            XCTFail("Expected error")
        } catch {
            XCTAssertEqual(error as? AuthError, .tokenExpired)
        }
    }
}
```

## XCUITest for UI Testing
- Test native UI components with XCUITest
- Use accessibility identifiers for element queries
- Test SwiftUI views rendered via expo-ui

```swift
import XCTest

final class MyWidgetUITests: XCTestCase {
    let app = XCUIApplication()

    override func setUp() {
        continueAfterFailure = false
        app.launch()
    }

    func testWidgetDisplaysTitle() {
        let title = app.staticTexts["widget-title"]
        XCTAssertTrue(title.waitForExistence(timeout: 5))
        XCTAssertEqual(title.label, "Expected Title")
    }
}
```

## Performance Testing
- Use `measure` block for performance benchmarks
- Set baselines for critical operations
- Test on real devices (not just simulator) for accurate metrics

```swift
func testDataProcessingPerformance() {
    let largeDataset = generateTestData(count: 10_000)
    measure {
        _ = sut.processData(largeDataset)
    }
}
```
