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

        Events("onNativeCrash", "onANRDetected", "onThermalStateChange", "onDualThreadFPS", "onFabricCommit", "onReplayFrame", "onShakeDetected")

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

                // Task 49: Hermes profiler storage directory.
                HermesProfilerBridge.install(ctx)

                // Task 43: span persistence — install the file path
                // before the first JS span call lands.
                SpanLog.install(ctx)

                // Task 45: dual-thread FPS monitor.
                DualThreadFPS.onReport = { uiFPS, jsFPS ->
                    sendEvent(
                        "onDualThreadFPS",
                        mapOf(
                            "uiFPS" to uiFPS,
                            "jsFPS" to jsFPS,
                            "timestamp" to System.currentTimeMillis(),
                        ),
                    )
                }
                DualThreadFPS.start()

                // Task 46: Fabric commit tracker.
                FabricCommitTracker.onReport = { commitCount, avg, max, yoga, thrashing ->
                    sendEvent(
                        "onFabricCommit",
                        mapOf(
                            "commitCount" to commitCount,
                            "avgCommitDuration" to avg,
                            "maxCommitDuration" to max,
                            "yogaLayoutTime" to yoga,
                            "isLayoutThrashing" to thrashing,
                            "timestamp" to System.currentTimeMillis(),
                        ),
                    )
                }
                // FrameMetrics needs the current Activity
                val activity = appContext.currentActivity
                FabricCommitTracker.start(activity)
            }
        }

        Function("stopNativeMonitoring") {
            isActive = false
            CrashHandler.uninstall()
            ANRDetector.stop()
            ANRDetector.onANR = null
            ThermalObserver.uninstall()
            SpanLog.uninstall()
            DualThreadFPS.stop()
            FabricCommitTracker.stop()
            ReplayCapture.stopCapture()
            ShakeDetector.stop()
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

        // ── Task 52: Shake Detection ──────────────────────────────────

        Function("startShakeDetection") {
            val ctx = appContext.reactContext ?: return@Function
            ShakeDetector.onShake = {
                sendEvent(
                    "onShakeDetected",
                    mapOf("timestamp" to System.currentTimeMillis()),
                )
            }
            ShakeDetector.start(ctx)
        }

        Function("stopShakeDetection") {
            ShakeDetector.stop()
        }

        // ── Task 49: Hermes CPU Profiler ──────────────────────────────

        Function("saveHermesProfile") { data: String, trigger: String ->
            HermesProfilerBridge.saveProfile(data, trigger)
        }

        Function("listHermesProfiles") {
            HermesProfilerBridge.listProfiles()
        }

        Function("deleteHermesProfile") { path: String ->
            HermesProfilerBridge.deleteProfile(path)
        }

        Function("getHermesProfilerMaxDurationMs") {
            HermesProfilerBridge.maxDurationMs
        }

        // ── Task 48: Layout Snapshot ──────────────────────────────────

        AsyncFunction("captureLayoutSnapshot") { maxDepth: Int ->
            LayoutSnapshot.capture(appContext.currentActivity, maxDepth, sanitizeText = true)
        }

        // ── Task 47: Replay Capture ───────────────────────────────────

        Function("startReplayCapture") { intervalMs: Int, maskRegions: List<Map<String, Any>> ->
            ReplayCapture.onFrame = { base64, touches, timestamp ->
                sendEvent(
                    "onReplayFrame",
                    mapOf(
                        "frameBase64" to base64,
                        "touchEvents" to touches,
                        "timestamp" to timestamp,
                    ),
                )
            }
            val activity = appContext.currentActivity
            ReplayCapture.startCapture(activity, intervalMs, maskRegions)
        }

        Function("stopReplayCapture") {
            ReplayCapture.stopCapture()
        }

        Function("updateReplayMaskRegions") { regions: List<Map<String, Any>> ->
            ReplayCapture.updateMaskRegions(regions)
        }

        Function("recordReplayTouch") { x: Double, y: Double, phase: String ->
            ReplayCapture.recordTouch(x, y, phase)
        }

        // ── Diagnostics (dev-only) ──────────────────────────────────
        // Standard SDK integration-test surface. BuildConfig.DEBUG
        // gates the methods so they compile into release builds but
        // throw if somehow invoked — matching iOS #if DEBUG behavior.

        Function("triggerTestCrash") {
            if (!isDebugBuild()) {
                throw IllegalStateException("triggerTestCrash is dev-only")
            }
            // Send SIGSEGV to self — the installed signal handler
            // persists the report for drain on next launch.
            android.os.Process.sendSignal(android.os.Process.myPid(), 11) // SIGSEGV
        }

        Function("triggerTestANR") { durationSeconds: Double ->
            if (!isDebugBuild()) {
                throw IllegalStateException("triggerTestANR is dev-only")
            }
            // Dispatch to main thread — ANR watchdog monitors main, not JS thread.
            android.os.Handler(android.os.Looper.getMainLooper()).post {
                Thread.sleep((durationSeconds * 1000).toLong())
            }
        }

        Function("triggerTestSpanCrash") { spanName: String ->
            if (!isDebugBuild()) {
                throw IllegalStateException("triggerTestSpanCrash is dev-only")
            }
            val spanId = java.util.UUID.randomUUID().toString()
            val now = System.currentTimeMillis()
            SpanLog.startSpan(spanId, spanName, "internal", null, now)
            // Crash after a brief delay so the span log flushes.
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                android.os.Process.killProcess(android.os.Process.myPid())
            }, 100)
        }
    }

    private fun isDebugBuild(): Boolean {
        return try {
            val ctx = appContext.reactContext ?: return false
            val ai = ctx.packageManager.getApplicationInfo(ctx.packageName, 0)
            (ai.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0
        } catch (_: Exception) {
            false
        }
    }

}
