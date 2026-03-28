---
description: React Native WebGPU — GPU rendering, compute shaders, TypeGPU, Three.js integration
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native WebGPU (react-native-wgpu)

WebGPU API for React Native using Dawn (Chrome's WebGPU implementation). Hardware-accelerated GPU rendering and compute.

## Setup

```bash
npm install react-native-wgpu
npx expo prebuild --clean
```

**Requires:** New Architecture (mandatory since RN 0.82).

## Canvas

```tsx
import { Canvas, useGPU } from 'react-native-wgpu';

function GPUScene() {
  const ref = useRef(null);

  const onCreateSurface = useCallback(async ({ context, device, presentationFormat }) => {
    // Standard WebGPU API — same as browser
    const pipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: { module: device.createShaderModule({ code: vertexShader }) },
      fragment: {
        module: device.createShaderModule({ code: fragmentShader }),
        targets: [{ format: presentationFormat }],
      },
    });

    // Render loop
    const frame = () => {
      const commandEncoder = device.createCommandEncoder();
      const textureView = context.getCurrentTexture().createView();
      const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{ view: textureView, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 1] }],
      });
      renderPass.setPipeline(pipeline);
      renderPass.draw(3);
      renderPass.end();
      device.queue.submit([commandEncoder.finish()]);
      context.present();
      requestAnimationFrame(frame);
    };
    frame();
  }, []);

  return <Canvas ref={ref} onCreateSurface={onCreateSurface} style={{ flex: 1 }} />;
}
```

## TypeGPU (Type-Safe Shaders)

TypeGPU provides type-safe WGSL shader authoring in TypeScript:

```bash
npm install typegpu @typegpu/noise @typegpu/sdf
```

```tsx
import tgpu from 'typegpu';
import * as d from 'typegpu/data';

// Define vertex function
const vertexFn = tgpu.vertexFn({
  in: { position: d.vec2f, color: d.vec3f },
  out: { position: d.builtin.position, color: d.vec3f },
})((input) => {
  'use gpu';
  return {
    position: d.vec4f(input.position, 0, 1),
    color: input.color,
  };
});

// Define fragment function
const fragmentFn = tgpu.fragmentFn({
  in: { color: d.vec3f },
  out: d.vec4f,
})((input) => {
  'use gpu';
  return d.vec4f(input.color, 1);
});
```

## Compute Shaders (GPU Compute)

For particle systems, physics simulations, boids, fluid dynamics:

```tsx
const computeFn = tgpu.computeFn({
  workgroupSize: [64],
  in: { globalId: d.builtin.globalInvocationId },
})((input) => {
  'use gpu';
  const idx = input.globalId.x;
  // Update particle positions on GPU
  particles[idx].x += velocities[idx].x * dt;
  particles[idx].y += velocities[idx].y * dt;
});
```

## Noise (@typegpu/noise)

```tsx
import { perlin2d, perlin3d, randf } from '@typegpu/noise';

// In GPU shader
const noise = perlin2d.sample(d.vec2f(x * 0.1, y * 0.1));
const noise3d = perlin3d.sample(d.vec3f(x, y, time)); // animated noise
const random = randf(seed); // PRNG
```

## SDF Rendering (@typegpu/sdf)

Signed Distance Functions for shape rendering and ray marching:

```tsx
import { circle, rect, union, subtract } from '@typegpu/sdf';

// Combine shapes
const shape = union(circle(center, radius), rect(corner, size));
const cutout = subtract(shape, circle(holeCenter, holeRadius));
```

## Reanimated Integration

GPU objects auto-serialize for worklets:

```tsx
import { scheduleOnUI } from 'react-native-worklets';

scheduleOnUI(() => {
  'worklet';
  // GPU rendering from UI thread — gesture-driven GPU effects
  updateGPUBuffer(offset.value);
});
```

## Three.js / React Three Fiber

```tsx
// metro.config.js — required patch
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName === 'three') {
    return { type: 'sourceFile', filePath: require.resolve('three/src/Three.WebGPU.js') };
  }
  return context.resolveRequest(context, moduleName, platform);
};
```

```tsx
import { Canvas } from '@react-three/fiber';
import { useFrame } from '@react-three/fiber';

function RotatingBox() {
  const ref = useRef();
  useFrame(() => { ref.current.rotation.y += 0.01; });
  return (
    <mesh ref={ref}>
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial color="hotpink" />
    </mesh>
  );
}
```

Requires Three.js r168+ for WebGPU entry point.

## When to Use

| Use Case | Tool |
|---|---|
| UI animations (opacity, transform) | Reanimated CSS Transitions / Shared Values |
| 2D charts, custom drawing | Skia (@shopify/react-native-skia) |
| Particle systems, physics | WebGPU compute shaders |
| 3D scenes, games | WebGPU + Three.js |
| Custom image filters | WebGPU fragment shaders |
| Fluid simulation, boids | WebGPU compute pipelines |

## Performance Notes

- GPU compute runs fully parallel — thousands of particles at 60fps
- Offloads work from both JS and UI threads
- `requestAnimationFrame` for render loops
- Minimize CPU↔GPU data transfers — keep data on GPU when possible
