package expo.modules.ernemonitor

import android.app.Activity
import android.view.View
import android.view.ViewGroup
import android.widget.EditText
import android.widget.TextView
import java.lang.ref.WeakReference

/**
 * Task 48 — Layout Snapshot (Android).
 *
 * Walks the native View hierarchy from the DecorView and serializes it
 * to a JSON-compatible map tree. Each node contains type, frame,
 * accessibility info, and children.
 *
 * Truncates at configurable maxDepth (default 50). Targets <100ms for
 * ~500 views. On-demand only.
 */
object LayoutSnapshot {

    fun capture(activity: Activity?, maxDepth: Int = 50, sanitizeText: Boolean = true): Map<String, Any>? {
        val decorView = activity?.window?.decorView ?: return null
        return serializeView(decorView, depth = 0, maxDepth = maxDepth, sanitizeText = sanitizeText)
    }

    private fun serializeView(view: View, depth: Int, maxDepth: Int, sanitizeText: Boolean): Map<String, Any> {
        val node = mutableMapOf<String, Any>()

        // Type
        node["type"] = view.javaClass.simpleName

        // Frame (screen coordinates)
        val location = IntArray(2)
        view.getLocationOnScreen(location)
        node["frame"] = mapOf(
            "x" to location[0].toDouble(),
            "y" to location[1].toDouble(),
            "w" to view.width.toDouble(),
            "h" to view.height.toDouble(),
        )

        // Accessibility
        view.contentDescription?.toString()?.takeIf { it.isNotEmpty() }?.let {
            node["accessibilityLabel"] = if (sanitizeText) sanitizeString(it) else it
        }

        // Props
        val props = mutableMapOf<String, Any>()
        if (view.visibility != View.VISIBLE) props["hidden"] = true
        if (view.alpha < 1.0f) props["alpha"] = view.alpha.toDouble()
        if (!view.isEnabled) props["enabled"] = false
        if (!view.isClickable && view is ViewGroup) { /* skip non-interactive containers */ }
        else if (view.isClickable) props["clickable"] = true

        // Text content
        when (view) {
            is EditText -> {
                if (view.inputType and android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD != 0 ||
                    view.inputType and android.text.InputType.TYPE_TEXT_VARIATION_VISIBLE_PASSWORD != 0 ||
                    view.inputType and android.text.InputType.TYPE_NUMBER_VARIATION_PASSWORD != 0
                ) {
                    props["text"] = "[REDACTED]"
                    props["secureTextEntry"] = true
                } else {
                    view.text?.toString()?.takeIf { it.isNotEmpty() }?.let {
                        props["text"] = if (sanitizeText) sanitizeString(it) else it
                    }
                }
            }
            is TextView -> {
                view.text?.toString()?.takeIf { it.isNotEmpty() }?.let {
                    props["text"] = if (sanitizeText) sanitizeString(it) else it
                }
            }
        }

        // Layout metrics
        val padding = mapOf(
            "top" to view.paddingTop.toDouble(),
            "left" to view.paddingLeft.toDouble(),
            "bottom" to view.paddingBottom.toDouble(),
            "right" to view.paddingRight.toDouble(),
        )
        if (padding.values.any { it > 0 }) {
            props["padding"] = padding
        }

        val lp = view.layoutParams
        if (lp is ViewGroup.MarginLayoutParams) {
            val margins = mapOf(
                "top" to lp.topMargin.toDouble(),
                "left" to lp.leftMargin.toDouble(),
                "bottom" to lp.bottomMargin.toDouble(),
                "right" to lp.rightMargin.toDouble(),
            )
            if (margins.values.any { it > 0 }) {
                props["margins"] = margins
            }
        }

        if (props.isNotEmpty()) {
            node["props"] = props
        }

        // Children
        if (view is ViewGroup) {
            val childCount = view.childCount
            if (depth < maxDepth && childCount > 0) {
                val children = mutableListOf<Map<String, Any>>()
                for (i in 0 until childCount) {
                    children.add(serializeView(view.getChildAt(i), depth + 1, maxDepth, sanitizeText))
                }
                node["children"] = children
            } else if (depth >= maxDepth && childCount > 0) {
                node["truncated"] = true
                node["truncatedChildCount"] = childCount
            }
        }

        return node
    }

    private fun sanitizeString(text: String): String {
        var result = text
        // Email
        result = result.replace(Regex("[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}"), "[EMAIL]")
        // Phone
        result = result.replace(Regex("\\+?\\d[\\d\\s\\-()]{7,}"), "[PHONE]")
        return result
    }
}
