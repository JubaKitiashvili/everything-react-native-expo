---
description: react-freeze — prevent inactive screen re-renders for navigation performance
globs: '**/*.{ts,tsx}'
alwaysApply: false
---

# react-freeze

Prevents React component subtrees from re-rendering while hidden. Uses React Suspense internally — preserves native views, scroll positions, form state, and loaded images.

## Setup

```bash
npm install react-freeze
```

## Freeze Component

```tsx
import { Freeze } from 'react-freeze';

<Freeze freeze={isHidden}>
  <HeavyScreen />
</Freeze>

// With placeholder
<Freeze freeze={isHidden} placeholder={<LoadingSkeleton />}>
  <HeavyScreen />
</Freeze>
```

| Prop          | Type        | Description                                     |
| ------------- | ----------- | ----------------------------------------------- |
| `freeze`      | `boolean`   | When true, suspends rendering of children       |
| `placeholder` | `ReactNode` | Shown instead of frozen content (default: null) |
| `children`    | `ReactNode` | The subtree to freeze                           |

## Integration with react-native-screens

**Recommended approach** — enable globally, screens auto-freeze:

```tsx
// App entry file (App.tsx or index.ts)
import { enableFreeze } from 'react-native-screens';

enableFreeze(true);
```

This automatically freezes:

- **Stack navigators:** screens below top 2 (top 2 stay active for swipe-back gesture)
- **Tab navigators:** inactive tabs
- **Drawer navigators:** hidden screen

## State Behavior While Frozen

| State Type                    | Behavior                                                               |
| ----------------------------- | ---------------------------------------------------------------------- |
| `useState` / `useReducer`     | Updates queued, no render until unfrozen                               |
| Redux / Zustand               | Selectors run but no re-render. On unfreeze, renders with current data |
| Native views (scroll, inputs) | Fully preserved — views stay in hierarchy                              |
| `useEffect` cleanup           | Does NOT run (component not unmounted)                                 |

## When to Use

- Navigation stacks (via `enableFreeze`) — automatic
- Tab bars — freeze inactive tab content
- Modals — freeze background screen
- Any hidden-but-mounted UI that subscribes to frequently-changing state

## Performance Impact

- Eliminates wasted reconciliation for off-screen components
- Reduces JS thread work proportional to frozen subtree complexity
- Most impactful with deep stacks + global state (Redux/Zustand) that updates frequently

## Caveats

- Only freeze truly hidden content — freezing visible content shows placeholder
- Render-time side effects are skipped while frozen
- `useEffect` cleanup does NOT run on freeze (not an unmount)
- React Profiler may throw errors with frozen components (debugger limitation)
