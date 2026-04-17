# `@erne/monitor` — Full Showcase

Three-tab Expo app that exercises every SDK surface. Used for:

- The 2-minute launch demo video (Task 121)
- Manual regression testing before every release
- Reassure perf baselines (`perf/*.perf-test.tsx`)

## Run

```bash
cd packages/monitor/examples/full-showcase
npm install
npx expo prebuild --clean
npx expo run:ios      # or run:android
```

## Tabs

### Feed
100-item `FlashList` with `expo-image` thumbnails. Tapping a row opens
a detail screen. Triggers:

- `NetworkCollector` — mock fetch on mount
- `ImageCollector` — load timing on every thumbnail
- `RenderCollector` / `FrameDropCollector` — scroll-induced renders
- `NavigationCollector` — tab switches + detail push

### Live Stats
Reads `globalThis.__ERNE_MONITOR__` every second. Shows:

- Pipeline counters (`total`, `stored`, `consentDropped`, `sampledDropped`, `burstThrottled`)
- Native state + recent-error count
- Event store row count (from `expo-sqlite` backend)
- Current session id

### Settings
Every consumer-facing SDK surface in one place:

- Consent toggles (`crashes` / `analytics` / `replay`)
- User id → DSAR export / delete buttons
- Chaos triggers (JS / Native / ANR / Crash Loop)
- Network degrader (offline / slow)

## Detail screen

Pushed from the Feed. Exercises `SuspenseCollector` + `ActivityCollector`
and has a "Force Re-render Storm" button that fires 10 state updates —
`RenderCollector` should classify this as `reason: 'storm'` (not
`informational`).

## Dashboard integration

The SDK streams events to `ws://localhost:3333/monitor` when the
ERNE dashboard server is running. `npm run start` on the monitor
package, then open `http://localhost:3333/runtime.html`.
