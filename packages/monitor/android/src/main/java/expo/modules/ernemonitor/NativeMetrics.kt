package expo.modules.ernemonitor

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.os.StatFs
import android.os.SystemClock
import android.util.Log
import java.io.File

/**
 * Real device metrics for Android — replaces the placeholder values
 * the Task 38 ErneMonitorModule.sampleMetrics returned.
 *
 * Sources:
 *  - CPU: /proc/self/stat (utime + stime delta over wall-clock delta).
 *  - Memory used (RSS): /proc/self/statm field 2 * page size.
 *  - Memory available + total: ActivityManager.MemoryInfo.
 *  - Thermal: PowerManager.currentThermalStatus (Android 10+).
 *  - Battery: ACTION_BATTERY_CHANGED sticky broadcast.
 *  - Disk: StatFs on the app's data dir.
 *
 * Each call is a thin syscall — well under the 5ms target.
 */
object NativeMetrics {
  private const val TAG = "ErneMonitor"
  private val pageSizeBytes: Long = try {
    android.system.Os.sysconf(android.system.OsConstants._SC_PAGESIZE)
  } catch (_: Throwable) {
    4096L
  }

  // CPU sampling state — keep last sample so we can compute delta.
  @Volatile private var lastCpuJiffies: Long = 0
  @Volatile private var lastWallMs: Long = 0

  fun currentSnapshot(context: Context?): Map<String, Any?> {
    return mapOf(
      "cpuUsagePercent" to cpuUsage(),
      "memoryUsedBytes" to memoryResident(),
      "memoryAvailableBytes" to memoryAvailable(context),
      "memoryTotalBytes" to memoryTotal(context),
      "thermalState" to thermalState(context),
      "batteryLevel" to batteryLevel(context),
      "batteryCharging" to batteryCharging(context),
      "diskAvailableBytes" to diskAvailable(context),
      "diskTotalBytes" to diskTotal(context),
      "sampledAt" to System.currentTimeMillis(),
    )
  }

  // ---- CPU ----

  fun cpuUsage(): Double? {
    return try {
      val stat = File("/proc/self/stat").readText()
      // Field indices are 1-based per `man proc`. utime=14, stime=15.
      val parts = stat.split(' ')
      val utime = parts[13].toLong()
      val stime = parts[14].toLong()
      val totalJiffies = utime + stime
      val nowMs = SystemClock.elapsedRealtime()
      val prevJiffies = lastCpuJiffies
      val prevMs = lastWallMs
      lastCpuJiffies = totalJiffies
      lastWallMs = nowMs
      if (prevMs == 0L || nowMs <= prevMs) return null
      val deltaJiffies = totalJiffies - prevJiffies
      val deltaMs = nowMs - prevMs
      // 100 jiffies per second on most Android kernels.
      val jiffiesPerSec = 100.0
      val percent = (deltaJiffies.toDouble() / jiffiesPerSec) / (deltaMs.toDouble() / 1000.0) * 100.0
      percent.coerceIn(0.0, 100.0)
    } catch (t: Throwable) {
      Log.w(TAG, "cpuUsage read failed", t)
      null
    }
  }

  // ---- Memory ----

  fun memoryResident(): Long? {
    return try {
      val statm = File("/proc/self/statm").readText()
      val parts = statm.trim().split(' ')
      val rssPages = parts[1].toLong()
      rssPages * pageSizeBytes
    } catch (_: Throwable) {
      null
    }
  }

  fun memoryAvailable(context: Context?): Long? {
    val ctx = context ?: return null
    return try {
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return null
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      info.availMem
    } catch (_: Throwable) {
      null
    }
  }

  fun memoryTotal(context: Context?): Long? {
    val ctx = context ?: return null
    return try {
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return null
      val info = ActivityManager.MemoryInfo()
      am.getMemoryInfo(info)
      info.totalMem
    } catch (_: Throwable) {
      null
    }
  }

  // ---- Thermal ----

  fun thermalState(context: Context?): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return "unknown"
    val ctx = context ?: return "unknown"
    return try {
      val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return "unknown"
      when (pm.currentThermalStatus) {
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
  }

  // ---- Battery ----

  fun batteryLevel(context: Context?): Double? {
    val ctx = context ?: return null
    return try {
      val intent: Intent = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
      val level = intent.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
      val scale = intent.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
      if (level < 0 || scale <= 0) return null
      level.toDouble() / scale.toDouble()
    } catch (_: Throwable) {
      null
    }
  }

  fun batteryCharging(context: Context?): Boolean? {
    val ctx = context ?: return null
    return try {
      val intent: Intent = ctx.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED)) ?: return null
      val status = intent.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
      when (status) {
        BatteryManager.BATTERY_STATUS_CHARGING, BatteryManager.BATTERY_STATUS_FULL -> true
        BatteryManager.BATTERY_STATUS_DISCHARGING, BatteryManager.BATTERY_STATUS_NOT_CHARGING -> false
        else -> null
      }
    } catch (_: Throwable) {
      null
    }
  }

  // ---- Disk ----

  fun diskAvailable(context: Context?): Long? {
    val ctx = context ?: return null
    return try {
      val statfs = StatFs(ctx.filesDir.absolutePath)
      statfs.availableBytes
    } catch (_: Throwable) {
      null
    }
  }

  fun diskTotal(context: Context?): Long? {
    val ctx = context ?: return null
    return try {
      val statfs = StatFs(ctx.filesDir.absolutePath)
      statfs.totalBytes
    } catch (_: Throwable) {
      null
    }
  }
}

/**
 * Observes thermal-status changes via PowerManager and posts a
 * thermal-change event through ErneMonitorModule. Lifetime is owned
 * by the module — install/uninstall match the start/stop pair.
 */
object ThermalObserver {
  @Volatile var onChange: ((state: String) -> Unit)? = null
  @Volatile private var lastState: String = "unknown"
  @Volatile private var listener: PowerManager.OnThermalStatusChangedListener? = null
  @Volatile private var attachedTo: PowerManager? = null

  fun install(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
    if (listener != null) return
    val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
    val l = PowerManager.OnThermalStatusChangedListener {
      val state = NativeMetrics.thermalState(context)
      if (state != lastState) {
        lastState = state
        onChange?.invoke(state)
      }
    }
    try {
      pm.addThermalStatusListener(l)
      listener = l
      attachedTo = pm
      lastState = NativeMetrics.thermalState(context)
    } catch (t: Throwable) {
      Log.w("ErneMonitor", "thermal listener install failed", t)
    }
  }

  fun uninstall() {
    val l = listener ?: return
    val pm = attachedTo ?: return
    try {
      pm.removeThermalStatusListener(l)
    } catch (_: Throwable) {
      // ignore
    }
    listener = null
    attachedTo = null
    onChange = null
  }
}
