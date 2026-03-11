---
description: Accessibility rules for React Native applications
globs: "**/*.{ts,tsx,js,jsx}"
alwaysApply: false
---

# Accessibility

## Labels & Roles
- Every interactive element (Button, Pressable, TouchableOpacity) MUST have `accessibilityLabel`
- Use `accessibilityRole` to convey element purpose (button, link, header, image, etc.)
- Use `accessibilityHint` for non-obvious actions
- Group related elements with `accessibilityGrouping` or `accessible={true}` on the container

```tsx
// GOOD
<Pressable
  accessibilityRole="button"
  accessibilityLabel="Delete item"
  accessibilityHint="Removes this item from your cart"
  onPress={handleDelete}
>
  <TrashIcon />
</Pressable>

// BAD
<Pressable onPress={handleDelete}>
  <TrashIcon />
</Pressable>
```

## Touch Targets
- Minimum touch target size: 44x44 points (Apple HIG / WCAG)
- Use `hitSlop` to expand small visual elements to meet minimum size
- Never place interactive elements closer than 8pt apart

```tsx
// GOOD — small icon with expanded touch target
<Pressable hitSlop={12} style={{ padding: 10 }}>
  <Icon size={24} />
</Pressable>
```

## Screen Reader Support
- Test with VoiceOver (iOS) and TalkBack (Android) on real devices
- Ensure logical focus order — use `accessibilityOrder` or layout order
- Hide decorative elements with `accessibilityElementsHidden` or `importantForAccessibility="no"`
- Announce dynamic changes with `AccessibilityInfo.announceForAccessibility()`

## Color & Contrast
- Minimum contrast ratio: 4.5:1 for normal text, 3:1 for large text (WCAG AA)
- Never rely on color alone to convey information — add icons or text labels
- Support both light and dark mode with sufficient contrast in each
- Test with "Increase Contrast" and "Bold Text" accessibility settings enabled

## State Communication
- Use `accessibilityState` for disabled, selected, checked, expanded states
- Use `accessibilityValue` for sliders, progress bars, and numeric inputs
- Mark required form fields with `accessibilityLabel` that includes "required"

```tsx
// GOOD
<Switch
  accessibilityRole="switch"
  accessibilityLabel="Enable notifications"
  accessibilityState={{ checked: isEnabled }}
  value={isEnabled}
  onValueChange={setIsEnabled}
/>
```
