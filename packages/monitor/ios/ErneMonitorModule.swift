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
    }

    Function("stopNativeMonitoring") { [weak self] () -> Void in
      guard let self = self else { return }
      self.isActive = false
      CrashHandler.shared.uninstall()
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

    // Synchronous getter — fine because we only read cheap APIs.
    // Task 42 will replace the body with real task_info sampling and
    // thermal-state queries; for now we return what ProcessInfo can
    // give us without touching Mach APIs.
    Function("getNativeMetrics") { [weak self] () -> [String: Any?] in
      return ErneMonitorModule.sampleMetrics(isActive: self?.isActive ?? false)
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
