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

    Events("onNativeCrash", "onANRDetected", "onThermalStateChange")

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
    }

    Function("stopNativeMonitoring") { [weak self] () -> Void in
      guard let self = self else { return }
      self.isActive = false
      CrashHandler.shared.uninstall()
      ANRDetector.shared.stop()
      ANRDetector.shared.onANR = nil
      ThermalObserver.shared.uninstall()
      SpanLog.shared.uninstall()
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
