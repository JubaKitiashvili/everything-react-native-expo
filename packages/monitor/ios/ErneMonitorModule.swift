import ExpoModulesCore

/**
 Task 38 — Expo Module API shell for @erne/monitor.

 This file is deliberately minimal: it registers the module name, the
 three methods the JS wrapper (`ErneMonitorNative`) will call, and the
 three events it will emit. The real implementations land in:

   - Task 40 CrashHandler        → onNativeCrash
   - Task 41 ANRDetector          → onANRDetected
   - Task 42 NativeMetrics        → getNativeMetrics + onThermalStateChange
   - Task 43 SpanSnapshot         → span persistence

 Until those tasks ship, the module initializes lazily (no background
 work in `init`), `startNativeMonitoring` just flips an internal flag,
 and `getNativeMetrics` returns a snapshot populated with the handful
 of values we can cheaply read today (ProcessInfo + UIDevice).

 The module is discovered by `expo-modules-autolinking` through the
 `expo-module.config.json` at the package root.
 */
public final class ErneMonitorModule: Module {
  private var isActive: Bool = false
  private let startedAt: Date = Date()

  public func definition() -> ModuleDefinition {
    Name("ErneMonitor")

    Events("onNativeCrash", "onANRDetected", "onThermalStateChange", "onDualThreadFPS", "onFabricCommit", "onReplayFrame")

    // Called by ErneMonitorNative.startNativeMonitoring().
    // In Task 38 this only flips a flag — Task 40 will install the
    // signal handler here, Task 41 the ANR watchdog, Task 42 the
    // thermal-state observer.
    Function("startNativeMonitoring") { [weak self] () -> Void in
      guard let self = self else { return }
      self.isActive = true
      // Task 40: install POSIX signal + NSException chain.
      CrashHandler.shared.install()
      // Task 41: ANR watchdog. The detector emits via the closure
      // we install here, which calls the module's `sendEvent` —
      // captured weakly to avoid retain cycles.
      ANRDetector.shared.onANR = { [weak self] durationMs, stack in
        self?.sendEvent("onANRDetected", [
          "durationMs": durationMs,
          "mainThreadStack": stack,
          "screen": NSNull(),
          "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ])
      }
      ANRDetector.shared.start()

      // Task 42: enable battery monitoring + thermal-change observer.
      NativeMetrics.ensureBatteryMonitoring()
      ThermalObserver.shared.onChange = { [weak self] state in
        self?.sendEvent("onThermalStateChange", [
          "state": state,
          "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ])
      }
      ThermalObserver.shared.install()

      // Task 43: install the span log so JS startSpan calls have a
      // file path resolved before the first call lands.
      SpanLog.shared.install()

      // Task 45: dual-thread FPS monitor.
      DualThreadFPS.shared.onReport = { [weak self] uiFPS, jsFPS in
        self?.sendEvent("onDualThreadFPS", [
          "uiFPS": uiFPS,
          "jsFPS": jsFPS,
          "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ])
      }
      DualThreadFPS.shared.start()

      // Task 46: Fabric commit tracker.
      FabricCommitTracker.shared.onReport = { [weak self] commitCount, avg, max, yoga, thrashing in
        self?.sendEvent("onFabricCommit", [
          "commitCount": commitCount,
          "avgCommitDuration": avg,
          "maxCommitDuration": max,
          "yogaLayoutTime": yoga,
          "isLayoutThrashing": thrashing,
          "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ])
      }
      FabricCommitTracker.shared.start()
    }

    Function("stopNativeMonitoring") { [weak self] () -> Void in
      guard let self = self else { return }
      self.isActive = false
      CrashHandler.shared.uninstall()
      ANRDetector.shared.stop()
      ANRDetector.shared.onANR = nil
      ThermalObserver.shared.uninstall()
      SpanLog.shared.uninstall()
      DualThreadFPS.shared.stop()
      FabricCommitTracker.shared.stop()
      ReplayCapture.shared.stopCapture()
    }

    // Drain crash reports persisted by the previous run. JS calls this
    // once at SDK boot via NativeCrashGateway.replayPersistedCrashes().
    AsyncFunction("drainPersistedCrashes") { () -> [[String: Any]] in
      return CrashHandler.shared.drainPersistedCrashes()
    }

    // Delete a persisted crash by its file id once JS has dispatched it.
    Function("acknowledgePersistedCrash") { (id: String) -> Void in
      CrashHandler.shared.acknowledge(crashId: id)
    }

    // Task 43: span persistence — JS calls these on every span lifecycle
    // event so the native side can write to its append-only mmap log.
    Function("startSpan") { (id: String, name: String, kind: String,
                             parentId: String?, startedAtMs: Double) -> Void in
      SpanLog.shared.startSpan(
        id: id, name: name, kind: kind,
        parentId: parentId, startedAtMs: Int64(startedAtMs)
      )
    }

    Function("endSpan") { (id: String, endedAtMs: Double) -> Void in
      SpanLog.shared.endSpan(id: id, endedAtMs: Int64(endedAtMs))
    }

    Function("updateSpan") { (id: String, attribute: String, value: String) -> Void in
      SpanLog.shared.updateSpan(id: id, attribute: attribute, value: value)
    }

    AsyncFunction("drainInterruptedSpans") { () -> [[String: Any]] in
      return SpanLog.shared.drainInterrupted()
    }

    // Task 42: real metrics from Mach APIs (task_info, task_vm_info,
    // ProcessInfo.thermalState, UIDevice battery, NSFileManager disk).
    Function("getNativeMetrics") { () -> [String: Any?] in
      return NativeMetrics.currentSnapshot()
    }

    // ── Task 47: Replay Capture ───────────────────────────────────

    Function("startReplayCapture") { [weak self] (intervalMs: Int,
                                                   maskRegions: [[String: Any]]) -> Void in
      ReplayCapture.shared.onFrame = { [weak self] base64, touches, timestamp in
        self?.sendEvent("onReplayFrame", [
          "frameBase64": base64,
          "touchEvents": touches,
          "timestamp": timestamp,
        ])
      }
      ReplayCapture.shared.startCapture(intervalMs: intervalMs, maskRegions: maskRegions)
    }

    Function("stopReplayCapture") { () -> Void in
      ReplayCapture.shared.stopCapture()
    }

    Function("updateReplayMaskRegions") { (regions: [[String: Any]]) -> Void in
      ReplayCapture.shared.updateMaskRegions(regions)
    }

    Function("recordReplayTouch") { (x: Double, y: Double, phase: String) -> Void in
      ReplayCapture.shared.recordTouch(x: x, y: y, phase: phase)
    }

    // ── Diagnostics (dev-only) ──────────────────────────────────
    // Standard SDK integration-test surface — every major monitoring
    // SDK ships these (Sentry.nativeCrash, Embrace.testCrash, etc.).
    // Gated by #if DEBUG so they compile out of release builds.

    #if DEBUG
    Function("triggerTestCrash") {
      // Force a SIGSEGV — the installed signal handler will catch it,
      // persist the report, and the next launch will drain it.
      let ptr = UnsafeMutableRawPointer(bitPattern: 0xDEAD)
      ptr?.storeBytes(of: 42, as: Int.self)
    }

    Function("triggerTestANR") { (durationSeconds: Double) -> Void in
      // Block the main thread for the requested duration. The ANR
      // watchdog (1s ping / 5s threshold) will fire if duration ≥ 5.
      Thread.sleep(forTimeInterval: durationSeconds)
    }

    Function("triggerTestSpanCrash") { [weak self] (spanName: String) -> Void in
      guard self != nil else { return }
      // Start a span then crash — on next launch, drainInterruptedSpans
      // should return this span as interrupted.
      let spanId = UUID().uuidString.lowercased()
      let now = Int64(Date().timeIntervalSince1970 * 1000)
      SpanLog.shared.startSpan(
        id: spanId, name: spanName, kind: "internal",
        parentId: nil, startedAtMs: now
      )
      // Crash via SIGABRT after a brief delay so the span log flushes.
      DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
        abort()
      }
    }
    #endif
  }

  // MARK: - Helpers

  private static func sampleMetrics(isActive _: Bool) -> [String: Any?] {
    let process = ProcessInfo.processInfo
    let physicalMemory = process.physicalMemory

    var thermalState: String = "unknown"
    switch process.thermalState {
    case .nominal: thermalState = "nominal"
    case .fair: thermalState = "fair"
    case .serious: thermalState = "serious"
    case .critical: thermalState = "critical"
    @unknown default: thermalState = "unknown"
    }

    let sampledAtMillis = Int(Date().timeIntervalSince1970 * 1000)

    return [
      "cpuUsagePercent": nil,
      "memoryUsedBytes": nil,
      "memoryAvailableBytes": nil,
      "memoryTotalBytes": Int64(physicalMemory),
      "thermalState": thermalState,
      "batteryLevel": nil,
      "batteryCharging": nil,
      "diskAvailableBytes": nil,
      "diskTotalBytes": nil,
      "sampledAt": sampledAtMillis,
    ]
  }
}
