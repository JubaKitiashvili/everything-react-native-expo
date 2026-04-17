import Darwin
import Foundation

/**
 * Captures the main thread's stack from a background thread using mach
 * thread APIs. This is what lets an ANR watchdog show the real stack of
 * whatever wedged the main thread, instead of showing the watchdog's own
 * (useless) call site.
 *
 * Strategy (same as KSCrash / Sentry / Embrace):
 *   1. At init, store the mach thread port of the main thread so we can
 *      find it reliably later (Thread.main doesn't expose the port).
 *   2. At capture time (from watchdog thread):
 *        a) thread_suspend(mainThreadPort) — pause the main thread
 *        b) thread_get_state(...) — read PC/LR/FP/SP for the current CPU
 *        c) walk the frame pointer chain to collect return addresses
 *        d) thread_resume(mainThreadPort) — release the main thread
 *        e) symbolicate each address via dladdr
 *
 * All failures fall back gracefully to the watchdog's own stack with a
 * marker, so the SDK never produces a fatal error trying to introspect a
 * stuck app.
 */
enum MainThreadStackCapture {
  /// Mach thread port of the main thread — captured once at module load.
  /// Nil on non-iOS platforms or when capture failed.
  private static let mainThreadPort: thread_t? = {
    if Thread.isMainThread {
      return mach_thread_self()
    }
    // Not on main — dispatch_sync to capture, with a hard timeout so we
    // can't deadlock during init.
    var port: thread_t = 0
    let sem = DispatchSemaphore(value: 0)
    DispatchQueue.main.async {
      port = mach_thread_self()
      sem.signal()
    }
    if sem.wait(timeout: .now() + .milliseconds(500)) == .timedOut {
      return nil
    }
    return port == 0 ? nil : port
  }()

  /// Call once from the main thread at app init to make the port
  /// capture reliable.
  static func primeOnMainThread() {
    _ = mainThreadPort
  }

  /// Returns an array of symbolicated frames from the main thread, or a
  /// fallback watchdog stack prefixed with a marker when capture fails.
  static func capture() -> [String] {
    guard let port = mainThreadPort else {
      return fallbackStack(reason: "no_port")
    }

    let suspendResult = thread_suspend(port)
    if suspendResult != KERN_SUCCESS {
      return fallbackStack(reason: "suspend_failed_\(suspendResult)")
    }
    defer { _ = thread_resume(port) }

    var addresses: [UInt] = []
    readMainThreadBacktrace(port: port, into: &addresses)

    if addresses.isEmpty {
      return fallbackStack(reason: "empty_backtrace")
    }
    return symbolicate(addresses: addresses)
  }

  // MARK: - Backtrace walking

  private static func readMainThreadBacktrace(
    port: thread_t,
    into addresses: inout [UInt]
  ) {
    #if arch(arm64)
      var state = arm_thread_state64_t()
      var count = mach_msg_type_number_t(
        MemoryLayout<arm_thread_state64_t>.size / MemoryLayout<natural_t>.size
      )
      let kr = withUnsafeMutablePointer(to: &state) {
        $0.withMemoryRebound(to: natural_t.self, capacity: Int(count)) { ptr in
          thread_get_state(
            port,
            ARM_THREAD_STATE64,
            ptr,
            &count
          )
        }
      }
      guard kr == KERN_SUCCESS else { return }
      let pc = UInt(state.__pc)
      let lr = UInt(state.__lr)
      let fp = UInt(state.__fp)
      walkFramePointerChain(pc: pc, lr: lr, fp: fp, into: &addresses)
    #elseif arch(x86_64)
      var state = x86_thread_state64_t()
      var count = mach_msg_type_number_t(
        MemoryLayout<x86_thread_state64_t>.size / MemoryLayout<natural_t>.size
      )
      let kr = withUnsafeMutablePointer(to: &state) {
        $0.withMemoryRebound(to: natural_t.self, capacity: Int(count)) { ptr in
          thread_get_state(
            port,
            x86_THREAD_STATE64,
            ptr,
            &count
          )
        }
      }
      guard kr == KERN_SUCCESS else { return }
      let pc = UInt(state.__rip)
      let fp = UInt(state.__rbp)
      walkFramePointerChain(pc: pc, lr: 0, fp: fp, into: &addresses)
    #else
      // Unsupported architecture — leave the buffer empty so we fall back.
      return
    #endif
  }

  /// Walks the frame-pointer chain: each frame has `[saved_fp, return_addr]`
  /// at the frame pointer. Terminates when fp is zero, unreadable, or
  /// appears to go backwards (corruption).
  private static func walkFramePointerChain(
    pc: UInt,
    lr: UInt,
    fp: UInt,
    into addresses: inout [UInt]
  ) {
    let maxFrames = 64
    addresses.append(pc)
    if lr != 0 { addresses.append(lr) }

    var currentFp = fp
    var previousFp: UInt = 0
    while currentFp != 0 && addresses.count < maxFrames {
      // Sanity: each frame pointer should move upward in the stack (higher
      // address). If it moves backward we've hit garbage — stop.
      if previousFp != 0 && currentFp <= previousFp { break }
      guard let saved = readWord(at: currentFp) else { break }
      guard let returnAddr = readWord(at: currentFp + UInt(MemoryLayout<UInt>.size)) else {
        break
      }
      if returnAddr == 0 { break }
      addresses.append(returnAddr)
      previousFp = currentFp
      currentFp = saved
    }
  }

  /// Reads a word at the given address via `mach_vm_read_overwrite` so
  /// a bad address returns an error instead of crashing the watchdog.
  private static func readWord(at address: UInt) -> UInt? {
    var result: UInt = 0
    var readSize: mach_vm_size_t = mach_vm_size_t(MemoryLayout<UInt>.size)
    let kr = withUnsafeMutablePointer(to: &result) { dstPtr -> Int32 in
      let dstAddress = mach_vm_address_t(UInt(bitPattern: UnsafeRawPointer(dstPtr)))
      return mach_vm_read_overwrite(
        mach_task_self_,
        mach_vm_address_t(address),
        mach_vm_size_t(MemoryLayout<UInt>.size),
        dstAddress,
        &readSize
      )
    }
    return kr == KERN_SUCCESS ? result : nil
  }

  // MARK: - Symbolication

  private static func symbolicate(addresses: [UInt]) -> [String] {
    return addresses.enumerated().map { idx, addr in
      var info = Dl_info()
      let ok = dladdr(UnsafeRawPointer(bitPattern: addr), &info) != 0
      if !ok {
        return String(format: "%-3d ??? 0x%016llx", idx, UInt64(addr))
      }
      let image = info.dli_fname.flatMap {
        String(cString: $0).components(separatedBy: "/").last
      } ?? "???"
      let symbol = info.dli_sname.flatMap { String(cString: $0) } ?? "???"
      let offset = addr - UInt(bitPattern: info.dli_saddr)
      let demangled = demangleIfSwift(symbol)
      return String(
        format: "%-3d %-30s 0x%016llx %@ + %lu",
        idx,
        image,
        UInt64(addr),
        demangled,
        offset
      )
    }
  }

  private static func demangleIfSwift(_ symbol: String) -> String {
    guard symbol.hasPrefix("$s") || symbol.hasPrefix("_$s") else {
      return symbol
    }
    return symbol.utf8CString.withUnsafeBufferPointer { buf in
      guard let ptr = buf.baseAddress else { return symbol }
      guard let result = swift_demangle(ptr, symbol.utf8.count, nil, nil, 0) else {
        return symbol
      }
      let str = String(cString: result)
      free(result)
      return str
    }
  }

  private static func fallbackStack(reason: String) -> [String] {
    var stack = Thread.callStackSymbols
    stack.insert(
      "[main-thread capture unavailable — \(reason); falling back to watchdog stack]",
      at: 0
    )
    return stack
  }
}

@_silgen_name("swift_demangle")
private func swift_demangle(
  _ mangledName: UnsafePointer<CChar>,
  _ mangledNameLength: Int,
  _ outputBuffer: UnsafeMutablePointer<CChar>?,
  _ outputBufferSize: UnsafeMutablePointer<Int>?,
  _ flags: UInt32
) -> UnsafeMutablePointer<CChar>?
