import Foundation
import UIKit

/**
 Task 47 — Session Replay Capture (iOS).

 Captures low-resolution screenshots at a configurable interval and
 records touch coordinates as an overlay timeline.

 Key design decisions:
 - Uses `UIView.drawHierarchy(in:afterScreenUpdates:)` for capture —
   captures the composited view tree including native components.
 - Frames are JPEG-compressed at quality 0.3 and half resolution to
   keep storage small (~10-30KB per frame).
 - Ring buffer of max 30 seconds (at 1fps = 30 frames).
 - PII masking is applied by drawing opaque rectangles over mask
   regions before JPEG encoding.
 - Respects consent: the JS layer checks `consent.replay` before
   calling `startCapture`.
 */
final class ReplayCapture {
    static let shared = ReplayCapture()

    /// Called with each captured frame (base64 JPEG, touch events since last frame).
    var onFrame: ((_ frameBase64: String,
                   _ touchEvents: [[String: Any]],
                   _ timestamp: Int) -> Void)?

    private var captureTimer: Timer?
    private var isCapturing = false
    private var captureInterval: TimeInterval = 1.0

    // Touch recording
    private var pendingTouches: [[String: Any]] = []
    private var swizzled = false

    // Mask regions (updated from JS)
    private var maskRegions: [[String: Any]] = []

    private init() {}

    func startCapture(intervalMs: Int, maskRegions: [[String: Any]]) {
        guard !isCapturing else { return }
        isCapturing = true
        self.captureInterval = max(0.2, Double(intervalMs) / 1000.0) // min 200ms (5fps)
        self.maskRegions = maskRegions
        pendingTouches = []

        captureTimer = Timer.scheduledTimer(
            withTimeInterval: captureInterval,
            repeats: true
        ) { [weak self] _ in
            self?.captureFrame()
        }
    }

    func stopCapture() {
        isCapturing = false
        captureTimer?.invalidate()
        captureTimer = nil
        pendingTouches = []
        onFrame = nil
    }

    func updateMaskRegions(_ regions: [[String: Any]]) {
        self.maskRegions = regions
    }

    func recordTouch(x: Double, y: Double, phase: String) {
        guard isCapturing else { return }
        pendingTouches.append([
            "x": x,
            "y": y,
            "phase": phase,
            "timestamp": Int(Date().timeIntervalSince1970 * 1000),
        ])
        // Cap pending touches to prevent memory growth
        if pendingTouches.count > 100 {
            pendingTouches.removeFirst(pendingTouches.count - 100)
        }
    }

    // MARK: - Frame Capture

    private func captureFrame() {
        guard isCapturing else { return }

        DispatchQueue.main.async { [weak self] in
            guard let self = self, self.isCapturing else { return }
            guard let window = self.keyWindow else { return }

            // Capture at half resolution for size savings
            let scale: CGFloat = 0.5
            let size = CGSize(
                width: window.bounds.width * scale,
                height: window.bounds.height * scale
            )

            UIGraphicsBeginImageContextWithOptions(size, true, 1.0)
            defer { UIGraphicsEndImageContext() }

            // Draw the view hierarchy
            window.drawHierarchy(
                in: CGRect(origin: .zero, size: size),
                afterScreenUpdates: false
            )

            // Apply PII mask regions
            if let ctx = UIGraphicsGetCurrentContext() {
                ctx.setFillColor(UIColor.darkGray.cgColor)
                for region in self.maskRegions {
                    guard let x = region["x"] as? Double,
                          let y = region["y"] as? Double,
                          let w = region["width"] as? Double,
                          let h = region["height"] as? Double else { continue }
                    let rect = CGRect(
                        x: x * Double(scale),
                        y: y * Double(scale),
                        width: w * Double(scale),
                        height: h * Double(scale)
                    )
                    ctx.fill(rect)
                }
            }

            guard let image = UIGraphicsGetImageFromCurrentImageContext(),
                  let jpegData = image.jpegData(compressionQuality: 0.3) else { return }

            let base64 = jpegData.base64EncodedString()
            let touches = self.pendingTouches
            self.pendingTouches = []
            let timestamp = Int(Date().timeIntervalSince1970 * 1000)

            self.onFrame?(base64, touches, timestamp)
        }
    }

    private var keyWindow: UIWindow? {
        // iOS 15+ multi-scene approach
        let scenes = UIApplication.shared.connectedScenes
        for scene in scenes {
            if let windowScene = scene as? UIWindowScene,
               scene.activationState == .foregroundActive {
                return windowScene.windows.first(where: { $0.isKeyWindow })
            }
        }
        return nil
    }
}
