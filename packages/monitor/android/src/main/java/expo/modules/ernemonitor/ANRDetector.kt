package expo.modules.ernemonitor

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Debug
import android.os.Handler
import android.os.HandlerThread
import android.os.Looper
import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

/**
 * Watchdog-based ANR detector for Android. Mirrors the iOS variant
 * (ANRDetector.swift):
 *
 *   1. A background HandlerThread ticks every `pingIntervalMs`.
 *   2. Each tick posts a "still alive" Runnable to the main Looper
 *      and starts a deadline.
 *   3. If the main thread runs the runnable inside `thresholdMs` the
 *      tick is healthy; otherwise we capture the main thread's stack
 *      via `Looper.getMainLooper().thread.stackTrace` and emit an ANR.
 *   4. Multiple consecutive deadline misses are coalesced into a
 *      single report so the SDK does not spam the bus while the main
 *      thread is still wedged.
 *
 * Edge cases:
 *   - Suspended while the app is backgrounded so a sleeping process
 *     does not look like an ANR.
 *   - Suspended while a debugger is attached
 *     (`Debug.isDebuggerConnected()`).
 */
object ANRDetector {
  private const val TAG = "ErneMonitor"
  private const val PING_INTERVAL_MS = 1000L
  private const val THRESHOLD_MS = 5000L

  @Volatile var isRunning: Boolean = false
    private set

  /** Set by ErneMonitorModule before start() is called. */
  @Volatile var onANR: ((durationMs: Long, stack: List<String>) -> Unit)? = null

  @Volatile private var workerThread: HandlerThread? = null
  @Volatile private var workerHandler: Handler? = null
  private val mainHandler = Handler(Looper.getMainLooper())
  private val pendingTickId = AtomicLong(0)
  private val lastAckedTickId = AtomicLong(0)
  private val pendingTickStartedAt = AtomicLong(0)
  private val inAnrState = AtomicBoolean(false)
  @Volatile private var isBackgrounded: Boolean = false

  fun start(context: Context) {
    if (isRunning) return
    val thread = HandlerThread("erne-monitor-anr").apply { start() }
    val handler = Handler(thread.looper)
    workerThread = thread
    workerHandler = handler
    isRunning = true
    pendingTickId.set(0)
    lastAckedTickId.set(0)
    inAnrState.set(false)
    scheduleTick()
  }

  fun stop() {
    if (!isRunning) return
    isRunning = false
    workerHandler?.removeCallbacksAndMessages(null)
    workerThread?.quitSafely()
    workerHandler = null
    workerThread = null
    pendingTickId.set(0)
    lastAckedTickId.set(0)
    inAnrState.set(false)
  }

  /** External hook for app-state observers — call from a Lifecycle listener. */
  fun onAppBackgrounded() {
    isBackgrounded = true
  }

  fun onAppForegrounded() {
    isBackgrounded = false
    pendingTickId.set(0)
    lastAckedTickId.set(0)
    inAnrState.set(false)
  }

  // ---- internals ----

  private fun scheduleTick() {
    val handler = workerHandler ?: return
    handler.postDelayed({ tick() }, PING_INTERVAL_MS)
  }

  private fun tick() {
    if (!isRunning) return
    if (isBackgrounded) {
      scheduleTick()
      return
    }
    if (Debug.isDebuggerConnected()) {
      scheduleTick()
      return
    }

    val outstanding = pendingTickId.get()
    if (outstanding != 0L && outstanding != lastAckedTickId.get()) {
      val elapsed = System.currentTimeMillis() - pendingTickStartedAt.get()
      if (elapsed >= THRESHOLD_MS && inAnrState.compareAndSet(false, true)) {
        val mainThread = Looper.getMainLooper().thread
        val frames = try {
          mainThread.stackTrace.map { it.toString() }
        } catch (t: Throwable) {
          Log.w(TAG, "ANR stack capture failed", t)
          emptyList()
        }
        val cb = onANR
        cb?.invoke(elapsed, frames)
      }
      scheduleTick()
      return
    }

    val myId = pendingTickId.incrementAndGet()
    pendingTickStartedAt.set(System.currentTimeMillis())
    mainHandler.post {
      lastAckedTickId.set(myId)
      inAnrState.set(false)
    }
    scheduleTick()
  }
}
