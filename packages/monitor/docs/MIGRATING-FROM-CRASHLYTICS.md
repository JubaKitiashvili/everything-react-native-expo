# Migrating from Firebase Crashlytics → `@erne/monitor`

Firebase Crashlytics is great at one thing (crashes), doesn't ship
performance monitoring beyond a separate SDK, and ties you to GCP's
privacy posture. `@erne/monitor` covers crashes + ANRs + performance
+ replay in a single dependency, runs local-only by default, and
comes with its own self-hostable dashboard.

## 0. Feature parity

| Crashlytics feature                     | `@erne/monitor` equivalent                                 |
| --------------------------------------- | ---------------------------------------------------------- |
| `@react-native-firebase/crashlytics`    | `@erne/monitor` (crash + ANR + metrics)                    |
| `crashlytics().recordError(e)`          | `throw e` — CrashCollector chains ErrorUtils automatically |
| `crashlytics().log(msg)`                | `monitor.leaveBreadcrumb({ category, message, level })`    |
| `crashlytics().setUserId(id)`           | `monitor.setUserId(id)`                                    |
| `crashlytics().setAttribute(k, v)`      | attach to the next `trackEvent` call or breadcrumb         |
| `crashlytics().crash()`                 | `CrashInjector.triggerNativeCrash()` (dev-only)            |
| `crashlytics().setCrashlyticsCollectionEnabled(b)` | `monitor.setConsent({ crashes: b })`           |
| Firebase Performance SDK                | RenderCollector / FrameDropCollector / DualThreadFPS built in |
| dSYM / Proguard upload                  | `@erne/monitor/plugin` + EAS post-build hook               |

### Net add

- **ANR detection with real main-thread stack** (Crashlytics ships on
  Android only via a separate setup; iOS support is minimal)
- **Re-render storm + slow-render classification**
- **OpenTelemetry export** — route to your own backend, skip the Google
  Cloud vendor lock
- **Privacy Manifest** bundled with required-reason API declarations
- **Session replay** with PII masking
- **GDPR DSAR** — `exportUserData` / `deleteUserData` first-class

### What we don't cover

- Firebase Analytics / Remote Config / Cloud Messaging — keep those
  deps, just drop Crashlytics.
- Automatic issue assignment in Firebase Console — the SDK writes a
  stable `fingerprint` for every crash; your backend / dashboard
  groups from there.

## 1. Remove Crashlytics

```bash
npx expo install --remove @react-native-firebase/crashlytics @react-native-firebase/app
```

Only if Firebase Crashlytics is the _only_ Firebase product you use —
otherwise keep `@react-native-firebase/app` and just remove the
`crashlytics` package.

Drop the Firebase plugin from `app.config.ts` if Crashlytics was its
only reason for being there, plus any `google-services.json` +
`GoogleService-Info.plist` entries that were Crashlytics-only.

## 2. Install

```bash
npx expo install @erne/monitor
```

```ts
// app.config.ts
export default {
  expo: {
    plugins: ['@erne/monitor/plugin'],
  },
};
```

## 3. Wrap your app

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

No `firebase.initializeApp()` equivalent — wrapping the provider is
the whole setup.

## 4. Translate your API calls

| Crashlytics                          | `@erne/monitor`                                       |
| ------------------------------------ | ----------------------------------------------------- |
| `crashlytics().recordError(err)`     | `throw err`                                           |
| `crashlytics().log('payment start')` | `monitor.leaveBreadcrumb({ category: 'ui', message: 'payment start', level: 'info' })` |
| `crashlytics().setUserId('42')`      | `monitor.setUserId('42')`                             |
| `crashlytics().setAttribute('plan', 'pro')` | `monitor.trackEvent('user_context', { plan: 'pro' })` |
| `crashlytics().crash()`              | `new CrashInjector().triggerNativeCrash()` (dev)      |

```tsx
import { useMonitor } from '@erne/monitor';

function PaymentScreen() {
  const monitor = useMonitor();
  const onPay = () => {
    monitor.leaveBreadcrumb({
      category: 'ui',
      message: 'payment_start',
      level: 'info',
    });
  };
}
```

## 5. dSYM / ProGuard upload

`@erne/monitor/plugin` adds an EAS post-build hook that uploads
symbols to your storage. Remove the Firebase `fastlane` or
`gradle-plugin` configuration bits that were doing this for you.

## 6. Dashboard / backend

- **Local only** (default) — the SDK streams to the bundled
  WebSocket dashboard; no cloud involvement.
- **Self-hosted backend** — set `transport.endpoint` to your ingest
  URL; OTel-compatible collectors work out of the box.
- **Hosted (future)** — `app.erne.dev` is being stood up in
  Platform Phase 6; opt-in when available.

## 7. Decommission checklist

- [ ] `@react-native-firebase/crashlytics` removed from package.json
- [ ] Every `crashlytics()` call site replaced
- [ ] Firebase Crashlytics-only gradle tasks removed from Android
- [ ] Crashlytics-only run-script build phase removed from iOS (Xcode)
- [ ] `@erne/monitor/plugin` present in `app.config.ts` plugins
- [ ] `<MonitorProvider>` wraps the app root
- [ ] Test crash via `CrashInjector.triggerJSCrash()` shows up in the
      SDK dashboard / your configured transport endpoint
- [ ] Firebase Console project marked read-only / archived if no
      other Firebase products are in use
