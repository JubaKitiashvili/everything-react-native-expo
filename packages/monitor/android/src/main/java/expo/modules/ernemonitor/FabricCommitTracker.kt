package expo.modules.ernemonitor

import android.app.Activity
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.view.FrameMetrics
import android.view.Window
import java.lang.ref.WeakReference

/**
 * Task 46 — Fabric Commit Tracker (Android).
 *
 * Uses the [Window.OnFrameMetricsAvailableListener] API (API 26+) to
 * capture per-frame rendering pipeline metrics:
 *   - `LAYOUT_MEASURE_DURATION` → Yoga layout time
 *   - `TOTAL_DURATION` → full commit duration
 *   - Frame count → commit count
 *
 * Reports every 2 seconds:
 *   - `commitCount`: frames rendered in the window
 *   - `avgCommitDuration`: average total frame time (ms)
 *   - `maxCommitDuration`: worst-case frame time (ms)
 *   - `yogaLayoutTime`: cumulative layout+measure time (ms)
 *   - `isLayoutThrashing`: true if >10 commits/sec sustained for >2s
 *
 * Graceful no-op on API <26 (returns without starting).
 */
object FabricCommitTracker {

    @Volatile
    var onReport: ((commitCount: Int,
                    avgCommitDuration: Double,
                    maxCommitDuration: Double,
                    yogaLayoutTime: Double,
                    isLayoutThrashing: Boolean) -> Unit)? = null

    @Volatile
    private var isRunning = false

    private var frameMetricsListener: Window.OnFrameMetricsAvailableListener? = null
    private var activityRef: WeakReference<Activity>? = null
    private var reportHandler: Handler? = null
    private var reportRunnable: Runnable? = null

    // Per-window accumulators
    @Volatile private var commitCount = 0
    @Volatile private var totalDurationNs: Long = 0
    @Volatile private var maxDurationNs: Long = 0
    @Volatile private var yogaLayoutNs: Long = 0

    // Layout thrashing detection
    private var thrashingStartMs: Long = 0
    private const val THRASHING_COMMITS_PER_SEC = 10
    private const val THRASHING_DURATION_MS = 2000L

    fun start(activity: Activity?) {
        if (isRunning) return
        if (activity == null) return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return // API 26+
        isRunning = true
        activityRef = WeakReference(activity)
        resetCounters()

        val handler = Handler(Looper.getMainLooper())
        reportHandler = handler

        // FrameMetrics listener — fires per frame on the handler thread
        val listener = Window.OnFrameMetricsAvailableListener { _, frameMetrics, _ ->
            if (!isRunning) return@OnFrameMetricsAvailableListener
            val totalNs = frameMetrics.getMetric(FrameMetrics.TOTAL_DURATION)
            val layoutNs = frameMetrics.getMetric(FrameMetrics.LAYOUT_MEASURE_DURATION)
            commitCount++
            totalDurationNs += totalNs
            yogaLayoutNs += layoutNs
            if (totalNs > maxDurationNs) maxDurationNs = totalNs
        }
        frameMetricsListener = listener

        try {
            activity.window.addOnFrameMetricsAvailableListener(listener, handler)
        } catch (_: Exception) {
            // Window may not be attached yet — silently skip
            isRunning = false
            return
        }

        // Report every 2 seconds
        val runnable = object : Runnable {
            override fun run() {
                if (!isRunning) return
                emitReport()
                reportHandler?.postDelayed(this, 2000)
            }
        }
        reportRunnable = runnable
        handler.postDelayed(runnable, 2000)
    }

    fun stop() {
        isRunning = false
        frameMetricsListener?.let { listener ->
            try {
                activityRef?.get()?.window?.removeOnFrameMetricsAvailableListener(listener)
            } catch (_: Exception) {
                // Activity may already be destroyed
            }
        }
        frameMetricsListener = null
        activityRef = null
        reportRunnable?.let { reportHandler?.removeCallbacks(it) }
        reportRunnable = null
        reportHandler = null
        onReport = null
        resetCounters()
    }

    private fun emitReport() {
        val count = commitCount
        val totalMs = totalDurationNs / 1_000_000.0
        val avg = if (count > 0) totalMs / count else 0.0
        val max = maxDurationNs / 1_000_000.0
        val yoga = yogaLayoutNs / 1_000_000.0

        // Thrashing: >10 commits/sec for >2s
        val commitsPerSec = count.toDouble() / 2.0
        var isLayoutThrashing = false
        if (commitsPerSec > THRASHING_COMMITS_PER_SEC) {
            val now = System.currentTimeMillis()
            if (thrashingStartMs == 0L) {
                thrashingStartMs = now
            } else if (now - thrashingStartMs >= THRASHING_DURATION_MS) {
                isLayoutThrashing = true
            }
        } else {
            thrashingStartMs = 0
        }

        onReport?.invoke(count, avg, max, yoga, isLayoutThrashing)
        resetCounters()
    }

    private fun resetCounters() {
        commitCount = 0
        totalDurationNs = 0
        maxDurationNs = 0
        yogaLayoutNs = 0
    }
}
