import Foundation

/**
 Watchdog-based ANR detector for iOS.

 The strategy is the textbook one used by Sentry, Embrace, KSCrash:

   1. A background DispatchQueue ticks every `pingIntervalMs`.
   2. On each tick the watchdog posts a "still alive" closure to
      DispatchQueue.main and starts a deadline.
   3. If the main queue runs the closure within `thresholdMs`, the
      tick is healthy and the watchdog moves on.
   4. If the deadline elapses without the main queue having executed
      the ack, the main thread is presumed wedged. The watchdog
      captures the main thread call stack via Thread.callStackSymbols
      (best-effort — Swift cannot enumerate other threads' frames
      directly without private SPI) and reports an ANR.
   5. Multiple consecutive deadline misses are coalesced into a
      single report so we don't spam the SDK while the main thread
      is still wedged.

 Edge cases:
   - When the app goes to background we suspend ticking entirely so
     a backgrounded app doesn't false-positive while suspended by
     iOS.
   - When a debugger is attached we suspend ticking so breakpoints
     don't look like ANRs (cheap check via sysctl KERN_PROC).

 The detector does not block — every operation either runs on its
 own queue or is fired-and-forgotten on the main queue.
 */
final class ANRDetector {
  static let shared = ANRDetector()

  // Configuration
  private let pingIntervalMs: Int = 1000
  private let thresholdMs: Int = 5000

  // State
  private let queue = DispatchQueue(label: "dev.erne.monitor.anr",
                                    qos: .utility)
  private var timer: DispatchSourceTimer?
  private(set) var isRunning: Bool = false
  private var pendingTickId: UInt64 = 0
  private var lastAckedTickId: UInt64 = 0
  private var pendingTickStartedAt: TimeInterval = 0
  private var inAnrState: Bool = false
  private var notificationObservers: [NSObjectProtocol] = []
  private var isBackgrounded: Bool = false

  // Callback set by ErneMonitorModule so the detector can emit
  // events through the Expo Modules API event emitter without
  // creating a circular import.
  var onANR: ((_ durationMs: Int, _ stack: [String]) -> Void)?

  func start() {
    queue.async { [weak self] in
      guard let self = self else { return }
      guard !self.isRunning else { return }
      self.isRunning = true
      self.installAppStateObservers()
      self.scheduleTimer()
    }
  }

  func stop() {
    queue.async { [weak self] in
      guard let self = self else { return }
      guard self.isRunning else { return }
      self.isRunning = false
      self.timer?.cancel()
      self.timer = nil
      self.removeAppStateObservers()
      self.pendingTickId = 0
      self.lastAckedTickId = 0
      self.inAnrState = false
    }
  }

  // MARK: - Watchdog ticking

  private func scheduleTimer() {
    let t = DispatchSource.makeTimerSource(queue: queue)
    let interval = DispatchTimeInterval.milliseconds(pingIntervalMs)
    t.schedule(deadline: .now() + interval, repeating: interval)
    t.setEventHandler { [weak self] in
      self?.tick()
    }
    t.resume()
    timer = t
  }

  private func tick() {
    if isBackgrounded { return }
    if isDebuggerAttached() { return }

    // Check whether the previous outstanding tick has been acked.
    let outstanding = pendingTickId
    if outstanding != 0 && outstanding != lastAckedTickId {
      let now = Date().timeIntervalSince1970 * 1000
      let elapsed = now - pendingTickStartedAt
      if Int(elapsed) >= thresholdMs && !inAnrState {
        inAnrState = true
        // Capture main thread backtrace via pthread (not current thread).
        let rawStack = ANRDetector.captureMainThreadStack()
        let stack = rawStack.map { ANRDetector.demangle($0) }
        let durationMs = Int(elapsed)
        let cb = self.onANR
        DispatchQueue.global(qos: .utility).async {
          cb?(durationMs, stack)
        }
      }
      // Don't post a new tick while waiting on the old one.
      return
    }

    // Post a fresh tick.
    pendingTickId += 1
    let myId = pendingTickId
    pendingTickStartedAt = Date().timeIntervalSince1970 * 1000
    DispatchQueue.main.async { [weak self] in
      guard let self = self else { return }
      self.queue.async {
        self.lastAckedTickId = myId
        self.inAnrState = false
      }
    }
  }

  // MARK: - App state

  private func installAppStateObservers() {
    let center = NotificationCenter.default
    let bg = center.addObserver(
      forName: Notification.Name("UIApplicationDidEnterBackgroundNotification"),
      object: nil,
      queue: nil
    ) { [weak self] _ in
      self?.queue.async { self?.isBackgrounded = true }
    }
    let fg = center.addObserver(
      forName: Notification.Name("UIApplicationWillEnterForegroundNotification"),
      object: nil,
      queue: nil
    ) { [weak self] _ in
      self?.queue.async {
        self?.isBackgrounded = false
        self?.pendingTickId = 0
        self?.lastAckedTickId = 0
        self?.inAnrState = false
      }
    }
    notificationObservers = [bg, fg]
  }

  private func removeAppStateObservers() {
    let center = NotificationCenter.default
    for token in notificationObservers {
      center.removeObserver(token)
    }
    notificationObservers.removeAll()
  }

  // MARK: - Debugger detection

  private func isDebuggerAttached() -> Bool {
    var info = kinfo_proc()
    var size = MemoryLayout<kinfo_proc>.stride
    var mib: [Int32] = [CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()]
    let result = sysctl(&mib, UInt32(mib.count), &info, &size, nil, 0)
    if result != 0 { return false }
    return (info.kp_proc.p_flag & P_TRACED) != 0
  }

  // MARK: - Main thread stack capture

  /// Capture the main thread's backtrace from a background thread.
  /// Delegates to `MainThreadStackCapture`, which uses mach thread APIs to
  /// suspend the main thread, read its CPU state, walk the frame pointer
  /// chain, and symbolicate each address. Falls back to the watchdog's
  /// own stack with a diagnostic marker if any of that fails.
  static func captureMainThreadStack() -> [String] {
    return MainThreadStackCapture.capture()
  }

  /// Demangle Swift symbols for human-readable output.
  /// Converts `$s11ErneMonitor11ANRDetectorC4tick...` → `ErneMonitor.ANRDetector.tick()`
  static func demangle(_ symbol: String) -> String {
    // Swift mangled symbols start with $s or _$s
    // Use the runtime demangler via swift_demangle if available
    guard let match = symbol.range(of: "\\$s[A-Za-z0-9_]+", options: .regularExpression) else {
      return symbol
    }
    let mangled = String(symbol[match])
    if let demangled = ANRDetector.swiftDemangle(mangled) {
      return symbol.replacingCharacters(in: match, with: demangled)
    }
    return symbol
  }

  /// Call the Swift runtime demangler.
  private static func swiftDemangle(_ mangled: String) -> String? {
    return mangled.utf8CString.withUnsafeBufferPointer { buf in
      guard let ptr = buf.baseAddress else { return nil }
      // swift_demangle is a public C function in the Swift runtime
      guard let result = swift_demangle(ptr, mangled.utf8.count, nil, nil, 0) else {
        return nil
      }
      let str = String(cString: result)
      free(result)
      return str
    }
  }
}

// Swift runtime demangler — public C symbol
@_silgen_name("swift_demangle")
private func swift_demangle(
  _ mangledName: UnsafePointer<CChar>,
  _ mangledNameLength: Int,
  _ outputBuffer: UnsafeMutablePointer<CChar>?,
  _ outputBufferSize: UnsafeMutablePointer<Int>?,
  _ flags: UInt32
) -> UnsafeMutablePointer<CChar>?
