# `@erne/monitor` — Minimal Demo

Tiny Expo SDK 55 / RN 0.83 / React 19 app that boots the SDK with
default config and exposes a one-screen diagnostics surface. Used for:

- Manual smoke testing on a physical device or simulator
- Driving the Maestro chaos flows at
  `packages/monitor/maestro/chaos/*.yaml`
- Recording the 2-minute launch demo video

## Run

```bash
cd packages/monitor/examples/minimal-demo
npm install
npx expo prebuild --clean
npx expo run:ios      # or run:android
```

## What it shows

| Button | What it does |
| ------ | ------------ |
| Trigger JS Crash | Throws a synthetic `Error` → CrashCollector persists it |
| Trigger Native Crash | Calls native `triggerTestCrash` (SIGSEGV / abort) |
| Trigger ANR (6s) | Blocks the main thread — watchdog fires at 5s |
| Trigger Span Crash | Starts a span named `checkout-flow`, then aborts |
| Trigger Crash Loop (5) | Fires 5 JS crashes in quick succession — exercises the circuit breaker |
| Simulate Offline | Monkey-patches fetch so every request rejects |
| Simulate Slow Network | Adds a 2s delay to every fetch |
| Diagnostics Dump | Prints live counters from `globalThis.__ERNE_MONITOR__` |

## How the SDK is wired

- `app/_layout.tsx` — `<MonitorProvider exposeGlobal>` at the root
- `app.config.ts` — `@erne/monitor/plugin` handles iOS + Android
  permissions, privacy manifest, and ATS exception for the dev
  dashboard
- `metro.config.js` — resolves `@erne/monitor` to the sibling workspace
  so the demo always runs against local source

## Inside the Maestro flow

`globalThis.__ERNE_MONITOR__` exposes `{ runtime, stats, native }` so
the Diagnostics Dump output is deterministic — Maestro assertions key
on those labels (`total:`, `stored:`, `native state:`, etc.).
