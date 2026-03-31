---
name: hig
description: Apple HIG design intelligence — build, review, animate, and analyze with Apple Human Interface Guidelines for React Native/Expo
---

# Apple HIG Design Intelligence

## When to Use

- Building UI components with Apple-quality design (spring physics, semantic colors, 8pt grid)
- Reviewing existing code for HIG compliance
- Implementing animations with proper physics (not linear/ease-in-out)
- Analyzing reference videos to extract motion specs
- Generating design tokens for a project

## Intent Router

Detect intent from the user's message and route to the appropriate mode:

| Intent Keywords | Mode | What Happens |
|---|---|---|
| `build`, `create`, `make`, `design`, `component` | **Build** | Apply HIG rules while creating UI |
| `review`, `check`, `scan`, `audit`, `compliance` | **Review** | Run HIG scanner on source files |
| `animate`, `motion`, `spring`, `gesture`, `transition` | **Animate** | Implement animations with HIG physics |
| `video` + file path | **Analyze** | Extract motion spec from reference video |
| `tokens`, `theme`, `design system` | **Tokens** | Generate HIG design tokens |
| No clear intent | **Interactive** | Ask what the user wants |

## Build Mode

When building UI, load and apply these rules from `design/hig/rules/`:

1. **Always**: `design-system.md` (typography, colors, spacing, corners)
2. **If animation involved**: `animation.md` + `craft.md` (spring physics)
3. **If navigation/modals**: `patterns.md` (sheets, tabs, transitions)

**Non-negotiable requirements:**
- `borderCurve: 'continuous'` on all rounded elements
- Semantic color tokens, never hardcoded hex
- 4pt grid spacing, prefer 8pt
- 44pt minimum touch targets
- `useReducedMotion` with any animation
- `expo-haptics` on key interactions
- Dark mode support via `useColorScheme`
- Spring physics via `withSpring`, never `withTiming` with linear easing

**Spring presets** (use from `design/hig/index.ts`):
- `smooth`: default for most transitions
- `snappy`: button presses, toggles
- `bouncy`: playful elements, celebrations
- `gentle`: background, ambient motion

## Review Mode

Run the HIG scanner from `design/scanner/`:

```
/erne-hig review ./src/screens/
/erne-hig review ./src/components/Button.tsx
```

Output: violations grouped by severity (critical → low), HIG score (0-100), grade (A-F), and fix suggestions.

Integrate with `/erne-quality-gate` — scanner runs automatically alongside code-reviewer and performance-profiler.

## Animate Mode

Load `craft.md` + `animation.md` rules. Key patterns:

- **Enter/Exit**: `FadeIn.duration(300).springify()` — never abrupt appear/disappear
- **Gesture-driven**: Pan + `withDecay` for momentum, snap points with `withSpring`
- **Scroll-linked**: `useAnimatedScrollHandler` + `interpolate` with `Extrapolation.CLAMP`
- **Choreography**: parent first, children staggered 50ms, simultaneous for related

## Analyze Mode

Process reference video through `design/video/`:

```
/erne-hig video ./reference.mp4
```

Auto-detects project stack, generates Reanimated/Gesture Handler code matching the video's motion patterns.

## Tokens Mode

Generate typed design tokens from `design/tokens/`:

```
/erne-hig tokens
```

Creates `theme/hig-tokens.ts` with colors, typography, spacing, shadows — ready for `useColorScheme` and `StyleSheet.create`.
