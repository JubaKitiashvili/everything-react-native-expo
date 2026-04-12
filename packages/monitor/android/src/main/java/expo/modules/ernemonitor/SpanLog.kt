package expo.modules.ernemonitor

import android.content.Context
import android.util.Log
import java.io.File
import java.io.RandomAccessFile
import java.nio.channels.FileChannel
import java.nio.MappedByteBuffer
import java.util.concurrent.ConcurrentHashMap

/**
 * Append-only span log persisted to a memory-mapped file under
 * `<context.filesDir>/erne-monitor/spans.log`. Mirrors the iOS
 * SpanLog.swift line-protocol format byte-for-byte so the JS gateway
 * gets the same shape on both platforms.
 *
 * Wire format:
 *   START id name kind parent startedAtMs
 *   END   id endedAtMs
 *   UPD   id key value
 *
 * Recovery rule: every START with no matching END is "interrupted".
 * On endSpan() with an empty active set we truncate the file so
 * normal operation never grows past the 1MB cap.
 */
object SpanLog {
  private const val TAG = "ErneMonitor"
  private const val SUBDIR = "erne-monitor"
  private const val LOG_NAME = "spans.log"
  private const val MAX_BYTES = 1 * 1024 * 1024 // 1MB
  private const val MAX_ACTIVE = 50

  private data class Active(
    val id: String,
    val name: String,
    val kind: String,
    val parentId: String?,
    val startedAtMs: Long,
  )

  private var logFile: File? = null
  private val active = ConcurrentHashMap<String, Active>()
  private val ioLock = Any()

  fun install(context: Context) {
    val dir = File(context.filesDir, SUBDIR).apply { if (!exists()) mkdirs() }
    logFile = File(dir, LOG_NAME)
  }

  fun uninstall() {
    active.clear()
  }

  fun startSpan(id: String, name: String, kind: String, parentId: String?, startedAtMs: Long) {
    if (active.size >= MAX_ACTIVE) {
      val oldest = active.keys.iterator().next()
      active.remove(oldest)
    }
    active[id] = Active(id, name, kind, parentId, startedAtMs)
    val parent = parentId ?: "-"
    val safeName = escape(name)
    append("START $id $safeName $kind $parent $startedAtMs\n")
  }

  fun endSpan(id: String, endedAtMs: Long) {
    active.remove(id)
    append("END $id $endedAtMs\n")
    if (active.isEmpty()) truncate()
  }

  fun updateSpan(id: String, attribute: String, value: String) {
    append("UPD $id ${escape(attribute)} ${escape(value)}\n")
  }

  fun drainInterrupted(): List<Map<String, Any?>> {
    val file = logFile ?: return emptyList()
    if (!file.exists()) return emptyList()
    val spans = HashMap<String, Active>()
    val lastSeen = HashMap<String, Long>()
    try {
      file.forEachLine { line ->
        val parts = line.split(' ', limit = 6)
        if (parts.isEmpty()) return@forEachLine
        when (parts[0]) {
          "START" -> if (parts.size >= 6) {
            val id = parts[1]
            spans[id] = Active(
              id = id,
              name = unescape(parts[2]),
              kind = parts[3],
              parentId = if (parts[4] == "-") null else parts[4],
              startedAtMs = parts[5].toLongOrNull() ?: 0L,
            )
            lastSeen[id] = spans[id]!!.startedAtMs
          }
          "END" -> if (parts.size >= 3) {
            val id = parts[1]
            spans.remove(id)
            lastSeen.remove(id)
          }
          "UPD" -> if (parts.size >= 2) {
            lastSeen[parts[1]] = System.currentTimeMillis()
          }
          else -> { /* ignore */ }
        }
      }
    } catch (t: Throwable) {
      Log.w(TAG, "SpanLog drain failed", t)
    }
    val now = System.currentTimeMillis()
    val result = ArrayList<Map<String, Any?>>(spans.size)
    for ((id, span) in spans) {
      val last = lastSeen[id] ?: span.startedAtMs
      result.add(
        mapOf(
          "id" to id,
          "name" to span.name,
          "parentId" to span.parentId,
          "kind" to span.kind,
          "startedAt" to span.startedAtMs,
          "lastSeenAt" to last,
          "durationMs" to (now - span.startedAtMs),
        ),
      )
    }
    // Drop the file once parsed — anything still active should
    // re-register itself in the new session.
    file.delete()
    return result
  }

  // ---- helpers ----

  private fun append(line: String) {
    val file = logFile ?: return
    synchronized(ioLock) {
      try {
        if (!file.exists()) file.createNewFile()
        if (file.length() + line.length > MAX_BYTES) {
          truncate()
        }
        file.appendText(line)
      } catch (t: Throwable) {
        Log.w(TAG, "SpanLog append failed", t)
      }
    }
  }

  private fun truncate() {
    val file = logFile ?: return
    synchronized(ioLock) {
      try {
        val rebuilt = StringBuilder()
        for ((_, span) in active) {
          val parent = span.parentId ?: "-"
          rebuilt.append("START ${span.id} ${escape(span.name)} ${span.kind} $parent ${span.startedAtMs}\n")
        }
        file.writeText(rebuilt.toString())
      } catch (t: Throwable) {
        Log.w(TAG, "SpanLog truncate failed", t)
      }
    }
  }

  private fun escape(s: String): String = s.replace(' ', '_')
  private fun unescape(s: String): String = s.replace('_', ' ')
}
