---
title: Getting started
description: Install the @erne/monitor SDK, wrap your app with the monitor runtime, and point it at a dashboard.
---

This guide gets `@erne/monitor` running in a React Native / Expo app: install
the SDK, wrap your app root, and stream events to a local dashboard.

## Requirements

`@erne/monitor` is **New Architecture only** (Fabric + TurboModules).

| Target         | Min    | Tested up to |
| -------------- | ------ | ------------ |
| React Native   | 0.74   | 0.89         |
| React          | 18.2   | 19.x         |
| Expo SDK       | 51     | 56           |
| iOS            | 15.1   | 18           |
| Android        | API 24 | API 35       |
| Node (tooling) | 20     | 22           |

## 1. Install the SDK

```bash
npx expo install @erne/monitor
```

The fastest path is the `init` command, which wires everything for you and is
idempotent (re-run safe — pass `--dry-run` to preview without writing):

```bash
npx @erne/monitor init
```

`init` renders a `monitor.config.ts`, wraps your root layout with
`<MonitorProvider>`, and adds `@erne/monitor/babel-plugin` to your Babel config.
After `init`, install the package if it isn't already a dependency (the command
prints the exact install line for your package manager), then start Metro.

If you prefer to wire it by hand, the remaining steps show the minimal manual
setup.

## 2. Wrap your app root

Wrap your application root with `<MonitorProvider>`. It boots the SDK runtime on
mount, exposes it via React Context, and tears it down on unmount — it renders
no visual output.

```tsx
// app/_layout.tsx (Expo Router) — or your App.tsx root
import { MonitorProvider } from '@erne/monitor';

export default function RootLayout() {
  return (
    <MonitorProvider>
      {/* your navigation / app tree */}
    </MonitorProvider>
  );
}
```

Defaults are production-tuned (quiet at idle, noisy when it matters), so this is
a complete, working integration. To customise collectors and sampling, see
[SDK configuration](/sdk-configuration/).

## 3. Point it at a dashboard

In **local-only mode** there is no server at all — events stay on-device and are
read through the in-process runtime and the Expo DevTools panel. To stream
events to a dashboard you can read in a browser, start one locally:

```bash
npx @erne/monitor dashboard
```

The dashboard server defaults to port `3333` and persists ingested events to
SQLite at `~/.erne/monitor/dashboard.db`. The UI (live feed, crash groups,
sessions, metrics) is served at `http://127.0.0.1:3333/`. Useful flags:

```bash
npx @erne/monitor dashboard --open          # open a browser
npx @erne/monitor dashboard --port 4000      # override the port
npx @erne/monitor dashboard --host 0.0.0.0   # bind a non-loopback host
npx @erne/monitor dashboard --db ./events.db # override the SQLite path
```

Then point the SDK at it via the `dashboardUrl` prop, which opens a WebSocket
stream to the dashboard (typically `ws://localhost:3333/monitor` in dev):

```tsx
<MonitorProvider dashboardUrl="ws://localhost:3333/monitor">
  {/* app tree */}
</MonitorProvider>
```

Reload your app and events stream in live.

## 4. Verify the integration

The CLI ships a doctor command that validates your integration end-to-end, and a
`scan` command that recommends collectors based on your source:

```bash
npx @erne/monitor doctor          # validate your integration
npx @erne/monitor doctor --ping   # also verify the dashboard is reachable
npx @erne/monitor scan            # recommend collectors from your source
```

You can also tail events directly in the terminal:

```bash
npx @erne/monitor monitor live
```

## Minimal working example

A complete `app/_layout.tsx` that turns on dev-time global exposure (handy for
Maestro flows and diagnostics screens) and streams to a local dashboard:

```tsx
import { MonitorProvider } from '@erne/monitor';

export default function RootLayout() {
  return (
    <MonitorProvider
      dashboardUrl="ws://localhost:3333/monitor"
      exposeGlobal // publishes the runtime on globalThis.__ERNE_MONITOR__ (dev)
    >
      {/* navigation / screens */}
    </MonitorProvider>
  );
}
```

Inside your tree, read the runtime with the `useMonitor()` hook — for example to
tag events with a user id for DSAR (GDPR) export / delete:

```tsx
import { useMonitor } from '@erne/monitor';

function Settings() {
  const monitor = useMonitor();
  // monitor is `MonitorRuntime | null` — null during the one-frame boot or
  // outside a <MonitorProvider>. Use useMonitor({ strict: true }) to throw
  // on a missing provider.

  const onLogin = (userId: string) => monitor?.setUserId(userId);
  const onExport = () => monitor?.exportUserData('user-42');
  const onDelete = () => monitor?.deleteUserData('user-42');
  // ...
}
```

## Native (iOS + Android) wiring

The package also ships an Expo config plugin for native wiring (signal-safe
crash handlers, ANR watchdog, dual-thread FPS, etc.). Add the plugin to your
`app.json` / `app.config.*` and rebuild the native projects (`npx expo prebuild`
followed by a native build) to pick up the native collectors. Pure-JS collectors
(JS crashes, network, navigation, render) work without a native rebuild.

## Next steps

- [SDK configuration](/sdk-configuration/) — collectors, sampling, PII
  sanitization, remote config.
- [Self-hosting the dashboard](/self-hosting/) — SQLite vs Postgres, RBAC,
  ingest keys.
- [MCP integration](/mcp-integration/) — let Claude query your data and open fix
  PRs.
