---
description: React Native SVG — vector graphics, icons, charts, gradients, clipping, masks, patterns, Reanimated animation
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native SVG (react-native-svg)

SVG rendering for React Native. Maps to native platform renderers (CoreGraphics iOS, Android Canvas).

## When to Use

```
Do you need to animate or interactively control individual parts of the SVG?
│
├── YES → react-native-svg + Reanimated
│
└── NO
    ├── Standard icon set? → icon fonts (@expo/vector-icons)
    ├── Static SVG image? → expo-image (preferred) or react-native-vector-image
    ├── Animated vector without per-element control? → Lottie or Rive
    └── Complex 2D graphics (charts, shaders)? → Skia (@shopify/react-native-skia)
```

## Setup

```bash
npx expo install react-native-svg
```

## Basic Usage

```tsx
import Svg, { Circle, Rect, Path, Line, Text } from 'react-native-svg';

<Svg height="200" width="200" viewBox="0 0 100 100">
  <Circle cx="50" cy="50" r="40" fill="blue" stroke="red" strokeWidth="2" />
  <Rect x="10" y="10" width="80" height="80" rx="8" fill="yellow" opacity={0.5} />
  <Path d="M10 80 Q 52.5 10, 95 80 T 180 80" stroke="black" fill="none" strokeWidth="2" />
  <Line x1="0" y1="0" x2="100" y2="100" stroke="red" strokeWidth="2" />
  <Text x="50" y="50" fontSize="12" textAnchor="middle" fill="white">
    Hello
  </Text>
</Svg>;
```

## Shape Components

| Component    | Key Props                               |
| ------------ | --------------------------------------- |
| `<Circle>`   | `cx`, `cy`, `r`                         |
| `<Rect>`     | `x`, `y`, `width`, `height`, `rx`, `ry` |
| `<Ellipse>`  | `cx`, `cy`, `rx`, `ry`                  |
| `<Line>`     | `x1`, `y1`, `x2`, `y2`                  |
| `<Polyline>` | `points` (e.g., `"10,10 20,12 30,20"`)  |
| `<Polygon>`  | `points` (auto-closes)                  |
| `<Path>`     | `d` (SVG path commands)                 |

## Common Props (all shapes)

```tsx
// Fill & stroke
fill="blue"              // color, "url(#gradientId)", or "none"
fillOpacity={0.5}
fillRule="evenodd"       // "nonzero" | "evenodd"
stroke="red"
strokeWidth={2}
strokeOpacity={0.8}
strokeDasharray="5,10"   // dash pattern
strokeDashoffset={0}
strokeLinecap="round"    // "butt" | "round" | "square"
strokeLinejoin="round"   // "miter" | "round" | "bevel"

// Transform
transform="translate(10,20) rotate(45)"
rotation={45}
scale={1.5}
origin="50, 50"          // transform origin
opacity={0.8}

// Clipping & masking
clipPath="url(#clip)"
mask="url(#mask)"

// Touch events
onPress={() => {}}
onPressIn={() => {}}
onPressOut={() => {}}
onLongPress={() => {}}
```

## Text

```tsx
import { Text, TSpan, TextPath } from 'react-native-svg';

<Text x="50" y="20" fontSize="16" fontWeight="bold" textAnchor="middle" fill="black">
  Hello <TSpan fill="red" dy="5">World</TSpan>
</Text>

// Text on path
<Defs>
  <Path id="curve" d="M10,80 Q95,10 180,80" />
</Defs>
<Text fill="blue">
  <TextPath href="#curve" startOffset="25%">Curved text</TextPath>
</Text>
```

## Gradients

```tsx
import { Defs, LinearGradient, RadialGradient, Stop } from 'react-native-svg';

<Defs>
  <LinearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
    <Stop offset="0%" stopColor="cyan" stopOpacity={1} />
    <Stop offset="100%" stopColor="blue" stopOpacity={1} />
  </LinearGradient>
  <RadialGradient id="radial" cx="50%" cy="50%" rx="50%" ry="50%">
    <Stop offset="0%" stopColor="yellow" />
    <Stop offset="100%" stopColor="red" />
  </RadialGradient>
</Defs>
<Rect fill="url(#grad)" width="100" height="100" />
<Circle fill="url(#radial)" cx="150" cy="50" r="40" />
```

## Clipping & Masking

```tsx
import { Defs, ClipPath, Mask, Circle, Image } from 'react-native-svg';

// Clip path (sharp boundary)
<Defs>
  <ClipPath id="clip">
    <Circle cx="50%" cy="50%" r="40%" />
  </ClipPath>
</Defs>
<Image href={require('./photo.jpg')} clipPath="url(#clip)" width="200" height="200" />

// Mask (alpha gradient boundary)
<Defs>
  <Mask id="mask">
    <Rect fill="url(#grad)" width="100%" height="100%" />
  </Mask>
</Defs>
<Image href={imageUri} mask="url(#mask)" width="200" height="200" />
```

## Pattern

```tsx
import { Defs, Pattern, Path, Rect } from 'react-native-svg';

<Defs>
  <Pattern id="dots" patternUnits="userSpaceOnUse" width="20" height="20">
    <Circle cx="10" cy="10" r="3" fill="blue" />
  </Pattern>
</Defs>
<Rect fill="url(#dots)" width="200" height="200" />
```

## Group, Defs, Use, Symbol

```tsx
import { G, Defs, Use, Symbol } from 'react-native-svg';

// Group — shared props cascade to children
<G fill="blue" stroke="red" strokeWidth={1} rotation={45} origin="50,50">
  <Circle cx="30" cy="30" r="20" />
  <Circle cx="70" cy="70" r="20" />
</G>

// Symbol + Use — reusable components
<Defs>
  <Symbol id="icon" viewBox="0 0 100 100">
    <Circle cx="50" cy="50" r="40" fill="green" />
  </Symbol>
</Defs>
<Use href="#icon" x="0" y="0" width="50" height="50" />
<Use href="#icon" x="60" y="0" width="30" height="30" />
```

## Image & ForeignObject

```tsx
import { Image, ForeignObject } from 'react-native-svg';

// Raster image in SVG
<Image href={require('./photo.jpg')} x="0" y="0" width="100" height="100" preserveAspectRatio="xMidYMid slice" />

// React Native views inside SVG (expensive — use sparingly)
<ForeignObject x={10} y={10} width={100} height={50}>
  <View><Text style={{ color: 'blue' }}>Native text</Text></View>
</ForeignObject>
```

## Rendering from XML/URI

```tsx
import { SvgXml, SvgUri } from 'react-native-svg';
import { SvgCss } from 'react-native-svg/css';

// From XML string
<SvgXml xml={svgString} width="100" height="100" />

// From remote URL
<SvgUri uri="https://example.com/icon.svg" width="100" height="100" />

// With CSS styles
<SvgCss xml={svgWithCssStyles} width="100" height="100" />
```

## Animation with Reanimated

```tsx
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { Circle } from 'react-native-svg';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function PulsingCircle() {
  const r = useSharedValue(20);

  useEffect(() => {
    r.value = withRepeat(withTiming(40, { duration: 1000 }), -1, true);
  }, []);

  const animatedProps = useAnimatedProps(() => ({ r: r.value }));

  return (
    <Svg viewBox="0 0 100 100">
      <AnimatedCircle cx="50" cy="50" fill="blue" animatedProps={animatedProps} />
    </Svg>
  );
}
```

### Stroke Drawing Animation

```tsx
const AnimatedPath = Animated.createAnimatedComponent(Path);
const progress = useSharedValue(0);

useEffect(() => {
  progress.value = withTiming(1, { duration: 2000 });
}, []);

const animatedProps = useAnimatedProps(() => ({
  strokeDashoffset: pathLength * (1 - progress.value),
}));

<AnimatedPath
  d={pathData}
  stroke="black"
  strokeWidth={2}
  fill="none"
  strokeDasharray={pathLength}
  animatedProps={animatedProps}
/>;
```

## Performance Rules

- Minimize SVG node count — each element = native view. Simplify paths, merge shapes
- Use `SvgXml`/`SvgUri` for static SVGs (parsed once, faster than JSX tree)
- Wrap in `React.memo` — avoid re-renders of unchanged SVG trees
- Animate with Reanimated (`useAnimatedProps`) — never from JS thread
- Pre-rasterize static SVGs (logos, backgrounds) to PNG/WebP at build time
- Use `viewBox` for responsive scaling — avoid recalculating coordinates
- Flatten unnecessary `<G>` nesting
- Avoid `ForeignObject` in hot paths — triggers RN layout inside SVG
- `SvgXml` and `LocalSvg` have the same overhead as inline JSX — no performance benefit

## SVG Filters (FilterImage)

```tsx
import { FilterImage } from 'react-native-svg/filter-image';

<FilterImage
  source={require('./photo.jpg')}
  style={{ width: 200, height: 200, filter: 'blur(5px) grayscale(0.5)' }}
/>
```

Supports CSS `filter` syntax: `blur()`, `grayscale()`, `brightness()`, `contrast()`, `saturate()`, `sepia()`, `hue-rotate()`, `invert()`, `opacity()`, `drop-shadow()`.

Native SVG filters also available: `FeGaussianBlur`, `FeColorMatrix`, `FeDropShadow`, `FeBlend`, `FeComposite`, `FeMerge`, `FeOffset`, `FeFlood`.

## SVG Transformer (import .svg as components)

```javascript
// metro.config.js
const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.transformer.babelTransformerPath = require.resolve('react-native-svg-transformer');
config.resolver.assetExts = config.resolver.assetExts.filter((ext) => ext !== 'svg');
config.resolver.sourceExts.push('svg');
module.exports = config;
```

```tsx
import Logo from './assets/logo.svg';
<Logo width={100} height={100} />
```

## CSS Styles in SVGs

```tsx
import { SvgCss, SvgCssUri } from 'react-native-svg/css';

<SvgCss xml={svgStringWithCssStyles} width={100} height={100} />
<SvgCssUri uri="https://example.com/styled.svg" width={100} height={100} />
```

## Known Issues

- `RadialGradient` focus point does not work on Android
- Many SVG filters are web-only — check platform support
- No drawing cache — each render fully redraws
