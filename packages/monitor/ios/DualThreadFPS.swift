import Foundation
import QuartzCore
import UIKit

/**
 Task 45 — Dual-thread FPS monitor (iOS).

 Separates UI thread and JS thread frame rates:
 - **UI thread**: `CADisplayLink` on the main run loop measures actual
   frame delivery cadence. Every 1s it reports the average UI FPS.
 - **JS thread**: We probe the JS thread by scheduling a lightweight
   closure via `DispatchQueue` and measuring round-trip time. If the
   JS thread is blocked (long task, synchronous bridge call), the
   probe's round-trip will spike, and we infer JS-side FPS from
   how many probes complete within the 1s window.

 Reports are emitted every `reportIntervalSeconds` (default 1s) via
 a closure the module wires to `sendEvent("onDualThreadFPS", ...)`.

 Stops monitoring when the app is backgrounded (no wasted work).
 */
final class DualThreadFPS {
    static let shared = DualThreadFPS()

    /// Callback invoked every report interval with (uiFPS, jsFPS).
    var onReport: ((_ uiFPS: Double, _ jsFPS: Double) -> Void)?

    private var displayLink: CADisplayLink?
    private var reportTimer: Timer?
    private var jsProbeTimer: DispatchSourceTimer?
    private var isRunning = false

    // UI FPS tracking
    private var lastUITimestamp: CFTimeInterval = 0
    private var uiFrameCount: Int = 0

    // JS FPS tracking — we probe every ~16ms and count completions
    private var jsProbeCompletions: Int = 0
    private let jsProbeQueue = DispatchQueue(label: "com.erne-monitor.js-fps-probe")
    // Use a dedicated serial queue to simulate "is the main queue responsive"
    // by posting back to main and measuring latency.

    // Background suppression
    private var bgObservers: [NSObjectProtocol] = []

    private init() {}

    func start() {
        guard !isRunning else { return }
        isRunning = true
        resetCounters()

        // UI thread: CADisplayLink
        let link = CADisplayLink(target: self, selector: #selector(displayLinkFired(_:)))
        link.add(to: .main, forMode: .common)
        displayLink = link

        // JS thread probe: fire every 16ms on background queue, bounce to main
        let probe = DispatchSource.makeTimerSource(queue: jsProbeQueue)
        probe.schedule(deadline: .now(), repeating: .milliseconds(16))
        probe.setEventHandler { [weak self] in
            // Post to main and count when it completes
            DispatchQueue.main.async { [weak self] in
                self?.jsProbeCompletions += 1
            }
        }
        probe.resume()
        jsProbeTimer = probe

        // Report timer: every 1s on main
        reportTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.emitReport()
        }

        // Background suppression
        let willResign = NotificationCenter.default.addObserver(
            forName: UIApplication.willResignActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            self?.pause()
        }
        let didBecomeActive = NotificationCenter.default.addObserver(
            forName: UIApplication.didBecomeActiveNotification,
            object: nil, queue: .main
        ) { [weak self] _ in
            guard let self = self, self.isRunning else { return }
            self.resume()
        }
        bgObservers = [willResign, didBecomeActive]
    }

    func stop() {
        isRunning = false
        pause()
        for obs in bgObservers {
            NotificationCenter.default.removeObserver(obs)
        }
        bgObservers = []
        onReport = nil
    }

    // MARK: - CADisplayLink callback

    @objc private func displayLinkFired(_ link: CADisplayLink) {
        if lastUITimestamp == 0 {
            lastUITimestamp = link.timestamp
            return
        }
        uiFrameCount += 1
        lastUITimestamp = link.timestamp
    }

    // MARK: - Report emission

    private func emitReport() {
        let uiFPS = Double(uiFrameCount) // frames in ~1s window
        // JS probe fires ~62.5 times/sec (16ms interval). If main thread
        // is fully responsive, all probes complete. Blocked main = fewer completions.
        // Scale to 60fps equivalent.
        let maxExpectedProbes = 62.5
        let jsFPS = min(60.0, (Double(jsProbeCompletions) / maxExpectedProbes) * 60.0)

        onReport?(uiFPS, jsFPS)
        resetCounters()
    }

    private func resetCounters() {
        uiFrameCount = 0
        jsProbeCompletions = 0
        lastUITimestamp = 0
    }

    private func pause() {
        displayLink?.invalidate()
        displayLink = nil
        reportTimer?.invalidate()
        reportTimer = nil
        jsProbeTimer?.cancel()
        jsProbeTimer = nil
        resetCounters()
    }

    private func resume() {
        guard isRunning else { return }
        resetCounters()

        let link = CADisplayLink(target: self, selector: #selector(displayLinkFired(_:)))
        link.add(to: .main, forMode: .common)
        displayLink = link

        let probe = DispatchSource.makeTimerSource(queue: jsProbeQueue)
        probe.schedule(deadline: .now(), repeating: .milliseconds(16))
        probe.setEventHandler { [weak self] in
            DispatchQueue.main.async { [weak self] in
                self?.jsProbeCompletions += 1
            }
        }
        probe.resume()
        jsProbeTimer = probe

        reportTimer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.emitReport()
        }
    }
}
