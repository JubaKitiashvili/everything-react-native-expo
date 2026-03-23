---
description: StyleSheet.create styling conventions with theme tokens, dark mode, and new CSS properties (RN 0.84+)
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# Styling

## StyleSheet.create Patterns

Always use `StyleSheet.create` for component styles. Never use inline styles.

```tsx
import { StyleSheet, View, Text } from 'react-native';

export function Card({ title, children }: CardProps) {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#111827',
  },
});
```

## Theme Tokens

Define theme tokens as typed JS objects for consistency across the app.

```tsx
// theme/tokens.ts
export const colors = {
  light: {
    background: '#FFFFFF',
    surface: '#F9FAFB',
    text: '#111827',
    textSecondary: '#6B7280',
    primary: '#3B82F6',
    error: '#EF4444',
    border: '#E5E7EB',
  },
  dark: {
    background: '#111827',
    surface: '#1F2937',
    text: '#F9FAFB',
    textSecondary: '#9CA3AF',
    primary: '#60A5FA',
    error: '#F87171',
    border: '#374151',
  },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const typography = {
  h1: { fontSize: 32, fontWeight: '700' as const },
  h2: { fontSize: 24, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
} as const;
```

## Dark Mode with useColorScheme

```tsx
import { useColorScheme, StyleSheet, View, Text } from 'react-native';
import { colors, spacing } from '@/theme/tokens';

export function ThemedCard({ title, children }: CardProps) {
  const colorScheme = useColorScheme();
  const theme = colors[colorScheme ?? 'light'];

  return (
    <View style={[styles.container, { backgroundColor: theme.surface }]}>
      <Text style={[styles.title, { color: theme.text }]}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    padding: spacing.md,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
  },
});
```

## useThemedStyles Hook

```tsx
// hooks/useThemedStyles.ts
import { useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { colors } from '@/theme/tokens';

type StyleFactory<T extends StyleSheet.NamedStyles<T>> = (theme: typeof colors.light) => T;

export function useThemedStyles<T extends StyleSheet.NamedStyles<T>>(factory: StyleFactory<T>): T {
  const colorScheme = useColorScheme();
  const theme = colors[colorScheme ?? 'light'];
  return useMemo(() => StyleSheet.create(factory(theme)), [theme]);
}

// Usage
function ProfileScreen() {
  const styles = useThemedStyles((theme) => ({
    container: {
      flex: 1,
      backgroundColor: theme.background,
    },
    heading: {
      color: theme.text,
      fontSize: 24,
      fontWeight: '700',
    },
  }));

  return (
    <View style={styles.container}>
      <Text style={styles.heading}>Profile</Text>
    </View>
  );
}
```

## New CSS Properties (New Architecture, RN 0.77+)

- `display: 'contents'` — wrapper elements that don't affect layout
- `boxSizing: 'border-box' | 'content-box'` — box model control
- `mixBlendMode` — blend modes (multiply, screen, overlay, etc.)
- `outlineWidth`, `outlineStyle`, `outlineSpread`, `outlineColor` — outlines without layout impact
- **Note:** `box-shadow` and `filter` now require CSS units (e.g., `'1px'` not `1`) since RN 0.79

## Dark Mode Note

- `Appearance.setColorScheme(null)` no longer works — use `'unspecified'` instead (RN 0.82+)

## Apple HIG Styling Patterns

- Use `borderCurve: 'continuous'` for Apple-style smooth rounded corners (not default circular)
- Prefer `gap` (flex gap) over margins/padding for spacing between siblings
- Use `fontVariant: ['tabular-nums']` for numeric counters and timers (uniform digit width)
- Add `selectable` prop to `<Text>` displaying critical data (IDs, codes, URLs)
- Use CSS `boxShadow` for shadows (supports `inset` keyword)
- Use `experimental_backgroundImage` for CSS gradients (New Architecture only)
- Use `useWindowDimensions()` over `Dimensions.get()` — reactive to changes
- Prefer `process.env.EXPO_OS` over `Platform.OS` for platform checks

```tsx
// Apple-style continuous corners
const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderCurve: 'continuous', // smoother than default
  },
  counter: {
    fontVariant: ['tabular-nums'], // aligned digits: 1,234 → 1,235
  },
  shadow: {
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)', // CSS syntax
  },
});

// Platform check — prefer EXPO_OS
if (process.env.EXPO_OS === 'ios') {
  // iOS-specific code
}
```

## Rules

- Always use `StyleSheet.create` — never inline style objects
- Use theme tokens for colors, spacing, and typography — no magic numbers
- Support dark mode via `useColorScheme` and themed token sets
- Keep styles at the bottom of the file, colocated with the component
- Prefer `process.env.EXPO_OS` over `Platform.select` for platform-specific logic
- Compose styles with array syntax: `style={[styles.base, styles.variant]}`
- Conditional styles: `style={[styles.base, isActive && styles.active]}`
- Never use `Dimensions.get()` — use `useWindowDimensions()` hook
- Never use intrinsic elements (`<div>`, `<img>`, `<span>`) outside WebViews
