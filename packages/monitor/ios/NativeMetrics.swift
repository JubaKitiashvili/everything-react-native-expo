import Foundation
import UIKit
import Darwin

/**
 Real device metrics for iOS — replaces the placeholder values that
 ErneMonitorModule.sampleMetrics returned in the Task 38 shell.

 - CPU: per-process CPU percentage from `task_info`
       (TASK_BASIC_INFO + TASK_THREAD_TIMES_INFO).
 - Memory: resident set size from `task_vm_info`. Total physical
       memory comes from `ProcessInfo.physicalMemory`.
 - Thermal state: ProcessInfo.thermalState. We post a notification
       when it changes so the JS side can react instantly.
 - Battery: UIDevice.current.batteryLevel + .batteryState (requires
       isBatteryMonitoringEnabled = true, which we flip on start).
 - Disk: NSFileManager attributesOfFileSystem(forPath:).

 Sampling target is <5ms — every call here is a synchronous
 syscall, none of them touch Foundation collections in a hot loop.
 */
enum NativeMetrics {
  static func currentSnapshot() -> [String: Any?] {
    return [
      "cpuUsagePercent": cpuUsage(),
      "memoryUsedBytes": memoryResident(),
      "memoryAvailableBytes": memoryAvailable(),
      "memoryTotalBytes": Int64(ProcessInfo.processInfo.physicalMemory),
      "thermalState": thermalState(),
      "batteryLevel": batteryLevel(),
      "batteryCharging": batteryCharging(),
      "diskAvailableBytes": diskAvailable(),
      "diskTotalBytes": diskTotal(),
      "sampledAt": Int(Date().timeIntervalSince1970 * 1000),
    ]
  }

  // MARK: - CPU

  static func cpuUsage() -> Double? {
    var threadList: thread_act_array_t?
    var threadCount = mach_msg_type_number_t(0)
    let task = mach_task_self_
    let kr = task_threads(task, &threadList, &threadCount)
    if kr != KERN_SUCCESS { return nil }
    defer {
      if let list = threadList {
        let size = vm_size_t(MemoryLayout<thread_t>.size) * vm_size_t(threadCount)
        vm_deallocate(task, vm_address_t(bitPattern: list), size)
      }
    }
    var totalUsage: Double = 0
    for i in 0..<Int(threadCount) {
      var info = thread_basic_info()
      var infoCount = mach_msg_type_number_t(THREAD_INFO_MAX)
      let kr2 = withUnsafeMutablePointer(to: &info) {
        $0.withMemoryRebound(to: integer_t.self, capacity: Int(THREAD_INFO_MAX)) {
          thread_info(threadList![i], thread_flavor_t(THREAD_BASIC_INFO), $0, &infoCount)
        }
      }
      if kr2 != KERN_SUCCESS { continue }
      if (info.flags & TH_FLAGS_IDLE) != 0 { continue }
      totalUsage += Double(info.cpu_usage) / Double(TH_USAGE_SCALE) * 100.0
    }
    return totalUsage
  }

  // MARK: - Memory

  static func memoryResident() -> Int64? {
    var info = task_vm_info_data_t()
    var count = mach_msg_type_number_t(MemoryLayout<task_vm_info_data_t>.size / MemoryLayout<integer_t>.size)
    let kr = withUnsafeMutablePointer(to: &info) {
      $0.withMemoryRebound(to: integer_t.self, capacity: Int(count)) {
        task_info(mach_task_self_, task_flavor_t(TASK_VM_INFO), $0, &count)
      }
    }
    if kr != KERN_SUCCESS { return nil }
    return Int64(info.phys_footprint)
  }

  static func memoryAvailable() -> Int64? {
    // Best-effort: total - phys_footprint. iOS does not give a real
    // "free RAM" number — only the OOM killer knows. The Sampler uses
    // this only as a relative pressure hint.
    let total = Int64(ProcessInfo.processInfo.physicalMemory)
    if let used = memoryResident() {
      return max(0, total - used)
    }
    return nil
  }

  // MARK: - Thermal

  static func thermalState() -> String {
    switch ProcessInfo.processInfo.thermalState {
    case .nominal: return "nominal"
    case .fair: return "fair"
    case .serious: return "serious"
    case .critical: return "critical"
    @unknown default: return "unknown"
    }
  }

  // MARK: - Battery

  static func ensureBatteryMonitoring() {
    DispatchQueue.main.async {
      UIDevice.current.isBatteryMonitoringEnabled = true
    }
  }

  static func batteryLevel() -> Double? {
    let lvl = UIDevice.current.batteryLevel
    return lvl < 0 ? nil : Double(lvl)
  }

  static func batteryCharging() -> Bool? {
    switch UIDevice.current.batteryState {
    case .charging, .full: return true
    case .unplugged: return false
    case .unknown: return nil
    @unknown default: return nil
    }
  }

  // MARK: - Disk

  static func diskAvailable() -> Int64? {
    do {
      let url = URL(fileURLWithPath: NSHomeDirectory())
      let values = try url.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey])
      if let v = values.volumeAvailableCapacityForImportantUsage { return v }
      return nil
    } catch { return nil }
  }

  static func diskTotal() -> Int64? {
    do {
      let url = URL(fileURLWithPath: NSHomeDirectory())
      let values = try url.resourceValues(forKeys: [.volumeTotalCapacityKey])
      if let v = values.volumeTotalCapacity { return Int64(v) }
      return nil
    } catch { return nil }
  }
}

/**
 Observes ProcessInfo.thermalStateDidChangeNotification and posts a
 thermal-change event through ErneMonitorModule. Lifetime is owned
 by the module — install/uninstall match the start/stop pair.
 */
final class ThermalObserver {
  static let shared = ThermalObserver()
  var onChange: ((_ state: String) -> Void)?
  private var token: NSObjectProtocol?
  private(set) var lastState: String = "unknown"

  func install() {
    if token != nil { return }
    token = NotificationCenter.default.addObserver(
      forName: ProcessInfo.thermalStateDidChangeNotification,
      object: nil,
      queue: .main
    ) { [weak self] _ in
      let state = NativeMetrics.thermalState()
      if state != self?.lastState {
        self?.lastState = state
        self?.onChange?(state)
      }
    }
    lastState = NativeMetrics.thermalState()
  }

  func uninstall() {
    if let t = token {
      NotificationCenter.default.removeObserver(t)
      token = nil
    }
    onChange = nil
  }
}
