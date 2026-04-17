# @erne/monitor

> Runtime intelligence for React Native & Expo — crash reporting, dual-thread FPS, ANR detection, session replay, AI-powered diagnosis, self-hostable dashboard. Measured `<2%` CPU, `<5MB` memory, `<75KB` gzipped for the full SDK.

```bash
npx expo install @erne/monitor
```

```tsx
import { MonitorProvider } from '@erne/monitor';

export default function Layout() {
  return (
    <MonitorProvider>
      <Stack />
    </MonitorProvider>
  );
}
```

That's it. Every collector, the signal router, the event store, and the native crash handler are now wired with production-tuned defaults.

---

## What it captures

| | Category | Detail |
| -- | -------- | ------ |
| 💥 | **Crashes** | JS exceptions + unhandled rejections (burst-coalesced) · native SIGSEGV/abort via signal-safe POSIX handler · persisted across process death, drained on next launch |
| 🧊 | **ANRs** | Watchdog-thread detection (5s threshold) · real main-thread stack on iOS via `mach_thread` + `thread_get_state` + FP-chain walk · Android `Looper.getMainLooper().thread.stackTrace` with Zygote/Looper tail trimming |
| 📈 | **Performance** | Dual-thread FPS (native UI vs JS) · Fabric commit latency · Hermes CPU profiler · frame-drop detection (≥20% drop sustained ≥1s) · long-task observer · memory + thermal polling |
| 🎥 | **Session replay** | PII-masked screenshots in a ring buffer · replay masker (secureTextEntry / accessibility label / testID) · layout snapshot · navigation-triggered visual repro |
| 🧠 | **Intelligence** | Signal router (dedup → correlate → confidence → context → dispatch) · 20-pattern built-in library · on-device anomaly detection with OTA rule updates · MTTR / DORA metrics · cross-project pattern learning |
| 📡 | **Transport** | Offline-first batch upload · exponential backoff with jitter · gzip · OpenTelemetry (traces + logs + metrics) export · pluggable backends |
| 🛠️ | **Dev tools** | Terminal warnings in Metro · live WebSocket dashboard · Expo DevTools panel · shake-to-report bug reporter with attachment bundling |
| 🔒 | **Privacy** | Per-category consent gate · PII sanitizer (email / phone / auth headers / URLs) · Apple Privacy Manifest bundled · DSAR export / delete APIs |

---

## 30-second quickstart

1. **Install.**
   ```bash
   npx expo install @erne/monitor
   ```
2. **Add the config plugin** (handles iOS + Android native wiring automatically):
   ```ts
   // app.config.ts
   export default {
     expo: {
       plugins: ['@erne/monitor/plugin'],
     },
   };
   ```
3. **Wrap your root layout:**
   ```tsx
   // app/_layout.tsx
   import { MonitorProvider } from '@erne/monitor';
   export default function Layout() {
     return (
       <MonitorProvider>
         <Stack />
       </MonitorProvider>
     );
   }
   ```
4. **Rebuild native** (once):
   ```bash
   npx expo prebuild --clean && npx expo run:ios
   ```

Done. Crashes, ANRs, navigation, frame drops, renders, network calls, and memory samples now flow through the SDK.

---

## Tree-shakeable imports

Small bundle, a la carte. Each subpath pulls only the collectors + code it names.

| Import | Size (gzip) | Contents |
| ------ | ----------- | -------- |
| `@erne/monitor` | 67 KB | Everything — simplest to wire, biggest bundle |
| `@erne/monitor/performance` | 7 KB | Render / FrameDrop / Startup / Memory / LongTask / DualThreadFPS / FabricCommit / Hermes profiler |
| `@erne/monitor/network` | 2 KB | NetworkCollector only |
| `@erne/monitor/ai` | 11 KB | SignalRouter pipeline + pattern library + anomaly detector |
| `@erne/monitor/replay` | 4 KB | ReplayMasker + capture collectors |
| `@erne/monitor/dev` | 5 KB | TerminalReporter + ExpoDevTools + BugReporter + DashboardBridge |
| `@erne/monitor/testing` | 5 KB | `generateSyntheticEvent`, `CrashInjector`, `NetworkDegrader` |

---

## Configure

Defaults are production-tuned (quiet at idle, noisy when it matters). Override only what you care about:

```tsx
import { defineMonitorConfig } from '@erne/monitor';

const config = defineMonitorConfig({
  sampling: {
    prod: 0.1,                    // global rate, non-crash events
    byType: {
      render: { prod: 0.01 },     // aggressive down-sample of render events
      network: { prod: 0.5 },
    },
  },
  consent: { crashes: true, analytics: true, replay: false },
  ai: { autoFix: 'suggest', maxFilesPerFix: 5 },
  transport: { endpoint: 'https://ingest.example.com', batchInterval: 60_000 },
});

<MonitorProvider config={config}>…</MonitorProvider>
```

See the JSDoc on `defineMonitorConfig` in [`src/core/Config.ts`](./src/core/Config.ts) and `DEFAULT_SAMPLING_BY_TYPE` for every option and per-type sampling floor.

---

## DSAR API (GDPR)

Tag events with an opaque user id, export them on request, delete them on revoke.

```tsx
import { useMonitor } from '@erne/monitor';

function Settings() {
  const monitor = useMonitor();

  const onLogin = (userId: string) => monitor?.setUserId(userId);
  const onExport = () => monitor?.exportUserData('user-42');
  const onDelete = () => monitor?.deleteUserData('user-42');
  // ...
}
```

`useMonitor()` returns `MonitorRuntime | null` — null during the one-frame boot or outside a `<MonitorProvider>`. Use `useMonitor({ strict: true })` to throw on missing provider.

---

## Platforms

| | Min | Tested up to |
| -- | --- | ------------ |
| React Native | 0.74 | 0.89 |
| React | 18.2 | 19.x |
| Expo SDK | 51 | 56 |
| iOS | 15.1 | 18 |
| Android | API 24 (SDK 35) | API 35 |
| Node (tooling) | 20 | 22 |

New Architecture only (Fabric + TurboModules).

---

## Why another monitor?

| Feature | Sentry | Crashlytics | Datadog | Embrace | **@erne/monitor** |
| ------- | ------ | ----------- | ------- | ------- | ----------------- |
| Crash reporting | ✅ | ✅ | ✅ | ✅ | ✅ |
| Performance tracing | ✅ | ❌ | ✅ | ✅ | ✅ |
| Session replay | ✅ | ❌ | ✅ | ❌ | ✅ |
| AI crash analysis | basic | gemini (Android) | ❌ | ❌ | **full pipeline** |
| AI auto-fix | ❌ | ❌ | ❌ | ❌ | **✅** |
| Re-render detection | ❌ | ❌ | ❌ | ❌ | **✅** |
| Fabric commit tracking | ❌ | ❌ | ❌ | ❌ | **✅** |
| Dual-thread FPS | ❌ | ❌ | ✅ | ❌ | **✅** |
| OpenTelemetry export | ❌ | ❌ | ✅ | ✅ | **✅** |
| Self-hosted option | ❌ | ❌ | ❌ | ❌ | **✅** |

---

## Examples

- [`examples/minimal-demo`](./examples/minimal-demo) — single-screen Expo SDK 55 app, every crash / ANR / network trigger surfaced as a button. Used by Maestro chaos flows.
- [`examples/full-showcase`](./examples/full-showcase) — 3-tab demo with Feed (FlashList + expo-image + fetch), Live Stats (reads `__ERNE_MONITOR__`), Settings (consent + DSAR + chaos + network degrader), detail screen with Suspense + render-storm button.

---

## Docs

- [Migrating from Sentry](./docs/MIGRATING-FROM-SENTRY.md) · [from Crashlytics](./docs/MIGRATING-FROM-CRASHLYTICS.md)
- [Bundle analysis](./docs/BUNDLE-ANALYSIS.md) — live per-subpath sizes + transitive imports
- [CHANGELOG](./CHANGELOG.md) — semver policy + release notes
- Source-level reference: `src/core/Config.ts` · `src/core/createMonitorRuntime.ts` · `src/signal-router/SignalRouter.ts` · `src/native/ErneMonitorNative.ts`
- Collector catalog: every collector lives in [`src/collectors/`](./src/collectors) with JSDoc on its options, events, and edge cases

---

## License

MIT © [Juba Kitiashvili](https://github.com/JubaKitiashvili). See [LICENSE](../../LICENSE).
