import Foundation
import UIKit

/**
 Task 48 — Layout Snapshot (iOS).

 Walks the native UIView hierarchy and serializes it to a JSON-compatible
 dictionary tree. Each node contains type, frame, accessibility info, and
 children. Truncates at a configurable max depth (default 50).

 On-demand only — called via the `captureLayoutSnapshot` module function.
 Target: <100ms for a typical app (~500 views).
 */
final class LayoutSnapshot {
    static let shared = LayoutSnapshot()

    private init() {}

    func capture(maxDepth: Int = 50, sanitizeText: Bool = true) -> [String: Any]? {
        guard let window = keyWindow else { return nil }
        return serializeView(window, depth: 0, maxDepth: maxDepth, sanitizeText: sanitizeText)
    }

    private func serializeView(_ view: UIView, depth: Int, maxDepth: Int, sanitizeText: Bool) -> [String: Any] {
        var node: [String: Any] = [:]

        // Type
        node["type"] = String(describing: type(of: view))

        // Frame (screen coordinates)
        let frame = view.convert(view.bounds, to: nil)
        node["frame"] = [
            "x": Double(frame.origin.x),
            "y": Double(frame.origin.y),
            "w": Double(frame.size.width),
            "h": Double(frame.size.height),
        ]

        // Accessibility
        if let label = view.accessibilityLabel, !label.isEmpty {
            node["accessibilityLabel"] = sanitizeText ? sanitizeString(label) : label
        }
        if let hint = view.accessibilityHint, !hint.isEmpty {
            node["accessibilityHint"] = hint
        }
        if view.accessibilityTraits != .none {
            node["accessibilityRole"] = describeTraits(view.accessibilityTraits)
        }

        // Props
        var props: [String: Any] = [:]
        props["hidden"] = view.isHidden
        props["alpha"] = Double(view.alpha)
        props["userInteractionEnabled"] = view.isUserInteractionEnabled
        if view.clipsToBounds { props["clipsToBounds"] = true }
        if view.layer.cornerRadius > 0 { props["cornerRadius"] = Double(view.layer.cornerRadius) }

        // Text content (sanitized)
        if let label = view as? UILabel, let text = label.text, !text.isEmpty {
            props["text"] = sanitizeText ? sanitizeString(text) : text
        }
        if let textField = view as? UITextField {
            if textField.isSecureTextEntry {
                props["text"] = "[REDACTED]"
                props["secureTextEntry"] = true
            } else if let text = textField.text, !text.isEmpty {
                props["text"] = sanitizeText ? sanitizeString(text) : text
            }
        }

        // Layout metrics (what's available from UIKit)
        let layoutMargins = view.layoutMargins
        if layoutMargins != UIEdgeInsets.zero {
            props["margins"] = [
                "top": Double(layoutMargins.top),
                "left": Double(layoutMargins.left),
                "bottom": Double(layoutMargins.bottom),
                "right": Double(layoutMargins.right),
            ]
        }

        if !props.isEmpty {
            node["props"] = props
        }

        // Children (truncate at maxDepth)
        if depth < maxDepth && !view.subviews.isEmpty {
            node["children"] = view.subviews.map { subview in
                serializeView(subview, depth: depth + 1, maxDepth: maxDepth, sanitizeText: sanitizeText)
            }
        } else if depth >= maxDepth && !view.subviews.isEmpty {
            node["truncated"] = true
            node["truncatedChildCount"] = view.subviews.count
        }

        return node
    }

    private func sanitizeString(_ text: String) -> String {
        // Redact potential PII patterns (emails, phone numbers)
        var result = text
        // Email
        let emailPattern = "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"
        if let regex = try? NSRegularExpression(pattern: emailPattern) {
            result = regex.stringByReplacingMatches(
                in: result,
                range: NSRange(result.startIndex..., in: result),
                withTemplate: "[EMAIL]"
            )
        }
        // Phone (simple pattern)
        let phonePattern = "\\+?\\d[\\d\\s\\-()]{7,}"
        if let regex = try? NSRegularExpression(pattern: phonePattern) {
            result = regex.stringByReplacingMatches(
                in: result,
                range: NSRange(result.startIndex..., in: result),
                withTemplate: "[PHONE]"
            )
        }
        return result
    }

    private func describeTraits(_ traits: UIAccessibilityTraits) -> String {
        var parts: [String] = []
        if traits.contains(.button) { parts.append("button") }
        if traits.contains(.link) { parts.append("link") }
        if traits.contains(.header) { parts.append("header") }
        if traits.contains(.image) { parts.append("image") }
        if traits.contains(.staticText) { parts.append("text") }
        if traits.contains(.adjustable) { parts.append("adjustable") }
        return parts.isEmpty ? "none" : parts.joined(separator: ",")
    }

    private var keyWindow: UIWindow? {
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
