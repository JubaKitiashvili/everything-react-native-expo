---
description: Android native testing patterns for React Native modules
globs: "**/*.{kt,java}"
alwaysApply: false
---

# Android Native Testing

## JUnit 5 for Native Modules
- Test module logic independent of React Native bridge
- Use MockK for Kotlin mocking
- Test coroutine-based code with `runTest`

```kotlin
import io.mockk.*
import kotlinx.coroutines.test.runTest
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.Assertions.*

class AuthModuleTest {
    private val repository = mockk<AuthRepository>()
    private val module = AuthModule(repository)

    @Test
    fun `validateToken returns user for valid token`() = runTest {
        val expectedUser = User("id-1", "Test User")
        coEvery { repository.validate("valid-token") } returns expectedUser

        val result = module.validateToken("valid-token")
        assertEquals(expectedUser, result)
    }

    @Test
    fun `validateToken throws for expired token`() = runTest {
        coEvery { repository.validate("expired") } throws TokenExpiredException()

        assertThrows(TokenExpiredException::class.java) {
            runBlocking { module.validateToken("expired") }
        }
    }
}
```

## Espresso for UI Testing
- Test native views and Compose components
- Use `ActivityScenarioRule` for activity lifecycle
- Combine with Detox for cross-platform E2E

```kotlin
import androidx.test.espresso.Espresso.onView
import androidx.test.espresso.assertion.ViewAssertions.matches
import androidx.test.espresso.matcher.ViewMatchers.*

@RunWith(AndroidJUnit4::class)
class ChartViewTest {
    @get:Rule
    val activityRule = ActivityScenarioRule(MainActivity::class.java)

    @Test
    fun chartDisplaysDataPoints() {
        onView(withContentDescription("chart-view"))
            .check(matches(isDisplayed()))
    }
}
```

## Compose Testing
- Use `createComposeRule` for Compose component tests
- Test UI state and interactions
- Use semantic matchers for assertions

```kotlin
import androidx.compose.ui.test.*
import androidx.compose.ui.test.junit4.createComposeRule

class NativeChartTest {
    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun chartRendersWithData() {
        composeTestRule.setContent {
            NativeChart(data = listOf(1.0, 2.0, 3.0))
        }
        composeTestRule.onNodeWithContentDescription("chart")
            .assertIsDisplayed()
    }
}
```

## Instrumentation Tests
- Run on real device or emulator for accurate results
- Test native module integration with React Native bridge
- Verify ProGuard doesn't break native module reflection
