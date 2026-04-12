import Foundation

/**
 Reads the line-oriented crash report files written by SignalHandler.c
 from the previous session and translates them into the dictionary
 shape `ErneMonitorNative.replayPersistedCrashes` expects.

 The text format is intentionally trivial so the C-side writer can
 produce it without touching the heap:

     ERNE_CRASH 1
     signal=11
     code=1
     fault=0xdeadbeef
     pid=12345
     time=1700000000
     frames=4
     f=0x1041abcde
     f=0x10412e346
     ...
     ERNE_END

 The Swift side reads it on the next launch (running in a normal,
 non-signal context where Foundation is fine), turns it into a JSON
 record consumable by the JS gateway, and deletes the file once it has
 been acknowledged.
 */
struct ErneCrashReport {
  let id: String
  let path: String
  let signal: Int
  let signalName: String
  let signalCode: Int
  let faultAddress: String
  let pid: Int
  let timestamp: Int
  let frames: [String]

  func toDictionary() -> [String: Any] {
    return [
      "id": id,
      "report": [
        "signal": signalName,
        "signalCode": signalCode,
        "faultAddress": faultAddress,
        "backtrace": frames,
        "threadName": "main",
        "timestamp": timestamp * 1000,
        "appVersion": Bundle.main.infoDictionary?["CFBundleShortVersionString"] ?? NSNull(),
        "osVersion": ProcessInfo.processInfo.operatingSystemVersionString,
        "deviceModel": NSNull(),
        "breadcrumbs": [],
      ],
    ]
  }
}

enum CrashReportWriter {
  /// Returns the directory where crash reports for this app are stored.
  /// Lives under Application Support so iOS does not purge it on disk
  /// pressure (unlike Caches).
  static func crashDirectory() throws -> URL {
    let fm = FileManager.default
    let support = try fm.url(
      for: .applicationSupportDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let dir = support.appendingPathComponent("ErneMonitor", isDirectory: true)
    if !fm.fileExists(atPath: dir.path) {
      try fm.createDirectory(at: dir, withIntermediateDirectories: true)
    }
    return dir
  }

  /// Path the C handler should write the next crash to.
  /// We use a fixed name so a brand new crash always overwrites the
  /// previous in-flight slot. Persisted reports are renamed off this
  /// slot once the SDK boots and reads them.
  static func currentCrashPath() throws -> URL {
    return try crashDirectory().appendingPathComponent("crash.in-flight.bin")
  }

  /// On SDK boot: scan the crash directory for any persisted reports
  /// (including the in-flight slot if the previous run died) and parse
  /// them. Returns the list ordered by timestamp ascending.
  static func drainPersisted() throws -> [ErneCrashReport] {
    let fm = FileManager.default
    let dir = try crashDirectory()
    let files = try fm.contentsOfDirectory(atPath: dir.path)
    var reports: [ErneCrashReport] = []
    for name in files where name.hasSuffix(".bin") {
      let url = dir.appendingPathComponent(name)
      if let parsed = parse(url: url) {
        reports.append(parsed)
      }
    }
    reports.sort { $0.timestamp < $1.timestamp }
    return reports
  }

  static func delete(id: String) {
    let fm = FileManager.default
    if let dir = try? crashDirectory() {
      let url = dir.appendingPathComponent(id)
      try? fm.removeItem(at: url)
    }
  }

  static func parse(url: URL) -> ErneCrashReport? {
    guard let data = try? Data(contentsOf: url),
          let text = String(data: data, encoding: .utf8) else {
      return nil
    }
    var signal = 0
    var code = 0
    var fault = "0x0"
    var pid = 0
    var time = 0
    var frames: [String] = []
    var sawHeader = false
    var sawEnd = false

    for raw in text.split(separator: "\n") {
      let line = String(raw)
      if line == "ERNE_CRASH 1" {
        sawHeader = true
        continue
      }
      if line == "ERNE_END" {
        sawEnd = true
        break
      }
      if !sawHeader { continue }
      let parts = line.split(separator: "=", maxSplits: 1, omittingEmptySubsequences: false)
      guard parts.count == 2 else { continue }
      let key = String(parts[0])
      let value = String(parts[1])
      switch key {
      case "signal": signal = Int(value) ?? 0
      case "code": code = Int(value) ?? 0
      case "fault": fault = value
      case "pid": pid = Int(value) ?? 0
      case "time": time = Int(value) ?? 0
      case "f": frames.append(value)
      case "frames": _ = value  // count is informational; we keep all frames we see
      default: break
      }
    }

    guard sawHeader, sawEnd, signal != 0 else { return nil }

    return ErneCrashReport(
      id: url.lastPathComponent,
      path: url.path,
      signal: signal,
      signalName: signalName(for: signal),
      signalCode: code,
      faultAddress: fault,
      pid: pid,
      timestamp: time,
      frames: frames
    )
  }

  private static func signalName(for sig: Int) -> String {
    switch Int32(sig) {
    case SIGSEGV: return "SIGSEGV"
    case SIGABRT: return "SIGABRT"
    case SIGBUS:  return "SIGBUS"
    case SIGFPE:  return "SIGFPE"
    case SIGILL:  return "SIGILL"
    case SIGTRAP: return "SIGTRAP"
    default:      return "SIG_\(sig)"
    }
  }
}
