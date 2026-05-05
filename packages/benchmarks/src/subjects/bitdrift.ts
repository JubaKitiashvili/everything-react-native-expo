// Task 117.91 — Bitdrift Capture subject (documented placeholder).
//
// Bitdrift's RN SDK is `@bitdrift/react-native`. Comparing against it
// requires a real Bitdrift account for the symbol-server side of
// symbolication_accuracy — most of the benchmarks work without one.

import type { Subject } from '../types.js';

export const bitdriftSubject: Subject = {
  id: 'bitdrift',
  label: 'Bitdrift Capture',
  packageName: '@bitdrift/react-native',
  version: '0.6.0',
  status: 'documented_placeholder',
  notes: [
    'Runbook to wire `bitdrift` natively:',
    '  1. `npm install @bitdrift/react-native@0.6.0` (no account needed for',
    '     bundle_size / install_time).',
    '  2. bundle_size: their main entry exports a small surface — walkAndGzip',
    '     handles it.',
    '  3. crash_latency: their SDK uses a ring-buffer, so the "first persisted',
    '     event" timing requires reading their internal state. Use',
    '     `BitdriftReactNative.flushPendingEvents()` and time the round-trip.',
    '  4. install_time: works out of the box — flip status to `native`.',
    '  5. symbolication_accuracy: requires a live symbol-server endpoint.',
    '     Either spin up the Bitdrift OSS server image or mark this benchmark',
    '     as `unsupported` for the bitdrift subject specifically.',
  ].join('\n'),

  async measureBundleSize() {
    return null;
  },
  async measureCrashLatency() {
    return null;
  },
  async measureInstallTime() {
    return null;
  },
  async measureSymbolicationAccuracy() {
    return null;
  },
};
