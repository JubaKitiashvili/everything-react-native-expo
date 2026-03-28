---
description: React Native Worklets — multithreading, UI/RN thread communication, custom runtimes, shared memory
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# React Native Worklets (react-native-worklets)

Multithreading for React Native. Run JavaScript on the UI thread, RN thread, or custom worker runtimes. Installed automatically with Reanimated v4.

## Thread Communication

### Fire-and-Forget (most common)

```tsx
import { scheduleOnUI, scheduleOnRN } from 'react-native-worklets';

// JS → UI thread (for animations)
scheduleOnUI(() => {
  'worklet';
  offset.value = withSpring(100);
});

// UI → JS thread (for React state, navigation, native APIs)
// Use inside gesture callbacks, animated reactions, etc.
const onComplete = (value: number) => {
  setState(value);
};

const handler = useAnimatedScrollHandler({
  onScroll: (event) => {
    if (event.contentOffset.y > 500) {
      scheduleOnRN(onComplete, event.contentOffset.y);
    }
  },
});
```

**Key:** `scheduleOnRN(fn, arg1, arg2)` passes args directly — NOT curried like the removed `runOnJS(fn)(args)`.

### Promise-Based (when you need the result)

```tsx
import { runOnUIAsync, runOnRuntimeAsync } from 'react-native-worklets';

// Returns a Promise
const measurement = await runOnUIAsync(() => {
  'worklet';
  return measure(animatedRef);
});
```

### Blocking (use sparingly)

```tsx
import { runOnUISync, runOnRuntimeSync } from 'react-native-worklets';

// Blocks calling thread until complete — avoid in hot paths
const value = runOnUISync(() => {
  'worklet';
  return offset.value;
});
```

## Runtime Detection

```tsx
import { isRNRuntime, isUIRuntime, isWorkerRuntime, getRuntimeKind } from 'react-native-worklets';

function myWorklet() {
  'worklet';
  if (isUIRuntime()) {
    // Safe to mutate shared values
  } else if (isRNRuntime()) {
    // Safe to call React APIs
  }
}
```

## Custom Worker Runtimes

Run heavy computation off both JS and UI threads:

```tsx
import { createWorkletRuntime, scheduleOnRuntime } from 'react-native-worklets';

const aiRuntime = createWorkletRuntime('ai-processing', {
  enableEventLoop: true,
});

scheduleOnRuntime(aiRuntime, () => {
  'worklet';
  // Heavy computation here — doesn't block UI or JS thread
});
```

## Shared Memory

### Serializable (read-only cross-runtime data)

```tsx
import { createSerializable } from 'react-native-worklets';

const config = createSerializable({ threshold: 0.5, maxItems: 100 });

// Pass to worklets — data is copied (not shared reference)
scheduleOnUI(() => {
  'worklet';
  console.log(config.threshold);
});
```

### Synchronizable (mutable shared state)

```tsx
import { createSynchronizable } from 'react-native-worklets';

const sharedState = createSynchronizable({ count: 0, items: [] });

// Read (non-blocking, may be stale)
const snapshot = sharedState.getDirty();

// Read (blocking, guaranteed fresh)
const fresh = sharedState.getBlocking();

// Write (blocking)
sharedState.setBlocking({ count: 1, items: ['a'] });

// Manual locking for multi-step operations
sharedState.lock();
const current = sharedState.getBlocking();
sharedState.setBlocking({ ...current, count: current.count + 1 });
sharedState.unlock();
```

## Worklet Classes

```tsx
class ParticleSystem {
  static __workletClass = true;

  particles: number[] = [];

  addParticle(x: number, y: number) {
    'worklet';
    this.particles.push(x, y);
  }

  update() {
    'worklet';
    // Physics simulation on UI thread
  }
}

// Instantiate on UI thread
scheduleOnUI(() => {
  'worklet';
  const system = new ParticleSystem();
  system.addParticle(100, 200);
});
```

## Migration from runOnJS / runOnUI

| Reanimated (removed) | Worklets (use instead) |
|---|---|
| `runOnJS(fn)(args)` | `scheduleOnRN(fn, args)` |
| `runOnUI(fn)()` | `scheduleOnUI(fn)` |
| N/A | `runOnUIAsync(fn)` — returns Promise |
| N/A | `runOnUISync(fn)` — blocking |
| N/A | `createWorkletRuntime()` — custom threads |
| N/A | `createSynchronizable()` — shared mutable state |

## Performance Rules

- `scheduleOnRN` is fire-and-forget — no return value, no blocking
- Use `runOnUIAsync` only when you need the result — adds Promise overhead
- Avoid `runOnUISync` / `runOnRuntimeSync` in hot paths — blocks the calling thread
- Custom runtimes (`createWorkletRuntime`) are ideal for heavy work (AI inference, audio processing)
- `Synchronizable.lock()` / `unlock()` — keep critical sections short to avoid deadlocks
