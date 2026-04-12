package expo.modules.ernemonitor

import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log
import java.io.File

/**
 * Kotlin façade for the Android native crash handler. Mirrors the iOS
 * `CrashHandler` Swift class:
 *
 *   - install() chains POSIX signals via JNI **and** the JVM-side
 *     `Thread.setDefaultUncaughtExceptionHandler` so Java/Kotlin
 *     exceptions persist alongside C/C++ signals.
 *   - drainPersistedCrashes() returns a list of report dictionaries
 *     ready for the JS gateway.
 *   - acknowledge(id) deletes the on-disk file once JS has dispatched
 *     it through the SDK pipeline.
 *
 * Crash files live under the app's private files directory:
 *   `<context.filesDir>/erne-monitor/crash.in-flight.bin`
 *
 * Format on disk is byte-for-byte identical to the iOS writer so the
 * JS side gets the same shape on both platforms (see
 * SignalHandler.c / signal_handler.cpp).
 */
object CrashHandler {
  private const val TAG = "ErneMonitor"
  private const val SUBDIR = "erne-monitor"
  private const val CRASH_FILE = "crash.in-flight.bin"

  @Volatile var isInstalled: Boolean = false
    private set

  @Volatile private var previousJvmHandler: Thread.UncaughtExceptionHandler? = null
  @Volatile private var crashDir: File? = null

  fun install(context: Context) {
    if (isInstalled) return
    val dir = File(context.filesDir, SUBDIR).apply { if (!exists()) mkdirs() }
    crashDir = dir
    val crashFile = File(dir, CRASH_FILE)

    val jniResult = try {
      NativeCrashHandler.nativeInstall(crashFile.absolutePath)
    } catch (t: Throwable) {
      Log.w(TAG, "nativeInstall failed", t)
      -1
    }
    if (jniResult != 0) {
      Log.w(TAG, "JNI signal handler not installed (result=$jniResult)")
      return
    }

    previousJvmHandler = Thread.getDefaultUncaughtExceptionHandler()
    Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
      try {
        persistJvmException(crashFile, throwable)
      } catch (t: Throwable) {
        Log.w(TAG, "failed to persist JVM exception", t)
      }
      previousJvmHandler?.uncaughtException(thread, throwable)
    }

    isInstalled = true
  }

  fun uninstall() {
    if (!isInstalled) return
    try {
      NativeCrashHandler.nativeUninstall()
    } catch (t: Throwable) {
      Log.w(TAG, "nativeUninstall failed", t)
    }
    Thread.setDefaultUncaughtExceptionHandler(previousJvmHandler)
    previousJvmHandler = null
    isInstalled = false
  }

  fun drainPersistedCrashes(): List<Map<String, Any?>> {
    val dir = crashDir ?: return emptyList()
    if (!dir.exists()) return emptyList()
    val files = dir.listFiles { f -> f.name.endsWith(".bin") } ?: return emptyList()
    val reports = mutableListOf<Map<String, Any?>>()
    for (file in files.sortedBy { it.lastModified() }) {
      try {
        val parsed = parse(file)
        if (parsed != null) reports.add(parsed)
      } catch (t: Throwable) {
        Log.w(TAG, "failed to parse ${file.name}", t)
      }
    }
    return reports
  }

  fun acknowledge(id: String) {
    val dir = crashDir ?: return
    val file = File(dir, id)
    if (file.exists()) file.delete()
  }

  // ---- helpers ----

  private fun persistJvmException(target: File, throwable: Throwable) {
    val sb = StringBuilder()
    sb.append("ERNE_CRASH 1\n")
    sb.append("signal=6\n") // model JVM exceptions as SIGABRT
    sb.append("code=0\n")
    sb.append("fault=0x0\n")
    sb.append("pid=").append(Process.myPid()).append('\n')
    sb.append("time=").append(System.currentTimeMillis() / 1000).append('\n')
    val frames = throwable.stackTrace
    sb.append("frames=").append(frames.size).append('\n')
    for (f in frames) {
      sb.append("f=").append(f.toString()).append('\n')
    }
    sb.append("ERNE_END\n")
    target.writeText(sb.toString())
  }

  private fun parse(file: File): Map<String, Any?>? {
    val text = file.readText()
    var sawHeader = false
    var sawEnd = false
    var signal = 0
    var code = 0
    var fault = "0x0"
    var pid = 0
    var time = 0
    val frames = mutableListOf<String>()
    for (line in text.split('\n')) {
      if (line == "ERNE_CRASH 1") {
        sawHeader = true
        continue
      }
      if (line == "ERNE_END") {
        sawEnd = true
        break
      }
      if (!sawHeader) continue
      val idx = line.indexOf('=')
      if (idx <= 0) continue
      val key = line.substring(0, idx)
      val value = line.substring(idx + 1)
      when (key) {
        "signal" -> signal = value.toIntOrNull() ?: 0
        "code" -> code = value.toIntOrNull() ?: 0
        "fault" -> fault = value
        "pid" -> pid = value.toIntOrNull() ?: 0
        "time" -> time = value.toIntOrNull() ?: 0
        "f" -> frames.add(value)
        "frames" -> { /* informational */ }
      }
    }
    if (!sawHeader || !sawEnd || signal == 0) return null

    return mapOf(
      "id" to file.name,
      "report" to mapOf(
        "signal" to signalName(signal),
        "signalCode" to code,
        "faultAddress" to fault,
        "backtrace" to frames,
        "threadName" to "main",
        "timestamp" to (time.toLong() * 1000L),
        "appVersion" to null,
        "osVersion" to "Android ${Build.VERSION.RELEASE}",
        "deviceModel" to "${Build.MANUFACTURER} ${Build.MODEL}",
        "breadcrumbs" to emptyList<Any>(),
      ),
    )
  }

  private fun signalName(sig: Int): String = when (sig) {
    11 -> "SIGSEGV"
    6 -> "SIGABRT"
    7 -> "SIGBUS"
    8 -> "SIGFPE"
    4 -> "SIGILL"
    5 -> "SIGTRAP"
    else -> "SIG_$sig"
  }
}
