# Maestro chaos test flows

End-to-end verification of `@erne/monitor`'s crash + offline + ANR
pipelines. Each flow drives `examples/minimal-demo` (shipped by
Task 87) and asserts the SDK captures / recovers correctly.

## Prerequisites

- [`maestro`](https://maestro.mobile.dev/) CLI installed
- iOS simulator booted, or Android emulator running
- `examples/minimal-demo` installed on the device (via `eas build` or
  `expo run:ios` / `expo run:android`)

## Running

```bash
# iOS (already-booted simulator)
maestro test packages/monitor/maestro/chaos/

# Android (connected emulator)
maestro test packages/monitor/maestro/chaos/ --include-tags=android
```

## Flows

| File | What it verifies |
| ---- | ---------------- |
| `01-js-crash.yaml` | JS error caught by CrashCollector → persisted → drained on next launch |
| `02-native-crash.yaml` | SIGSEGV caught by signal handler → persisted → drained |
| `03-anr.yaml` | 6s main-thread block → ANR watchdog fires → event with real main-thread stack |
| `04-crash-loop.yaml` | 5 quick crashes → SDK's circuit breaker disables non-critical collectors |
| `05-span-crash.yaml` | Active span + crash → `drainInterruptedSpans` surfaces the span |
| `06-offline-queue.yaml` | Offline simulation → events buffer in EventStore → flush on reconnect |

## Signal / verification

Each flow ends by tapping a "Diagnostics Dump" button on the demo
screen, which reads `globalThis.__ERNE_MONITOR__.stats` and prints a
summary. Maestro asserts the summary contains the expected signals.
If the native side didn't capture correctly, the assertion fails with
a screenshot + device log attached.
