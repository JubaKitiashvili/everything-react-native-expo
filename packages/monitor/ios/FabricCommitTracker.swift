import Foundation
import QuartzCore
import UIKit

/**
 Task 46 — Fabric Commit Tracker (iOS).

 Measures native rendering pipeline commit frequency and layout duration
 using a `CFRunLoopObserver` that brackets the main run loop's layout and
 display passes. Each run-loop iteration that triggers layout constitutes
 one "commit" in the Fabric rendering model.

 Reports:
   - `commitCount`: number of layout passes in the report window
   - `avgCommitDuration`: average time per layout pass (ms)
   - `maxCommitDuration`: worst-case layout pass (ms)
   - `yogaLayoutTime`: cumulative layout time (ms) — on iOS this is the
     total time spent in `layoutSubviews` / `updateConstraints` calls
   - `isLayoutThrashing`: true if >10 commits/sec sustained for >2s

 Batched reports every 2 seconds to minimize overhead.
 Graceful no-op if called on a non-Fabric app (always works since the
 run-loop observer is agnostic to the renderer).
 */
final class FabricCommitTracker {
    static let shared = FabricCommitTracker()

    /// Callback invoked every 2s with commit statistics.
    var onReport: ((_ commitCount: Int,
                    _ avgCommitDuration: Double,
                    _ maxCommitDuration: Double,
                    _ yogaLayoutTime: Double,
                    _ isLayoutThrashing: Bool) -> Void)?

    private var observer: CFRunLoopObserver?
    private var reportTimer: Timer?
    private var isRunning = false

    // Per-report-window accumulators
    private var commitCount: Int = 0
    private var totalDuration: Double = 0
    private var maxDuration: Double = 0
    private var layoutPassStart: CFTimeInterval = 0

    // Layout thrashing detection: >10 commits/sec for >2s
    private var thrashingStartDate: Date?
    private let thrashingCommitsPerSec = 10
    private let thrashingDurationSec: TimeInterval = 2.0

    private init() {}

    func start() {
        guard !isRunning else { return }
        isRunning = true
        resetCounters()

        // Observe the run loop to bracket layout/display passes.
        // kCFRunLoopBeforeTimers fires before layout; kCFRunLoopBeforeWaiting
        // fires after all layout + display work is done.
        let activities: CFRunLoopActivity = [.beforeTimers, .beforeWaiting, .exit]
        observer = CFRunLoopObserverCreateWithHandler(
            kCFAllocatorDefault,
            activities.rawValue,
            true,  // repeats
            0,     // order
            { [weak self] _, activity in
                self?.handleRunLoopActivity(activity)
            }
        )
        if let obs = observer {
            CFRunLoopAddObserver(CFRunLoopGetMain(), obs, .commonModes)
        }

        // Report every 2 seconds
        reportTimer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.emitReport()
        }
    }

    func stop() {
        isRunning = false
        if let obs = observer {
            CFRunLoopRemoveObserver(CFRunLoopGetMain(), obs, .commonModes)
        }
        observer = nil
        reportTimer?.invalidate()
        reportTimer = nil
        onReport = nil
        resetCounters()
    }

    // MARK: - Run Loop Observation

    private func handleRunLoopActivity(_ activity: CFRunLoopActivity) {
        if activity == .beforeTimers {
            // Layout pass starting — record timestamp
            layoutPassStart = CACurrentMediaTime()
        } else if activity == .beforeWaiting || activity == .exit {
            // Layout + display pass complete
            guard layoutPassStart > 0 else { return }
            let duration = (CACurrentMediaTime() - layoutPassStart) * 1000.0 // ms
            layoutPassStart = 0

            // Only count meaningful layout passes (>0.1ms avoids idle loops)
            if duration > 0.1 {
                commitCount += 1
                totalDuration += duration
                if duration > maxDuration {
                    maxDuration = duration
                }
            }
        }
    }

    // MARK: - Report

    private func emitReport() {
        guard isRunning else { return }
        let count = commitCount
        let avg = count > 0 ? totalDuration / Double(count) : 0
        let max = maxDuration
        let yoga = totalDuration // On iOS, total layout time ≈ Yoga time

        // Thrashing detection: >10 commits/sec for >2s
        let commitsPerSec = Double(count) / 2.0 // 2s window
        var isLayoutThrashing = false
        if commitsPerSec > Double(thrashingCommitsPerSec) {
            if let start = thrashingStartDate {
                if Date().timeIntervalSince(start) >= thrashingDurationSec {
                    isLayoutThrashing = true
                }
            } else {
                thrashingStartDate = Date()
            }
        } else {
            thrashingStartDate = nil
        }

        onReport?(count, avg, max, yoga, isLayoutThrashing)
        resetCounters()
    }

    private func resetCounters() {
        commitCount = 0
        totalDuration = 0
        maxDuration = 0
        layoutPassStart = 0
    }
}
