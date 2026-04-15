package expo.modules.ernemonitor

import android.content.Context
import java.io.File

/**
 * Task 49 — Hermes CPU Profiler Bridge (Android).
 *
 * Manages profile storage on the Android side. The actual Hermes profiler
 * start/stop is coordinated from JS via `global.HermesInternal`:
 *   - `HermesInternal.enableSampling()` — starts sampling profiler
 *   - `HermesInternal.disableSampling()` — stops and returns profile data
 *
 * The native side handles:
 * - Profile file storage (filesDir/erne-monitor/profiles/)
 * - Duration cap (max 30 seconds, enforced by JS timer)
 * - File listing and cleanup
 */
object HermesProfilerBridge {

    private var profileDir: File? = null
    private const val MAX_DURATION_MS = 30_000L

    fun install(context: Context) {
        val dir = File(context.filesDir, "erne-monitor/profiles")
        dir.mkdirs()
        profileDir = dir
    }

    /**
     * Save a .cpuprofile blob received from JS.
     * @return file path on success, null on failure.
     */
    fun saveProfile(data: String, trigger: String): String? {
        val dir = profileDir ?: return null
        val filename = "profile-${System.currentTimeMillis()}-$trigger.cpuprofile"
        val file = File(dir, filename)
        return try {
            file.writeText(data)
            file.absolutePath
        } catch (_: Exception) {
            null
        }
    }

    /** List stored profile files, newest first. */
    fun listProfiles(): List<Map<String, Any>> {
        val dir = profileDir ?: return emptyList()
        return dir.listFiles { f -> f.extension == "cpuprofile" }
            ?.map { file ->
                mapOf(
                    "path" to file.absolutePath,
                    "filename" to file.name,
                    "sizeBytes" to file.length(),
                    "createdAt" to file.lastModified(),
                )
            }
            ?.sortedByDescending { it["createdAt"] as Long }
            ?: emptyList()
    }

    /** Delete a specific profile file. */
    fun deleteProfile(path: String): Boolean {
        return try {
            File(path).delete()
        } catch (_: Exception) {
            false
        }
    }

    /** Delete all stored profiles. */
    fun deleteAllProfiles() {
        profileDir?.listFiles()?.forEach { it.delete() }
    }

    val maxDurationMs: Long get() = MAX_DURATION_MS
}
