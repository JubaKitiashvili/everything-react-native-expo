---
description: Kotlin and Java coding conventions for React Native native modules
globs: "**/*.{kt,java}"
alwaysApply: false
---

# Android Native Coding Style

## Kotlin-First
- Kotlin is the primary language for all new native code
- Java only for legacy code maintenance
- Use Kotlin idioms (data classes, sealed classes, extension functions)

```kotlin
// GOOD — Kotlin idioms
data class UserData(val id: String, val name: String, val email: String)

sealed class Result<out T> {
    data class Success<T>(val data: T) : Result<T>()
    data class Error(val exception: Throwable) : Result<Nothing>()
}

fun String.toUserData(): UserData = Json.decodeFromString(this)

// BAD — Java patterns in Kotlin
class UserData {
    private var id: String? = null
    private var name: String? = null
    fun getId(): String? = id
    fun setId(id: String?) { this.id = id }
}
```

## Coroutines Over Callbacks
- Use `suspend` functions for async operations
- Use `withContext(Dispatchers.IO)` for blocking operations
- Never block the main thread
- Use `Flow` for reactive data streams

```kotlin
// GOOD — Coroutines
suspend fun fetchUser(id: String): User = withContext(Dispatchers.IO) {
    api.getUser(id)
}

// BAD — Callback hell
fun fetchUser(id: String, callback: (User?, Error?) -> Unit) {
    thread {
        try {
            val user = api.getUser(id)
            Handler(Looper.getMainLooper()).post { callback(user, null) }
        } catch (e: Exception) {
            Handler(Looper.getMainLooper()).post { callback(null, e) }
        }
    }
}
```

## Jetpack Compose Integration (expo-ui)
- Use Compose for custom native views exposed to React Native
- Keep Compose components stateless when possible
- Use `@Preview` for visual development

```kotlin
@Composable
fun NativeChart(
    data: List<Double>,
    modifier: Modifier = Modifier,
    onPointSelected: (Int) -> Unit = {},
) {
    Canvas(modifier = modifier.fillMaxSize()) {
        // Draw chart
    }
}
```

## Naming
- Classes: `PascalCase` (`UserRepository`, `AuthModule`)
- Functions/properties: `camelCase` (`getUser()`, `isLoggedIn`)
- Constants: `SCREAMING_SNAKE_CASE` (`MAX_RETRY_COUNT`)
- Packages: `lowercase` (`com.myapp.modules`)
