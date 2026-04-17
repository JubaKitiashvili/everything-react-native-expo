# Migrating from `@sentry/react-native` → `@erne/monitor`

This guide is for teams moving off Sentry's React Native SDK. Scope:
stop sending events to `sentry.io`, start sending them to an ERNE
backend (or nowhere — `@erne/monitor` ships a local-only mode). Side
effects: you get re-render detection, Fabric commit tracking, dual-
thread FPS, session replay, and on-device anomaly detection — all of
which Sentry RN does not ship.

## 0. Feature parity

| Sentry feature            | `@erne/monitor` equivalent                               |
| ------------------------- | -------------------------------------------------------- |
| `Sentry.init()`           | `<MonitorProvider config={defineMonitorConfig(…)}>`      |
| DSN                       | `config.transport.endpoint` (or `null` for local-only)   |
| `Sentry.captureException` | `monitor.trackEvent('custom_error', …)` or rethrow; CrashCollector chains ErrorUtils |
| `Sentry.captureMessage`   | `monitor.trackEvent(name, attributes)`                   |
| `Sentry.addBreadcrumb`    | `monitor.leaveBreadcrumb({ category, message, level })`  |
| `Sentry.setUser({ id })`  | `monitor.setUserId(id)`                                  |
| `Sentry.setTag(k, v)`     | include in `trackEvent` attributes                       |
| Release tracking          | `app.config.ts` version → Enricher picks it up           |
| Performance monitoring    | RenderCollector / FrameDropCollector / DualThreadFPS enabled by default |
| Session Replay            | `consent.replay: true` + `@erne/monitor/replay` subpath  |
| Source maps upload        | `@erne/monitor/plugin` + EAS Build post-build hook       |

### What `@erne/monitor` adds

- **Re-render storm detection** with props/state hints (storm vs slow vs informational)
- **Fabric commit latency** (React diff → native mutation timing)
- **Dual-thread FPS** (separate UI thread vs JS thread)
- **Hermes CPU profiler bridge**
- **On-device anomaly detection** (no server round-trip)
- **Self-hosted dashboard** that works without any backend
- **Apple Privacy Manifest** bundled + required-reason API declarations

### What `@erne/monitor` does NOT ship (yet)

- Sentry's hosted SaaS UI — use the bundled dashboard or point
  `transport.endpoint` at your own OTel collector.
- Distributed tracing across backend services — we emit OTel spans
  locally; stitching with your backend is your collector's job.
- Release health (`crash-free sessions over time`) — on the roadmap.

## 1. Remove Sentry

```bash
npx expo install --remove @sentry/react-native sentry-expo
```

Delete the Sentry config plugin from `app.config.ts` and any
`Sentry.init(…)` call at app entry.

## 2. Install @erne/monitor

```bash
npx expo install @erne/monitor
```

In `app.config.ts`:

```ts
export default {
  expo: {
    plugins: ['@erne/monitor/plugin'],
  },
};
```

## 3. Wrap your root layout

```tsx
// app/_layout.tsx
import { MonitorProvider, defineMonitorConfig } from '@erne/monitor';

const config = defineMonitorConfig({
  // Local-only for now — point at your collector when ready.
  transport: { endpoint: null, batchInterval: 60_000, maxBatchSize: 100 },
  consent: { crashes: true, analytics: true, replay: false },
});

export default function Layout() {
  return (
    <MonitorProvider config={config}>
      <Stack />
    </MonitorProvider>
  );
}
```

## 4. Translate your API calls

| Sentry                                              | `@erne/monitor`                                                             |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `Sentry.captureException(err)`                      | `throw err` — CrashCollector chains ErrorUtils automatically                |
| `Sentry.captureMessage('user paid')`                | `monitor.trackEvent('user_paid')`                                           |
| `Sentry.addBreadcrumb({ category: 'ui', message })` | `monitor.leaveBreadcrumb({ category: 'ui', message, level: 'info' })`       |
| `Sentry.setUser({ id: '42' })`                      | `monitor.setUserId('42')`                                                   |
| `Sentry.setContext('order', { id })`                | include in `trackEvent('order_viewed', { orderId: id })`                    |
| `Sentry.startTransaction({ name })`                 | `monitor.runtime.spanSnapshot.startSpan({ name, … })`                       |

Grab `monitor` from the React context:

```tsx
import { useMonitor } from '@erne/monitor';

function CheckoutButton() {
  const monitor = useMonitor();
  const onPress = () => {
    monitor.trackEvent('checkout_tapped', { sku });
    monitor.leaveBreadcrumb({ category: 'ui', message: 'checkout', level: 'info' });
  };
}
```

## 5. Source maps

`@erne/monitor/plugin` already wires the EAS post-build hook that
uploads source maps to your own storage. Remove Sentry's
`@sentry/react-native/scripts/expo-upload-sourcemaps.js` from
package.json and drop the `SENTRY_AUTH_TOKEN` from your secrets.

## 6. Dashboard

The SDK streams to `ws://localhost:3333/monitor` in dev. Run the
bundled dashboard:

```bash
cd packages/monitor
npm run dashboard
```

Then open `http://localhost:3333/runtime.html`. In production, point
`transport.endpoint` at your OTel collector or our hosted backend
(optional — the SDK works local-only).

## 7. Decommission checklist

- [ ] `@sentry/react-native` and `sentry-expo` removed from dependencies
- [ ] `Sentry.init(…)` call deleted from app entry
- [ ] `Sentry.*` call sites replaced with `@erne/monitor` equivalents
- [ ] `sentry.properties` and any CI secrets referencing Sentry removed
- [ ] Sentry config plugin removed from `app.config.ts`
- [ ] `@erne/monitor/plugin` added to `app.config.ts` plugins
- [ ] `<MonitorProvider>` wrapped around your app root
- [ ] A test crash (`throw new Error('smoke')`) shows up in the ERNE dashboard

If a step above doesn't go smoothly, open an issue with the subcommand
output. The SDK aims to be a drop-in replacement for the core use cases
— gaps mean we missed something.
