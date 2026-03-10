---
description: Android native module implementation patterns for React Native
globs: "**/*.{kt,java}"
alwaysApply: false
---

# Android Native Patterns

## Turbo Module Kotlin Implementation
- Implement codegen spec interface in Kotlin
- Use `@ReactModule` annotation for module registration
- Bridge Kotlin coroutines with React Native Promises

```kotlin
package com.myapp.modules

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import kotlinx.coroutines.*

@ReactModule(name = MyModule.NAME)
class MyModule(reactContext: ReactApplicationContext) :
    NativeMyModuleSpec(reactContext) {

    private val scope = CoroutineScope(Dispatchers.Main + SupervisorJob())

    override fun getName() = NAME

    override fun getData(key: String, promise: Promise) {
        scope.launch {
            try {
                val result = withContext(Dispatchers.IO) { repository.getData(key) }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("ERR_DATA", e.message, e)
            }
        }
    }

    companion object {
        const val NAME = "MyModule"
    }
}
```

## Fabric ViewManager
- Extend `SimpleViewManager<T>` for custom native views
- Use `@ReactProp` annotation for JS-settable properties
- Implement `createViewInstance` and property setters

```kotlin
class ChartViewManager : SimpleViewManager<ChartView>() {
    override fun getName() = "ChartView"

    override fun createViewInstance(context: ThemedReactContext) = ChartView(context)

    @ReactProp(name = "data")
    fun setData(view: ChartView, data: ReadableArray) {
        view.setDataPoints(data.toArrayList().map { (it as Double) })
    }

    @ReactProp(name = "color")
    fun setColor(view: ChartView, color: String) {
        view.setChartColor(Color.parseColor(color))
    }
}
```

## Gradle Plugin Conventions
- Use convention plugins in `buildSrc/` for shared config
- Configure build types consistently (debug, release, staging)
- Use version catalogs (`libs.versions.toml`) for dependency management

## Event Emission
- Use `RCTDeviceEventEmitter` to send events to JS
- Define event names as constants
- Clean up listeners in module `onCatalystInstanceDestroy`
