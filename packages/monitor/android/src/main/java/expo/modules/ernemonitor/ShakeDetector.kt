package expo.modules.ernemonitor

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import kotlin.math.sqrt

/**
 * Task 52 — ShakeDetector (Android)
 *
 * Detects device shake gestures using the accelerometer SensorEventListener.
 * Uses a threshold-based algorithm: if the acceleration magnitude exceeds
 * SHAKE_THRESHOLD_G within SHAKE_TIME_LAPSE_MS of a previous shake event,
 * a shake is detected.
 *
 * Usage:
 *   ShakeDetector.onShake = { /* report bug */ }
 *   ShakeDetector.start(context)
 *   // ...
 *   ShakeDetector.stop()
 */
object ShakeDetector : SensorEventListener {
    /** Callback fired on shake detection. Set by ErneMonitorModule. */
    var onShake: (() -> Unit)? = null

    private const val SHAKE_THRESHOLD_G = 2.7f
    private const val SHAKE_SLOP_TIME_MS = 500L
    private const val SHAKE_COUNT_RESET_TIME_MS = 3000L
    private const val MIN_SHAKES_TO_TRIGGER = 3

    private var sensorManager: SensorManager? = null
    private var accelerometer: Sensor? = null
    @Volatile
    private var isActive = false

    private var shakeTimestamp: Long = 0
    private var shakeCount: Int = 0

    /**
     * Start listening for shake gestures.
     * Registers the accelerometer sensor listener.
     */
    fun start(context: Context) {
        if (isActive) return
        val manager = context.getSystemService(Context.SENSOR_SERVICE) as? SensorManager ?: return
        val sensor = manager.getDefaultSensor(Sensor.TYPE_ACCELEROMETER) ?: return

        sensorManager = manager
        accelerometer = sensor
        isActive = true

        manager.registerListener(this, sensor, SensorManager.SENSOR_DELAY_UI)
    }

    /** Stop listening for shake gestures. */
    fun stop() {
        if (!isActive) return
        isActive = false
        sensorManager?.unregisterListener(this)
        sensorManager = null
        accelerometer = null
        shakeCount = 0
        shakeTimestamp = 0
    }

    override fun onSensorChanged(event: SensorEvent?) {
        if (!isActive || event == null) return
        if (event.sensor.type != Sensor.TYPE_ACCELEROMETER) return

        val x = event.values[0]
        val y = event.values[1]
        val z = event.values[2]

        // Compute acceleration magnitude (without gravity would be ~0 at rest)
        val gX = x / SensorManager.GRAVITY_EARTH
        val gY = y / SensorManager.GRAVITY_EARTH
        val gZ = z / SensorManager.GRAVITY_EARTH
        val gForce = sqrt((gX * gX + gY * gY + gZ * gZ).toDouble()).toFloat()

        if (gForce < SHAKE_THRESHOLD_G) return

        val now = System.currentTimeMillis()

        // Reset shake count if too much time has passed
        if (shakeTimestamp + SHAKE_COUNT_RESET_TIME_MS < now) {
            shakeCount = 0
        }

        // Ignore shakes too close together (slop)
        if (shakeTimestamp + SHAKE_SLOP_TIME_MS > now) return

        shakeTimestamp = now
        shakeCount++

        if (shakeCount >= MIN_SHAKES_TO_TRIGGER) {
            shakeCount = 0
            onShake?.invoke()
        }
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {
        // Not needed for shake detection
    }
}
