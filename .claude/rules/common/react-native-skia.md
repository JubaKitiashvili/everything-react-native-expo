---
description: React Native Skia — high-performance 2D graphics, custom drawing, shaders, animations with Reanimated
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Skia (@shopify/react-native-skia)

High-performance 2D graphics library for React Native. Uses Skia (same engine as Chrome, Flutter, Android) for hardware-accelerated drawing.

## Setup

```bash
npx expo install @shopify/react-native-skia
```

Requires **New Architecture** (mandatory since RN 0.82). Works with Expo SDK 53+.

## Canvas

All Skia drawing happens inside a `<Canvas>`:

```tsx
import { Canvas, Circle, Fill } from '@shopify/react-native-skia';

function MyDrawing() {
  return (
    <Canvas style={{ width: 256, height: 256 }}>
      <Fill color="white" />
      <Circle cx={128} cy={128} r={100} color="cyan" />
    </Canvas>
  );
}
```

## Drawing Primitives

### Shapes

```tsx
import { Canvas, Rect, RoundedRect, Circle, Oval, Line, Points, DiffRect, Fill } from '@shopify/react-native-skia';

// Rectangle
<Rect x={0} y={0} width={100} height={80} color="red" />

// Rounded rectangle
<RoundedRect x={0} y={0} width={100} height={80} r={12} color="blue" />

// Circle
<Circle cx={50} cy={50} r={40} color="cyan" />

// Oval (bounding rectangle)
<Oval x={0} y={0} width={100} height={60} color="magenta" />

// Line
<Line p1={{ x: 0, y: 0 }} p2={{ x: 100, y: 100 }} color="black" strokeWidth={2} />

// Points
<Points points={[{ x: 0, y: 0 }, { x: 50, y: 100 }]} mode="polygon" color="red" strokeWidth={2} />
```

### Path (SVG notation or programmatic)

```tsx
import { Canvas, Path, Skia } from '@shopify/react-native-skia';

// SVG path string
<Path
  path="M 128 0 L 168 80 L 256 93 L 192 155 L 207 244 L 128 202 L 49 244 Z"
  color="lightblue"
/>

// Programmatic path
const path = Skia.Path.Make();
path.moveTo(0, 0);
path.lineTo(100, 0);
path.lineTo(100, 100);
path.close();

<Path path={path} color="red" />

// Path trimming (animate drawing)
<Path
  path={svgPath}
  style="stroke"
  strokeWidth={4}
  color="blue"
  start={0}      // 0-1: where drawing starts
  end={0.75}     // 0-1: where drawing ends
/>
```

### Image

```tsx
import { Canvas, Image, useImage } from '@shopify/react-native-skia';

function ImageDemo() {
  const image = useImage(require('./photo.jpg'));
  if (!image) return null;
  return (
    <Canvas style={{ flex: 1 }}>
      <Image image={image} x={0} y={0} width={256} height={256} fit="cover" />
    </Canvas>
  );
}
```

### Text

```tsx
import { Canvas, Text, useFont } from '@shopify/react-native-skia';

function TextDemo() {
  const font = useFont(require('./fonts/Inter.ttf'), 24);
  return (
    <Canvas style={{ flex: 1 }}>
      <Text x={20} y={40} text="Hello Skia" font={font} color="black" />
    </Canvas>
  );
}
```

### Paragraph (rich text)

```tsx
import { Canvas, Paragraph, Skia } from '@shopify/react-native-skia';

const paragraph = Skia.ParagraphBuilder.Make()
  .pushStyle({ fontSize: 24, fontFamilies: ['Roboto'], color: Skia.Color('black') })
  .addText('Hello from Skia paragraph')
  .pop()
  .build();

<Canvas style={{ width: 256, height: 256 }}>
  <Paragraph paragraph={paragraph} x={0} y={0} width={256} />
</Canvas>;
```

### Text on Path

```tsx
import { Canvas, TextPath, Skia, useFont } from '@shopify/react-native-skia';

const circlePath = Skia.Path.Make();
circlePath.addCircle(128, 128, 80);

<TextPath font={font} path={circlePath} text="Hello curved text!" color="blue" />;
```

## Paint Properties

Paint is applied via props or children:

```tsx
// Via props
<Circle cx={50} cy={50} r={40} color="red" style="fill" />
<Circle cx={50} cy={50} r={40} color="blue" style="stroke" strokeWidth={3} />
<Circle cx={50} cy={50} r={40} color="green" opacity={0.5} />

// Blend modes
<Circle cx={50} cy={50} r={40} color="cyan" blendMode="multiply" />
```

## Group (shared paint, transforms, clipping)

```tsx
import { Canvas, Group, Circle, Rect, Paint, Blur, Skia } from '@shopify/react-native-skia';

// Shared paint properties
<Group color="lightblue" style="stroke" strokeWidth={4}>
  <Circle cx={64} cy={64} r={40} />
  <Rect x={100} y={30} width={80} height={60} />
</Group>

// Transform
<Group transform={[{ rotate: Math.PI / 4 }]} origin={{ x: 128, y: 128 }}>
  <Rect x={96} y={96} width={64} height={64} color="red" />
</Group>

// Clipping with path
const clipPath = Skia.Path.MakeFromSVGString('M 0 0 L 256 0 L 128 256 Z')!;
<Group clip={clipPath}>
  <Fill color="magenta" />
</Group>

// Layer with blur effect
<Group layer={<Paint><Blur blur={10} /></Paint>}>
  <Circle cx={64} cy={64} r={40} color="yellow" />
</Group>
```

## Shaders

### Gradients

```tsx
import { Canvas, Fill, LinearGradient, RadialGradient, SweepGradient, vec } from '@shopify/react-native-skia';

// Linear gradient
<Fill>
  <LinearGradient start={vec(0, 0)} end={vec(256, 256)} colors={['cyan', 'magenta']} />
</Fill>

// Radial gradient
<Fill>
  <RadialGradient c={vec(128, 128)} r={128} colors={['red', 'blue']} />
</Fill>

// Sweep gradient
<Fill>
  <SweepGradient c={vec(128, 128)} colors={['cyan', 'magenta', 'yellow', 'cyan']} />
</Fill>
```

### Custom Runtime Shaders (GLSL)

```tsx
import { Canvas, Fill, Shader, Skia } from '@shopify/react-native-skia';

const source = Skia.RuntimeEffect.Make(`
  vec4 main(vec2 pos) {
    vec2 uv = pos / vec2(256);
    return vec4(uv.x, uv.y, 0.5, 1);
  }
`)!;

<Canvas style={{ width: 256, height: 256 }}>
  <Fill>
    <Shader source={source} />
  </Fill>
</Canvas>;
```

### Image Shader

```tsx
import { Canvas, Circle, ImageShader, useImage } from '@shopify/react-native-skia';

const image = useImage(require('./texture.jpg'));

<Circle cx={128} cy={128} r={128}>
  <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width: 256, height: 256 }} />
</Circle>;
```

### Noise Shaders

```tsx
import { Canvas, Fill, FractalNoise, Turbulence } from '@shopify/react-native-skia';

<Fill>
  <FractalNoise freqX={0.05} freqY={0.05} octaves={4} />
</Fill>

<Fill>
  <Turbulence freqX={0.05} freqY={0.05} octaves={4} />
</Fill>
```

## Filters & Effects

### Image Filters

```tsx
import { Canvas, Circle, Blur, Shadow, ColorMatrix } from '@shopify/react-native-skia';

// Blur
<Circle cx={128} cy={128} r={80} color="cyan">
  <Blur blur={10} />
</Circle>

// Drop shadow
<Circle cx={128} cy={128} r={80} color="white">
  <Shadow dx={5} dy={5} blur={10} color="rgba(0,0,0,0.5)" />
</Circle>

// Inner shadow
<Circle cx={128} cy={128} r={80} color="white">
  <Shadow dx={5} dy={5} blur={10} color="rgba(0,0,0,0.3)" inner />
</Circle>

// Color matrix (grayscale example)
<Circle cx={128} cy={128} r={80}>
  <ColorMatrix
    matrix={[
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0.2126, 0.7152, 0.0722, 0, 0,
      0,      0,      0,      1, 0,
    ]}
  />
</Circle>
```

### Backdrop Filter / Blur

```tsx
import { Canvas, BackdropFilter, Blur, Fill, Circle } from '@shopify/react-native-skia';

// Backdrop blur (like iOS glassmorphism)
<Canvas style={{ flex: 1 }}>
  <Circle cx={128} cy={128} r={80} color="red" />
  <BackdropFilter clip={{ x: 0, y: 0, width: 256, height: 128 }}>
    <Blur blur={20} />
  </BackdropFilter>
</Canvas>;
```

### Path Effects

```tsx
import { Canvas, Path, DashPathEffect, DiscretePathEffect, CornerPathEffect } from '@shopify/react-native-skia';

// Dashed line
<Path path={svgPath} style="stroke" strokeWidth={2} color="black">
  <DashPathEffect intervals={[10, 5]} />
</Path>

// Rough/sketchy effect
<Path path={svgPath} style="stroke" strokeWidth={2}>
  <DiscretePathEffect length={10} deviation={2} />
</Path>

// Rounded corners on path
<Path path={svgPath} style="stroke" strokeWidth={2}>
  <CornerPathEffect r={20} />
</Path>
```

## Animations with Reanimated

Skia integrates directly with Reanimated — pass shared values as props without `createAnimatedComponent`:

```tsx
import { Canvas, Circle, Group } from '@shopify/react-native-skia';
import { useSharedValue, useDerivedValue, withRepeat, withTiming } from 'react-native-reanimated';
import { useEffect } from 'react';

function AnimatedCircles() {
  const r = useSharedValue(0);
  const c = useDerivedValue(() => 256 - r.value);

  useEffect(() => {
    r.value = withRepeat(withTiming(85, { duration: 1000 }), -1, true);
  }, []);

  return (
    <Canvas style={{ width: 256, height: 256 }}>
      <Group blendMode="multiply">
        <Circle cx={r} cy={r} r={r} color="cyan" />
        <Circle cx={c} cy={r} r={r} color="magenta" />
        <Circle cx={128} cy={c} r={r} color="yellow" />
      </Group>
    </Canvas>
  );
}
```

### Animated Gradients

```tsx
import { Canvas, Fill, LinearGradient, vec, interpolateColors } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

// Use interpolateColors from Skia (not Reanimated's interpolateColor)
const gradientColors = useDerivedValue(() => {
  return [
    interpolateColors(progress.value, [0, 1], ['cyan', 'magenta']),
    interpolateColors(progress.value, [0, 1], ['yellow', 'blue']),
  ];
});

<Fill>
  <LinearGradient start={vec(0, 0)} end={vec(256, 256)} colors={gradientColors} />
</Fill>;
```

## Snapshot / Export

```tsx
import { makeImageFromView } from '@shopify/react-native-skia';

// Capture a React Native view as a Skia image
const snapshot = await makeImageFromView(viewRef);

// Canvas ref snapshot
const canvasRef = useRef(null);
const image = canvasRef.current?.makeImageSnapshot();
const base64 = image?.encodeToBase64();
```

## Common Use Cases

| Use Case         | Approach                                    |
| ---------------- | ------------------------------------------- |
| Custom charts    | Path + LinearGradient + animations          |
| Glassmorphism    | BackdropFilter + Blur                       |
| Image effects    | Image + ColorMatrix / Blur / custom shaders |
| Custom buttons   | RoundedRect + Shadow + gradients            |
| Particle effects | Points + Reanimated shared values           |
| Gauge / progress | Path with trim (start/end) animation        |
| Heatmaps         | Vertices with per-vertex colors             |
| Drawing canvas   | Path built from touch points                |

## Picture API (Immediate Mode)

For dynamic element counts, games, generative art, particle trails — when you can't define the element tree statically:

```tsx
import { Canvas, Picture, Skia, createPicture } from '@shopify/react-native-skia';

const picture = createPicture((canvas) => {
  const paint = Skia.Paint();
  paint.setColor(Skia.Color('cyan'));

  // Draw hundreds of particles imperatively
  for (const p of particles) {
    canvas.drawCircle(p.x, p.y, p.radius, paint);
  }
});

<Canvas style={{ flex: 1 }}>
  <Picture picture={picture} />
</Canvas>
```

Use Picture for complex static content that doesn't change every frame — it caches the draw commands.

## Atlas (Batched Sprite Rendering)

Render hundreds of elements from a single texture with individual transforms:

```tsx
import { Canvas, Atlas, useTexture, useRSXformBuffer, rect } from '@shopify/react-native-skia';

const texture = useTexture(require('./sprites.png'));
const sprites = useRSXformBuffer(100, (val, i) => {
  'worklet';
  // RSXform: [scos, ssin, tx, ty]
  val.set(Math.cos(angle), Math.sin(angle), positions[i].x, positions[i].y);
});

<Canvas style={{ flex: 1 }}>
  <Atlas image={texture} sprites={spriteRects} transforms={sprites} />
</Canvas>
```

## Canvas onSize

Get canvas dimensions as a shared value:

```tsx
const size = useSharedValue({ width: 0, height: 0 });

<Canvas style={{ flex: 1 }} onSize={size}>
  {/* size.value.width / size.value.height available in worklets */}
</Canvas>
```

## Performance Notes

- **Bundle size impact:** ~6MB iOS, ~4MB Android, ~2.9MB Web
- **Version requirements:** `react-native>=0.79`, `react>=19`. Use `@1.12.4` for older RN
- Skia renders on its own thread — does not block JS or UI threads
- Use `useDerivedValue` for computed animations (runs on UI thread)
- Prefer Skia's `interpolateColors` over Reanimated's `interpolateColor` — Reanimated's version produces wrong results in Skia context
- Canvas redraws when any prop changes — memoize expensive computations
- Use `Picture` component to cache complex static drawings
- **Transform origin** in Skia Group uses top-left corner, not center (unlike RN)
- `Skia.RuntimeEffect.Make()` returns `null` on shader compilation failure — always null-check
