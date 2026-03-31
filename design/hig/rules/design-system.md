# Design System — Tokens, Typography & Visual Language

Canonical token definitions for React Native/Expo projects targeting iOS 18+.
Never hardcode hex values, font sizes, or spacing numbers in components — import from these tokens.

---

## 1. Typography

Use the system font (San Francisco on iOS, Roboto on Android). No import required —
React Native maps `fontFamily: undefined` or omitting `fontFamily` to the system font.

### Type Scale

| Token         | Size | Weight | Line Height | Tracking  | Use                          |
|---------------|------|--------|-------------|-----------|------------------------------|
| largeTitle    | 34   | 700    | 41          | +0.37     | Page headings (collapsed)    |
| title1        | 28   | 700    | 34          | +0.36     | Section headings             |
| title2        | 22   | 700    | 28          | +0.35     | Card titles                  |
| title3        | 20   | 600    | 25          | +0.38     | Sub-section headings         |
| headline      | 17   | 600    | 22          | -0.41     | Emphasized body text         |
| body          | 17   | 400    | 22          | -0.41     | Primary reading text         |
| callout       | 16   | 400    | 21          | -0.32     | Secondary body, captions     |
| subheadline   | 15   | 400    | 20          | -0.23     | Supporting text, labels      |
| footnote      | 13   | 400    | 18          | -0.08     | Supplemental info            |
| caption1      | 12   | 400    | 16          | 0         | Timestamps, metadata         |
| caption2      | 11   | 400    | 13          | +0.07     | Fine print, badges           |

### Typography Styles

```typescript
// tokens/typography.ts
import { StyleSheet, TextStyle } from 'react-native';

export const TypeScale: Record<string, TextStyle> = {
  largeTitle: {
    fontSize: 34,
    fontWeight: '700',
    lineHeight: 41,
    letterSpacing: 0.37,
  },
  title1: {
    fontSize: 28,
    fontWeight: '700',
    lineHeight: 34,
    letterSpacing: 0.36,
  },
  title2: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 28,
    letterSpacing: 0.35,
  },
  title3: {
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 25,
    letterSpacing: 0.38,
  },
  headline: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.41,
  },
  body: {
    fontSize: 17,
    fontWeight: '400',
    lineHeight: 22,
    letterSpacing: -0.41,
  },
  callout: {
    fontSize: 16,
    fontWeight: '400',
    lineHeight: 21,
    letterSpacing: -0.32,
  },
  subheadline: {
    fontSize: 15,
    fontWeight: '400',
    lineHeight: 20,
    letterSpacing: -0.23,
  },
  footnote: {
    fontSize: 13,
    fontWeight: '400',
    lineHeight: 18,
    letterSpacing: -0.08,
  },
  caption1: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 16,
    letterSpacing: 0,
  },
  caption2: {
    fontSize: 11,
    fontWeight: '400',
    lineHeight: 13,
    letterSpacing: 0.07,
  },
};

// Convenience StyleSheet for direct use in components
export const TextStyles = StyleSheet.create(TypeScale);
```

### Usage

```typescript
import { Text, StyleSheet } from 'react-native';
import { TextStyles } from '@/tokens/typography';
import { useTheme } from '@/hooks/useTheme';

function ProfileHeader({ name, username }: { name: string; username: string }) {
  const theme = useTheme();

  return (
    <>
      <Text style={[TextStyles.title2, { color: theme.colors.label }]}>
        {name}
      </Text>
      <Text style={[TextStyles.subheadline, { color: theme.colors.secondaryLabel }]}>
        @{username}
      </Text>
    </>
  );
}
```

### Rules

- Never set `fontFamily` manually unless using a custom font — let the system font render.
- `letterSpacing` in React Native is in points (not em). Use the values from the table above.
- Always pair `fontSize` with `lineHeight` to prevent clipping on Android.
- For bold emphasis within body text, use `fontWeight: '600'` (semibold), not `'700'` (bold).
- Dynamic Type: wrap `fontSize` with `PixelRatio.getFontScale()` if supporting accessibility font sizes.

---

## 2. Colors

Use semantic color tokens, never hardcode hex values in components.
The theme object adapts to light/dark mode via `useColorScheme`.

### Color Token System

```typescript
// tokens/colors.ts
import { useColorScheme } from 'react-native';

// Semantic color names follow Apple's UIColor naming convention
interface ColorTokens {
  // Backgrounds
  background:          string;
  secondaryBackground: string;
  tertiaryBackground:  string;
  groupedBackground:   string;

  // Labels (text)
  label:               string;
  secondaryLabel:      string;
  tertiaryLabel:       string;
  quaternaryLabel:     string;
  placeholderText:     string;

  // Fills (for controls and UI elements)
  fill:                string;
  secondaryFill:       string;
  tertiaryFill:        string;

  // Separators
  separator:           string;
  opaqueSeparator:     string;

  // System colors
  blue:                string;
  green:               string;
  red:                 string;
  orange:              string;
  yellow:              string;
  teal:                string;
  purple:              string;
  pink:                string;
  indigo:              string;

  // Tint (primary interactive color)
  tint:                string;
  tintSubdued:         string;

  // Destructive
  destructive:         string;
}

const light: ColorTokens = {
  // Backgrounds
  background:          '#FFFFFF',
  secondaryBackground: '#F2F2F7',
  tertiaryBackground:  '#FFFFFF',
  groupedBackground:   '#F2F2F7',

  // Labels
  label:               '#000000',
  secondaryLabel:      'rgba(60, 60, 67, 0.6)',
  tertiaryLabel:       'rgba(60, 60, 67, 0.3)',
  quaternaryLabel:     'rgba(60, 60, 67, 0.18)',
  placeholderText:     'rgba(60, 60, 67, 0.3)',

  // Fills
  fill:                'rgba(120, 120, 128, 0.2)',
  secondaryFill:       'rgba(120, 120, 128, 0.16)',
  tertiaryFill:        'rgba(118, 118, 128, 0.12)',

  // Separators
  separator:           'rgba(60, 60, 67, 0.29)',
  opaqueSeparator:     '#C6C6C8',

  // System colors (light)
  blue:                '#007AFF',
  green:               '#34C759',
  red:                 '#FF3B30',
  orange:              '#FF9500',
  yellow:              '#FFCC00',
  teal:                '#5AC8FA',
  purple:              '#AF52DE',
  pink:                '#FF2D55',
  indigo:              '#5856D6',

  // Tint
  tint:                '#007AFF',
  tintSubdued:         'rgba(0, 122, 255, 0.15)',

  // Destructive
  destructive:         '#FF3B30',
};

const dark: ColorTokens = {
  // Backgrounds
  background:          '#000000',
  secondaryBackground: '#1C1C1E',
  tertiaryBackground:  '#2C2C2E',
  groupedBackground:   '#000000',

  // Labels
  label:               '#FFFFFF',
  secondaryLabel:      'rgba(235, 235, 245, 0.6)',
  tertiaryLabel:       'rgba(235, 235, 245, 0.3)',
  quaternaryLabel:     'rgba(235, 235, 245, 0.18)',
  placeholderText:     'rgba(235, 235, 245, 0.3)',

  // Fills
  fill:                'rgba(120, 120, 128, 0.36)',
  secondaryFill:       'rgba(120, 120, 128, 0.32)',
  tertiaryFill:        'rgba(118, 118, 128, 0.24)',

  // Separators
  separator:           'rgba(84, 84, 88, 0.6)',
  opaqueSeparator:     '#38383A',

  // System colors (dark — slightly brighter for legibility on dark bg)
  blue:                '#0A84FF',
  green:               '#30D158',
  red:                 '#FF453A',
  orange:              '#FF9F0A',
  yellow:              '#FFD60A',
  teal:                '#64D2FF',
  purple:              '#BF5AF2',
  pink:                '#FF375F',
  indigo:              '#5E5CE6',

  // Tint
  tint:                '#0A84FF',
  tintSubdued:         'rgba(10, 132, 255, 0.2)',

  // Destructive
  destructive:         '#FF453A',
};

export const ColorTokens = { light, dark };

// Hook for consuming colors
export function useColors(): ColorTokens {
  const scheme = useColorScheme();
  return scheme === 'dark' ? dark : light;
}
```

### Usage

```typescript
import { useColors } from '@/tokens/colors';
import { StyleSheet, Text, View } from 'react-native';

function Card({ title, subtitle }: { title: string; subtitle: string }) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.secondaryBackground }]}>
      <Text style={[styles.title, { color: colors.label }]}>{title}</Text>
      <Text style={[styles.subtitle, { color: colors.secondaryLabel }]}>{subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    padding: 16,
    // backgroundColor comes from theme — NOT hardcoded here
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
    letterSpacing: -0.41,
  },
  subtitle: {
    fontSize: 15,
    lineHeight: 20,
    letterSpacing: -0.23,
  },
});
```

### Rules

- NEVER hardcode `#` hex values in component files. Always pull from the color tokens.
- NEVER hardcode `rgba()` values in components. Use the semantic token (e.g., `colors.separator`).
- When adding a new color, add it to BOTH `light` and `dark` objects simultaneously.
- Interactive elements (buttons, links) always use `colors.tint`.
- Destructive actions always use `colors.destructive`.
- Error states use `colors.red`.
- Success states use `colors.green`.

---

## 3. Spacing

All spacing values are multiples of 4. Prefer multiples of 8.

### Spacing Scale

```typescript
// tokens/spacing.ts
export const Space = {
  0:    0,
  px:   1,   // hairline — borders only
  0.5:  2,   // optical correction only
  1:    4,   // xs — tight spacing, icon padding
  1.5:  6,   // rare — use sparingly
  2:    8,   // sm — default gap in rows
  3:    12,  // md — compact list items
  4:    16,  // base — standard padding
  5:    20,  // lg — generous padding
  6:    24,  // xl — section spacing
  8:    32,  // 2xl — large section gaps
  10:   40,  // 3xl — page-level spacing
  12:   48,  // 4xl — hero sections
  16:   64,  // 5xl — extreme separation
  20:   80,  // screen-level padding
  24:   96,  // max content spacing
} as const;

// Named aliases for common use
export const Spacing = {
  micro:   Space[0.5],  // 2  — optical corrections only
  xs:      Space[1],    // 4
  sm:      Space[2],    // 8
  md:      Space[3],    // 12
  base:    Space[4],    // 16  — primary padding
  lg:      Space[5],    // 20
  xl:      Space[6],    // 24
  '2xl':   Space[8],    // 32
  '3xl':   Space[10],   // 40
  '4xl':   Space[12],   // 48
  screen:  Space[4],    // 16  — horizontal screen edge padding
} as const;
```

### Usage with gap

```typescript
import { StyleSheet, View, Text } from 'react-native';
import { Spacing } from '@/tokens/spacing';

// Prefer gap over margin for flex layouts
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,         // 8 — space between row children
  },
  column: {
    flexDirection: 'column',
    gap: Spacing.md,         // 12 — space between column children
  },
  card: {
    padding: Spacing.base,   // 16
    borderRadius: 16,
  },
  section: {
    paddingHorizontal: Spacing.base,  // 16
    paddingVertical: Spacing.xl,      // 24
    gap: Spacing.xl,                  // 24 between items in section
  },
  listItem: {
    paddingHorizontal: Spacing.base,  // 16
    paddingVertical: Spacing.md,      // 12
    minHeight: 44,                    // Apple HIG touch target
  },
});
```

### Rules

- Minimum touch target: 44 × 44pt. Use `minHeight: 44, minWidth: 44` — never smaller.
- Horizontal screen edge padding: `Spacing.base` (16pt) as default.
- Content max width: `maxWidth: 428` for phone layouts. Use percentage for adaptive layouts.
- Use `gap` for spacing between flex children. Use `padding` for inset from container edges.

---

## 4. Corners

All interactive elements and cards use `borderCurve: 'continuous'` (squircle).
This matches iOS 16+ system appearance where all rounded rectangles use continuous curves.

### CRITICAL Rule

```typescript
// ALWAYS include borderCurve: 'continuous' when setting borderRadius
const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderCurve: 'continuous', // REQUIRED — never omit this
  },
});
```

### Corner Radius Scale

| Token     | Value | Use case                                 |
|-----------|-------|------------------------------------------|
| xs        | 6     | Chips, tags, small badges                |
| sm        | 8     | Input fields, small cards                |
| md        | 12    | List rows, medium cards                  |
| base      | 16    | Standard cards, sheets                   |
| lg        | 20    | Large cards, feature panels              |
| xl        | 24    | Modals, large sheets                     |
| '2xl'     | 28    | Bottom sheets (top corners)              |
| pill      | 999   | Fully rounded buttons, capsule shapes    |

```typescript
// tokens/radius.ts
export const Radius = {
  xs:   6,
  sm:   8,
  md:   12,
  base: 16,
  lg:   20,
  xl:   24,
  '2xl': 28,
  pill: 999,
} as const;
```

### Concentric Radius Rule

When an element is nested inside a rounded container, the inner element's radius must be smaller.

```
inner radius = outer radius - padding
```

```typescript
import { StyleSheet } from 'react-native';
import { Radius, Spacing } from '@/tokens';

const CARD_RADIUS = Radius.base;      // 16
const CARD_PADDING = Spacing.base;    // 16
const INNER_RADIUS = CARD_RADIUS - CARD_PADDING / 2; // 8 — do NOT use 16 inside a 16-radius card

const styles = StyleSheet.create({
  outerCard: {
    borderRadius: CARD_RADIUS,       // 16
    borderCurve: 'continuous',
    padding: CARD_PADDING,           // 16
  },
  innerElement: {
    borderRadius: INNER_RADIUS,      // 8  — concentric correction
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
});
```

### Specific Concentric Examples

| Container radius | Padding | Inner radius |
|-----------------|---------|--------------|
| 28 (bottom sheet) | 16    | 12           |
| 20 (large card)   | 16    | 8            |
| 16 (card)         | 12    | 8            |
| 16 (card)         | 16    | 6            |
| 12 (list row)     | 12    | 6            |

---

## 5. Shadows

Use the `boxShadow` property (React Native 0.77+) for cross-platform shadow support.
On iOS, also use `shadowColor`, `shadowOffset`, `shadowOpacity`, `shadowRadius` for older RN.

### Shadow Scale

```typescript
// tokens/shadows.ts
import { StyleSheet, Platform } from 'react-native';

// RN 0.77+ boxShadow syntax
export const Shadow = {
  // Subtle — text fields, list rows
  subtle: {
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08), 0 1px 1px rgba(0, 0, 0, 0.04)',
  },
  // Medium — cards, panels
  medium: {
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.1), 0 1px 3px rgba(0, 0, 0, 0.06)',
  },
  // Raised — popovers, context menus
  raised: {
    boxShadow: '0 4px 16px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)',
  },
  // Floating — FABs, tooltips, floating toolbars
  floating: {
    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0, 0, 0, 0.1)',
  },
} as const;

// Legacy iOS shadow (pre-0.77 or when boxShadow not available)
export const ShadowIOS = {
  subtle: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  medium: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  raised: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
  },
  floating: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 32,
    elevation: 16,
  },
} as const;
```

### Usage

```typescript
import { StyleSheet } from 'react-native';
import { Shadow, Radius, Spacing } from '@/tokens';
import { useColors } from '@/tokens/colors';

function Card({ children }: { children: React.ReactNode }) {
  const colors = useColors();

  return (
    <View style={[styles.card, { backgroundColor: colors.background }]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.base,   // 16
    borderCurve: 'continuous',
    padding: Spacing.base,       // 16
    ...Shadow.medium,            // spread shadow properties
  },
});
```

### Dark Mode Shadows

Shadows are nearly invisible on dark backgrounds. Use them more aggressively in dark mode,
or switch to a border/fill approach.

```typescript
import { useColorScheme, StyleSheet } from 'react-native';
import { Shadow } from '@/tokens/shadows';

function useShadow(level: keyof typeof Shadow) {
  const scheme = useColorScheme();
  if (scheme === 'dark') {
    // In dark mode, use a lighter inner stroke instead of drop shadow
    return {
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: 'rgba(255, 255, 255, 0.1)',
    };
  }
  return Shadow[level];
}
```

### Rules

- Subtle: text input, search bar, list rows on white backgrounds.
- Medium: cards floating above page background.
- Raised: popovers, dropdowns, context menus.
- Floating: FABs, floating toolbars, pip video.
- In dark mode, prefer inner border stroke over drop shadow for cards.
- Never stack multiple shadows by combining properties — use the layered `boxShadow` values.
