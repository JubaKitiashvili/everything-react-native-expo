---
description: Testing patterns for bare React Native projects
globs: "**/*.test.{ts,tsx}"
alwaysApply: false
---

# Bare React Native Testing

## Native Unit Tests
Run native tests alongside JS tests for full coverage:

### iOS (XCTest)
```swift
// ios/MyAppTests/MyModuleTests.swift
import XCTest
@testable import MyApp

class MyModuleTests: XCTestCase {
    func testDataProcessing() {
        let module = MyModule()
        let result = module.processData("input")
        XCTAssertEqual(result, "expected_output")
    }
}
```

### Android (JUnit)
```kotlin
// android/app/src/test/java/com/myapp/MyModuleTest.kt
import org.junit.Test
import org.junit.Assert.*

class MyModuleTest {
    @Test
    fun testDataProcessing() {
        val module = MyModule()
        val result = module.processData("input")
        assertEquals("expected_output", result)
    }
}
```

## E2E with Detox (Bare Setup)
- Configure Detox directly in project (no EAS Build needed)
- Build test binaries locally: `detox build --configuration ios.sim.debug`
- Run: `detox test --configuration ios.sim.debug`

```js
// .detoxrc.js
module.exports = {
  testRunner: { args: { config: 'e2e/jest.config.js' } },
  apps: {
    'ios.debug': {
      type: 'ios.app',
      binaryPath: 'ios/build/Build/Products/Debug-iphonesimulator/MyApp.app',
      build: 'xcodebuild -workspace ios/MyApp.xcworkspace -scheme MyApp -configuration Debug -sdk iphonesimulator -derivedDataPath ios/build',
    },
    'android.debug': {
      type: 'android.apk',
      binaryPath: 'android/app/build/outputs/apk/debug/app-debug.apk',
      build: 'cd android && ./gradlew assembleDebug assembleAndroidTest -DtestBuildType=debug',
    },
  },
  devices: {
    simulator: { type: 'ios.simulator', device: { type: 'iPhone 16' } },
    emulator: { type: 'android.emulator', device: { avdName: 'Pixel_7' } },
  },
  configurations: {
    'ios.sim.debug': { device: 'simulator', app: 'ios.debug' },
    'android.emu.debug': { device: 'emulator', app: 'android.debug' },
  },
};
```

## Integration Testing
- Test native module bridges with integration tests
- Verify Turbo Module codegen output matches specs
- Test platform-specific behavior on both iOS and Android
