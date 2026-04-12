package expo.modules.ernemonitor

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
                // Task 41: ANR watchdog. Wire the emit callback so the
                // detector can fire `onANRDetected` events through the
                // Expo Modules API event emitter.
                ANRDetector.onANR = { durationMs, stack ->
                    sendEvent(
                        "onANRDetected",
                        mapOf(
                            "durationMs" to durationMs,
                            "mainThreadStack" to stack,
                            "screen" to null,
                            "timestamp" to System.currentTimeMillis(),
                        ),
                    )
                }
                ANRDetector.start(ctx)

                // Task 42: thermal listener.
                ThermalObserver.onChange = { state ->
                    sendEvent(
                        "onThermalStateChange",
                        mapOf(
                            "state" to state,
                            "timestamp" to System.currentTimeMillis(),
                        ),
                    )
                }
                ThermalObserver.install(ctx)

                // Task 43: span persistence — install the file path
                // before the first JS span call lands.
                SpanLog.install(ctx)
            }
        }

        Function("stopNativeMonitoring") {
            isActive = false
            CrashHandler.uninstall()
            ANRDetector.stop()
            ANRDetector.onANR = null
            ThermalObserver.uninstall()
            SpanLog.uninstall()
        }

        Function("getNativeMetrics") {
            NativeMetrics.currentSnapshot(appContext.reactContext)
        }

        // Drain crash reports persisted by the previous run.
        AsyncFunction("drainPersistedCrashes") {
            CrashHandler.drainPersistedCrashes()
        }

        // Delete a persisted crash by id once JS has dispatched it.
        Function("acknowledgePersistedCrash") { id: String ->
            CrashHandler.acknowledge(id)
        }

        // Task 43: span persistence functions.
        Function("startSpan") { id: String, name: String, kind: String,
                                parentId: String?, startedAtMs: Double ->
            SpanLog.startSpan(id, name, kind, parentId, startedAtMs.toLong())
        }

        Function("endSpan") { id: String, endedAtMs: Double ->
            SpanLog.endSpan(id, endedAtMs.toLong())
        }

        Function("updateSpan") { id: String, attribute: String, value: String ->
            SpanLog.updateSpan(id, attribute, value)
        }

        AsyncFunction("drainInterruptedSpans") {
            SpanLog.drainInterrupted()
        }
    }

}
