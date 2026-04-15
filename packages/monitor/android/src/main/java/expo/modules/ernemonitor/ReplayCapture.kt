package expo.modules.ernemonitor

import android.app.Activity
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Rect
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.view.PixelCopy
import java.io.ByteArrayOutputStream
import java.lang.ref.WeakReference

/**
 * Task 47 — Session Replay Capture (Android).
 *
 * Captures low-resolution screenshots at a configurable interval using
 * [PixelCopy] API (API 26+) and records touch coordinates as an overlay
 * timeline.
 *
 * Key design:
 * - Half-resolution JPEG at quality 30 (~10-30KB per frame)
 * - Ring buffer of max 30s at capture rate (managed by JS side)
 * - PII mask regions drawn as opaque rectangles before JPEG encode
 * - Falls back to `View.draw(Canvas)` on API <26
 */
object ReplayCapture {

    @Volatile
    var onFrame: ((frameBase64: String,
                   touchEvents: List<Map<String, Any>>,
                   timestamp: Long) -> Unit)? = null

    @Volatile
    private var isCapturing = false

    private var captureHandler: Handler? = null
    private var captureRunnable: Runnable? = null
    private var activityRef: WeakReference<Activity>? = null
    private var captureIntervalMs: Long = 1000

    // Touch recording
    private val pendingTouches = mutableListOf<Map<String, Any>>()

    // Mask regions
    @Volatile
    private var maskRegions: List<Map<String, Any>> = emptyList()

    private val maskPaint = Paint().apply {
        color = Color.DKGRAY
        style = Paint.Style.FILL
    }

    fun startCapture(activity: Activity?, intervalMs: Int, masks: List<Map<String, Any>>) {
        if (isCapturing) return
        if (activity == null) return
        isCapturing = true
        activityRef = WeakReference(activity)
        captureIntervalMs = maxOf(200L, intervalMs.toLong()) // min 200ms (5fps)
        maskRegions = masks
        pendingTouches.clear()

        val handler = Handler(Looper.getMainLooper())
        captureHandler = handler

        val runnable = object : Runnable {
            override fun run() {
                if (!isCapturing) return
                captureFrame()
                handler.postDelayed(this, captureIntervalMs)
            }
        }
        captureRunnable = runnable
        handler.postDelayed(runnable, captureIntervalMs)
    }

    fun stopCapture() {
        isCapturing = false
        captureRunnable?.let { captureHandler?.removeCallbacks(it) }
        captureRunnable = null
        captureHandler = null
        activityRef = null
        pendingTouches.clear()
        onFrame = null
    }

    fun updateMaskRegions(regions: List<Map<String, Any>>) {
        maskRegions = regions
    }

    fun recordTouch(x: Double, y: Double, phase: String) {
        if (!isCapturing) return
        synchronized(pendingTouches) {
            pendingTouches.add(
                mapOf(
                    "x" to x,
                    "y" to y,
                    "phase" to phase,
                    "timestamp" to System.currentTimeMillis(),
                ),
            )
            if (pendingTouches.size > 100) {
                pendingTouches.subList(0, pendingTouches.size - 100).clear()
            }
        }
    }

    private fun captureFrame() {
        val activity = activityRef?.get() ?: return
        val window = activity.window ?: return
        val decorView = window.decorView
        val width = decorView.width
        val height = decorView.height
        if (width <= 0 || height <= 0) return

        // Half resolution
        val scaledW = width / 2
        val scaledH = height / 2

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // PixelCopy API (API 26+) — captures surface contents
            val bitmap = Bitmap.createBitmap(scaledW, scaledH, Bitmap.Config.ARGB_8888)
            val srcRect = Rect(0, 0, width, height)
            try {
                PixelCopy.request(
                    window,
                    srcRect,
                    bitmap,
                    { copyResult ->
                        if (copyResult == PixelCopy.SUCCESS) {
                            applyMasksAndEmit(bitmap, 0.5f)
                        } else {
                            bitmap.recycle()
                        }
                    },
                    captureHandler ?: Handler(Looper.getMainLooper()),
                )
            } catch (_: Exception) {
                bitmap.recycle()
            }
        } else {
            // Fallback: View.draw()
            val bitmap = Bitmap.createBitmap(scaledW, scaledH, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(bitmap)
            canvas.scale(0.5f, 0.5f)
            try {
                decorView.draw(canvas)
                applyMasksAndEmit(bitmap, 0.5f)
            } catch (_: Exception) {
                bitmap.recycle()
            }
        }
    }

    private fun applyMasksAndEmit(bitmap: Bitmap, scale: Float) {
        // Draw mask regions
        val canvas = Canvas(bitmap)
        for (region in maskRegions) {
            val x = ((region["x"] as? Number)?.toFloat() ?: continue) * scale
            val y = ((region["y"] as? Number)?.toFloat() ?: continue) * scale
            val w = ((region["width"] as? Number)?.toFloat() ?: continue) * scale
            val h = ((region["height"] as? Number)?.toFloat() ?: continue) * scale
            canvas.drawRect(x, y, x + w, y + h, maskPaint)
        }

        // JPEG encode
        val baos = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, 30, baos)
        bitmap.recycle()

        val base64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP)
        val touches: List<Map<String, Any>>
        synchronized(pendingTouches) {
            touches = ArrayList(pendingTouches)
            pendingTouches.clear()
        }
        val timestamp = System.currentTimeMillis()

        onFrame?.invoke(base64, touches, timestamp)
    }
}
