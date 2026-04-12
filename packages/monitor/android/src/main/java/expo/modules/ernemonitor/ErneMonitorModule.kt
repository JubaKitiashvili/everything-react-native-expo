package expo.modules.ernemonitor

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.PowerManager
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Task 38 — Expo Module API shell for @erne/monitor on Android.
 *
 * Mirrors the iOS ErneMonitorModule surface. Real implementations land in:
 *   - Task 40 CrashHandler   (JNI signal handler + NativeCrashHandler)
 *   - Task 41 ANRDetector    (Looper watchdog + MessageQueue probe)
 *   - Task 42 NativeMetrics  (/proc/self/stat, ActivityManager.MemoryInfo,
 *                             PowerManager.thermalStatus, BatteryManager)
 *   - Task 43 SpanSnapshot   (MappedByteBuffer-backed span log)
 *
 * For the shell we only wire the JS-facing method/event surface so
 * autolinking can pick the module up and the JS wrapper
 * (`ErneMonitorNative`) can exercise the full round trip.
 */
class ErneMonitorModule : Module() {
    @Volatile
    private var isActive: Boolean = false

    override fun definition() = ModuleDefinition {
        Name("ErneMonitor")

        Events("onNativeCrash", "onANRDetected", "onThermalStateChange")

        Function("startNativeMonitoring") {
            isActive = true
            // Task 40: install POSIX (JNI) + JVM uncaught chains.
            val ctx = appContext.reactContext
            if (ctx != null) {
                CrashHandler.install(ctx)
            }
        }

        Function("stopNativeMonitoring") {
            isActive = false
            CrashHandler.uninstall()
        }

        Function("getNativeMetrics") {
            sampleMetrics()
        }

        // Drain crash reports persisted by the previous run.
        AsyncFunction("drainPersistedCrashes") {
            CrashHandler.drainPersistedCrashes()
        }

        // Delete a persisted crash by id once JS has dispatched it.
        Function("acknowledgePersistedCrash") { id: String ->
            CrashHandler.acknowledge(id)
        }
    }

    private fun sampleMetrics(): Map<String, Any?> {
        // `appContext` is inherited from expo.modules.kotlin.modules.Module.
        // `.reactContext` returns the host app's ReactContext, which is a
        // Context subclass suitable for getSystemService calls.
        val ctx: Context? = appContext.reactContext
        val memoryTotal: Long? = try {
            val am = ctx?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            if (am != null) {
                val info = ActivityManager.MemoryInfo()
                am.getMemoryInfo(info)
                info.totalMem
            } else {
                null
            }
        } catch (_: Throwable) {
            null
        }

        val memoryAvailable: Long? = try {
            val am = ctx?.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            if (am != null) {
                val info = ActivityManager.MemoryInfo()
                am.getMemoryInfo(info)
                info.availMem
            } else {
                null
            }
        } catch (_: Throwable) {
            null
        }

        val thermal: String = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try {
                val pm = ctx?.getSystemService(Context.POWER_SERVICE) as? PowerManager
                when (pm?.currentThermalStatus) {
                    PowerManager.THERMAL_STATUS_NONE -> "nominal"
                    PowerManager.THERMAL_STATUS_LIGHT -> "fair"
                    PowerManager.THERMAL_STATUS_MODERATE -> "fair"
                    PowerManager.THERMAL_STATUS_SEVERE -> "serious"
                    PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
                    PowerManager.THERMAL_STATUS_EMERGENCY -> "critical"
                    PowerManager.THERMAL_STATUS_SHUTDOWN -> "critical"
                    else -> "unknown"
                }
            } catch (_: Throwable) {
                "unknown"
            }
        } else {
            "unknown"
        }

        return mapOf(
            "cpuUsagePercent" to null,
            "memoryUsedBytes" to null,
            "memoryAvailableBytes" to memoryAvailable,
            "memoryTotalBytes" to memoryTotal,
            "thermalState" to thermal,
            "batteryLevel" to null,
            "batteryCharging" to null,
            "diskAvailableBytes" to null,
            "diskTotalBytes" to null,
            "sampledAt" to System.currentTimeMillis(),
        )
    }
}
