import Foundation
// SignalHandler.h is exposed via the auto-generated CocoaPods umbrella
// header for the ErneMonitor pod, so the C functions are visible to
// every Swift file in the same target without an explicit import.

/**
 Non-capturing C function pointer used as the NSException callback.
 NSSetUncaughtExceptionHandler takes a `@convention(c)` function
 pointer, which Swift only forms from a non-capturing closure or
 a top-level non-generic function — never from a method or a
 closure that captures `self`. The body delegates to the
 `CrashHandler` singleton.
 */
private let erneNSExceptionHandler: @convention(c) (NSException) -> Void = { exception in
  CrashHandler.shared.handleNSExceptionPublic(exception)
  CrashHandler.shared.previousNSExceptionHandler?(exception)
}

/**
 Swift-side façade around the C signal handler. Owns:

   - Lifecycle of the underlying handler (install / uninstall).
   - The path where the C side dumps the next crash.
   - The chained NSException handler so Objective-C / Swift exceptions
     produce the same on-disk format as POSIX signals.

 The actual signal handling work happens in SignalHandler.c — Swift
 just wires it up. NSException callbacks run on a normal thread (not
 a signal context), so we can use Foundation here.
 */
final class CrashHandler {
  static let shared = CrashHandler()

  private(set) var isInstalled: Bool = false
  fileprivate(set) var previousNSExceptionHandler: NSUncaughtExceptionHandler?

  func install() {
    guard !isInstalled else { return }

    // 1. Resolve the on-disk slot the C handler should write to.
    let path: String
    do {
      path = try CrashReportWriter.currentCrashPath().path
    } catch {
      NSLog("[ErneMonitor] crash directory init failed: \(error)")
      return
    }

    // 2. Install the POSIX signal chain.
    let result = path.withCString { erne_install_signal_handler($0) }
    if result != 0 {
      NSLog("[ErneMonitor] erne_install_signal_handler failed (errno=\(errno))")
      return
    }

    // 3. Install the NSException handler. We chain whatever was there
    //    before so other reporters (Crashlytics, Sentry) still see the
    //    exception. The actual callback is the top-level
    //    `erneHandleNSException` defined above — Swift only allows
    //    @convention(c) function pointers from non-capturing functions.
    previousNSExceptionHandler = NSGetUncaughtExceptionHandler()
    NSSetUncaughtExceptionHandler(erneNSExceptionHandler)

    isInstalled = true
  }

  func uninstall() {
    guard isInstalled else { return }
    erne_uninstall_signal_handler()
    // Swift cannot pass a stored optional C function pointer directly
    // back to NSSetUncaughtExceptionHandler — the type checker rejects
    // it as a closure-with-capture. We clear our handler regardless;
    // any previous chain is lost across an explicit uninstall, but
    // install/uninstall in the same session is uncommon.
    NSSetUncaughtExceptionHandler(nil)
    previousNSExceptionHandler = nil
    isInstalled = false
  }

  /// Reads any persisted crash reports and returns them as plain
  /// dictionaries the Expo Modules API can hand to JS verbatim.
  func drainPersistedCrashes() -> [[String: Any]] {
    do {
      let reports = try CrashReportWriter.drainPersisted()
      return reports.map { $0.toDictionary() }
    } catch {
      NSLog("[ErneMonitor] drainPersistedCrashes failed: \(error)")
      return []
    }
  }

  func acknowledge(crashId: String) {
    CrashReportWriter.delete(id: crashId)
  }

  // MARK: - NSException

  /// Public-from-fileprivate seam for the top-level @_cdecl function.
  /// Not intended for direct callers.
  func handleNSExceptionPublic(_ exception: NSException) {
    handleNSException(exception)
  }

  private func handleNSException(_ exception: NSException) {
    // We're not in a signal context here, so we can use Foundation to
    // build the same on-disk format the C handler writes. This way the
    // SDK boot path treats POSIX signals and ObjC exceptions
    // identically.
    do {
      let path = try CrashReportWriter.currentCrashPath()
      var lines: [String] = []
      lines.append("ERNE_CRASH 1")
      lines.append("signal=6") // pretend it's SIGABRT — that's how iOS converts NSExceptions
      lines.append("code=0")
      lines.append("fault=0x0")
      lines.append("pid=\(ProcessInfo.processInfo.processIdentifier)")
      lines.append("time=\(Int(Date().timeIntervalSince1970))")
      let frames = exception.callStackReturnAddresses.map { addr -> String in
        return "0x" + String(addr.uintValue, radix: 16)
      }
      lines.append("frames=\(frames.count)")
      for f in frames {
        lines.append("f=\(f)")
      }
      lines.append("ERNE_END")
      let blob = (lines.joined(separator: "\n") + "\n")
      try blob.write(to: path, atomically: true, encoding: .utf8)
    } catch {
      NSLog("[ErneMonitor] failed to persist NSException: \(error)")
    }
  }
}
