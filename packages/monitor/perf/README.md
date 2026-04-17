# Performance Regression Tests (Reassure)

This directory contains [Reassure](https://callstack.github.io/reassure/)
performance regression tests for `@erne/monitor`. They measure the SDK's
overhead against two baselines:

1. **SDK-off** — a component rendered with no SDK attached.
2. **SDK-on** — the same component wrapped in `<MonitorProvider>` with the
   default configuration.

The reported delta is what the SDK costs a consumer. Budgets mirror the
design spec §7:

| Metric                     | Budget             |
| -------------------------- | ------------------ |
| Additional render time     | < 5%               |
| Additional memory          | < 5 MB             |
| Additional CPU (sustained) | < 2%               |
| Additional bundle size     | See `.size-limit.json` |

## Running

Reassure needs a React Native runtime to measure renders realistically,
so these tests run in the Expo demo app (Tasks 87/88), not in the monitor
package itself. Inside the demo app:

```bash
cd examples/full-showcase
npx expo install reassure
yarn reassure             # measure current
yarn reassure --baseline  # set a new baseline before comparison
```

## Files

- `provider-overhead.perf-test.tsx` — mount + re-render cost of
  `<MonitorProvider>` around a trivial tree.
- `list-render.perf-test.tsx` — cost when a `FlatList` with 100 items
  renders under the SDK.
- `crash-collection.perf-test.tsx` — cost of `CrashCollector` being
  attached when an error boundary catches a thrown error.

These files are stubs — the real tests land when
`examples/full-showcase` (Task 88) is wired up.
