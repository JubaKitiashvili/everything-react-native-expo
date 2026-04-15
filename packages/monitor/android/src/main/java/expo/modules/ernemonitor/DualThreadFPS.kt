package expo.modules.ernemonitor

import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.view.Choreographer

/**
 * Task 45 — Dual-thread FPS monitor (Android).
 *
 * Separates UI thread and JS thread frame rates:
 * - **UI thread**: [Choreographer.FrameCallback] counts frames delivered
 *   by the system compositor every vsync. Reports average UI FPS each
 *   report interval (default 1s).
 * - **JS thread**: Posts a lightweight ping to the main looper every 16ms
 *   from a background [HandlerThread] and counts how many complete within
 *   the report window. A blocked main thread (ANR-like) means fewer pings
 *   complete → lower inferred JS FPS.
 *
 * Stops monitoring when the app is backgrounded (no wasted work via
 * lifecycle callbacks from the module).
 */
object DualThreadFPS {

    /** Callback invoked every report interval with (uiFPS, jsFPS). */
    @Volatile
    var onReport: ((uiFPS: Double, jsFPS: Double) -> Unit)? = null

    @Volatile
    private var isRunning = false

    // UI FPS via Choreographer
    private var uiFrameCount = 0
    private var lastVsyncNanos: Long = 0

    // JS FPS via main-looper ping
    @Volatile
    private var jsProbeCompletions = 0

    private var probeThread: HandlerThread? = null
    private var probeHandler: Handler? = null
    private var mainHandler: Handler? = null
    private var reportHandler: Handler? = null

    private val choreographerCallback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!isRunning) return
            if (lastVsyncNanos != 0L) {
                uiFrameCount++
            }
            lastVsyncNanos = frameTimeNanos
            Choreographer.getInstance().postFrameCallback(this)
        }
    }

    private val jsProbeRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            // Post to main and count when it completes
            mainHandler?.post { jsProbeCompletions++ }
            probeHandler?.postDelayed(this, 16) // ~62.5 probes/sec
        }
    }

    private val reportRunnable = object : Runnable {
        override fun run() {
            if (!isRunning) return
            emitReport()
            reportHandler?.postDelayed(this, 1000)
        }
    }

    fun start() {
        if (isRunning) return
        isRunning = true
        resetCounters()

        mainHandler = Handler(Looper.getMainLooper())

        // UI FPS: Choreographer on main thread
        mainHandler?.post {
            Choreographer.getInstance().postFrameCallback(choreographerCallback)
        }

        // JS probe: background thread pinging main
        val thread = HandlerThread("erne-fps-probe").also { it.start() }
        probeThread = thread
        probeHandler = Handler(thread.looper)
        probeHandler?.post(jsProbeRunnable)

        // Report: every 1s on main
        reportHandler = mainHandler
        reportHandler?.postDelayed(reportRunnable, 1000)
    }

    fun stop() {
        isRunning = false
        mainHandler?.post {
            Choreographer.getInstance().removeFrameCallback(choreographerCallback)
        }
        probeHandler?.removeCallbacksAndMessages(null)
        probeThread?.quitSafely()
        probeThread = null
        probeHandler = null
        reportHandler?.removeCallbacks(reportRunnable)
        reportHandler = null
        mainHandler = null
        onReport = null
        resetCounters()
    }

    private fun emitReport() {
        val uiFPS = uiFrameCount.toDouble() // frames in ~1s window
        // Scale probe completions to 60fps equivalent
        val maxExpectedProbes = 62.5
        val jsFPS = minOf(60.0, (jsProbeCompletions.toDouble() / maxExpectedProbes) * 60.0)

        onReport?.invoke(uiFPS, jsFPS)
        resetCounters()
    }

    private fun resetCounters() {
        uiFrameCount = 0
        jsProbeCompletions = 0
        lastVsyncNanos = 0
    }
}
