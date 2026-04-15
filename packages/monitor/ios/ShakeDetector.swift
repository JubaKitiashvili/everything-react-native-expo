import UIKit

/**
 Task 52 — ShakeDetector (iOS)

 Detects shake gestures via UIWindow.motionEnded and fires a callback.
 Uses method swizzling on UIWindow to intercept motionEnded events
 without requiring a custom UIWindow subclass.

 Usage:
   ShakeDetector.shared.onShake = { /* report bug */ }
   ShakeDetector.shared.start()
   // ...
   ShakeDetector.shared.stop()
*/
public final class ShakeDetector: NSObject {
    public static let shared = ShakeDetector()

    /// Callback fired on shake detection. Set by ErneMonitorModule.
    public var onShake: (() -> Void)?

    private var isActive: Bool = false
    private static var swizzled = false

    private override init() {
        super.init()
    }

    /// Start listening for shake gestures.
    public func start() {
        guard !isActive else { return }
        isActive = true
        Self.installSwizzleIfNeeded()
    }

    /// Stop listening for shake gestures.
    public func stop() {
        isActive = false
    }

    /// Called by the swizzled motionEnded implementation.
    internal func handleMotionEnded(_ motion: UIEvent.EventSubtype) {
        guard isActive, motion == .motionShake else { return }
        onShake?()
    }

    /// Swizzle UIWindow.motionEnded to intercept shake events.
    private static func installSwizzleIfNeeded() {
        guard !swizzled else { return }
        swizzled = true

        let originalSelector = #selector(UIWindow.motionEnded(_:with:))
        let swizzledSelector = #selector(UIWindow.erne_motionEnded(_:with:))

        guard
            let originalMethod = class_getInstanceMethod(UIWindow.self, originalSelector),
            let swizzledMethod = class_getInstanceMethod(UIWindow.self, swizzledSelector)
        else { return }

        method_exchangeImplementations(originalMethod, swizzledMethod)
    }
}

// MARK: - UIWindow extension for swizzling

extension UIWindow {
    @objc func erne_motionEnded(_ motion: UIEvent.EventSubtype, with event: UIEvent?) {
        // Call original implementation (methods are swapped)
        erne_motionEnded(motion, with: event)

        // Notify the ShakeDetector
        ShakeDetector.shared.handleMotionEnded(motion)
    }
}
