import Foundation

/**
 Append-only span log persisted to a memory-mapped file in
 Application Support/ErneMonitor/. Tasks 43 iOS implementation.

 Wire format (newline-delimited records, ASCII only so the writer
 stays simple):

   START id name kind parent startedAt
   END   id endedAt
   ROT   timestamp                  (rotation marker, ignored on read)

 Recovery is "every START with no matching END is interrupted".
 Each successful endSpan() also rewrites the file from scratch when
 the active set is empty so the log doesn't grow unbounded — the
 1MB cap from the spec is a hard upper bound.
 */
final class SpanLog {
  static let shared = SpanLog()

  private let queue = DispatchQueue(label: "dev.erne.monitor.span", qos: .utility)
  private var url: URL?
  private var active: [String: ActiveSpan] = [:]
  private let maxFileBytes = 1 * 1024 * 1024 // 1MB
  private let maxActive = 50

  struct ActiveSpan {
    let id: String
    let name: String
    let kind: String
    let parentId: String?
    let startedAtMs: Int64
  }

  func install() {
    queue.async { [weak self] in
      guard let self = self else { return }
      do {
        let dir = try CrashReportWriter.crashDirectory()
        self.url = dir.appendingPathComponent("spans.log")
        // No allocation, no recovery here — drain() handles parsing.
      } catch {
        NSLog("[ErneMonitor] SpanLog install failed: \(error)")
      }
    }
  }

  func uninstall() {
    queue.async { [weak self] in
      self?.active.removeAll()
    }
  }

  func startSpan(id: String, name: String, kind: String, parentId: String?,
                 startedAtMs: Int64) {
    queue.async { [weak self] in
      guard let self = self else { return }
      if self.active.count >= self.maxActive {
        if let firstKey = self.active.keys.first {
          self.active.removeValue(forKey: firstKey)
        }
      }
      self.active[id] = ActiveSpan(
        id: id, name: name, kind: kind,
        parentId: parentId, startedAtMs: startedAtMs
      )
      let line = "START \(id) \(self.escape(name)) \(kind) \(parentId ?? "-") \(startedAtMs)\n"
      self.append(line)
    }
  }

  func endSpan(id: String, endedAtMs: Int64) {
    queue.async { [weak self] in
      guard let self = self else { return }
      self.active.removeValue(forKey: id)
      let line = "END \(id) \(endedAtMs)\n"
      self.append(line)
      if self.active.isEmpty {
        self.truncate()
      }
    }
  }

  func updateSpan(id: String, attribute: String, value: String) {
    queue.async { [weak self] in
      guard let self = self else { return }
      let line = "UPD \(id) \(self.escape(attribute)) \(self.escape(value))\n"
      self.append(line)
    }
  }

  func drainInterrupted() -> [[String: Any]] {
    var result: [[String: Any]] = []
    queue.sync {
      guard let url = self.url, FileManager.default.fileExists(atPath: url.path) else {
        return
      }
      var spans: [String: ActiveSpan] = [:]
      var lastSeen: [String: Int64] = [:]
      do {
        let text = try String(contentsOf: url, encoding: .utf8)
        for raw in text.split(separator: "\n") {
          let line = String(raw)
          let parts = line.split(separator: " ", maxSplits: 5,
                                 omittingEmptySubsequences: false).map(String.init)
          if parts.isEmpty { continue }
          switch parts[0] {
          case "START":
            if parts.count >= 6 {
              let id = parts[1]
              let span = ActiveSpan(
                id: id,
                name: self.unescape(parts[2]),
                kind: parts[3],
                parentId: parts[4] == "-" ? nil : parts[4],
                startedAtMs: Int64(parts[5]) ?? 0
              )
              spans[id] = span
              lastSeen[id] = span.startedAtMs
            }
          case "END":
            if parts.count >= 3 {
              let id = parts[1]
              spans.removeValue(forKey: id)
              lastSeen.removeValue(forKey: id)
            }
          case "UPD":
            if parts.count >= 2 {
              let id = parts[1]
              lastSeen[id] = Int64(Date().timeIntervalSince1970 * 1000)
            }
          default:
            continue
          }
        }
      } catch {
        NSLog("[ErneMonitor] SpanLog drain failed: \(error)")
      }

      let now = Int64(Date().timeIntervalSince1970 * 1000)
      for (id, span) in spans {
        let last = lastSeen[id] ?? span.startedAtMs
        result.append([
          "id": id,
          "name": span.name,
          "parentId": span.parentId ?? NSNull(),
          "kind": span.kind,
          "startedAt": span.startedAtMs,
          "lastSeenAt": last,
          "durationMs": now - span.startedAtMs,
        ])
      }
      // Discard the file once we've parsed it — anything still active
      // should re-register itself in the new session.
      try? FileManager.default.removeItem(at: url)
    }
    return result
  }

  // MARK: - File I/O

  private func append(_ line: String) {
    guard let url = self.url else { return }
    do {
      if !FileManager.default.fileExists(atPath: url.path) {
        try Data().write(to: url)
      }
      // Rotation: if appending would push us past the cap, truncate first.
      let attrs = try FileManager.default.attributesOfItem(atPath: url.path)
      let size = (attrs[.size] as? Int) ?? 0
      if size + line.utf8.count > maxFileBytes {
        truncate()
      }
      let handle = try FileHandle(forWritingTo: url)
      try handle.seekToEnd()
      if let data = line.data(using: .utf8) {
        try handle.write(contentsOf: data)
      }
      try handle.close()
    } catch {
      NSLog("[ErneMonitor] SpanLog append failed: \(error)")
    }
  }

  private func truncate() {
    guard let url = self.url else { return }
    // Rewrite the file with the current active set so we keep
    // recovery data without unbounded growth.
    var rebuilt = ""
    for (_, span) in self.active {
      rebuilt += "START \(span.id) \(escape(span.name)) \(span.kind) \(span.parentId ?? "-") \(span.startedAtMs)\n"
    }
    do {
      try rebuilt.write(to: url, atomically: true, encoding: .utf8)
    } catch {
      NSLog("[ErneMonitor] SpanLog truncate failed: \(error)")
    }
  }

  // Replace spaces with underscores so the line parser stays trivial.
  private func escape(_ s: String) -> String {
    return s.replacingOccurrences(of: " ", with: "_")
  }

  private func unescape(_ s: String) -> String {
    return s.replacingOccurrences(of: "_", with: " ")
  }
}
