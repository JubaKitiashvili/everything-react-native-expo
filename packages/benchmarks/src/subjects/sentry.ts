// Task 117.91 — Sentry React Native subject (documented placeholder).
//
// The benchmark suite does not ship a wired-up Sentry comparison. This
// stub describes the integration runbook a contributor would follow to
// fill it in. Until then every measure-* method returns null and the
// runner reports the subject as "documented_placeholder".

import type { Subject } from '../types.js';

export const sentrySubject: Subject = {
  id: 'sentry',
  label: '@sentry/react-native',
  packageName: '@sentry/react-native',
  // Pinned for reproducibility — bump in lockstep with the real
  // measurement pipeline. The harness reports this verbatim so future
  // numbers stay attributable to a known version.
  version: '5.31.1',
  status: 'documented_placeholder',
  notes: [
    'Runbook to wire `sentry` natively:',
    '  1. `npm install @sentry/react-native@5.31.1` in a sibling fixture',
    '     directory (not this package — keep the harness lean).',
    '  2. bundle_size: point `walkAndGzip` at',
    '     `node_modules/@sentry/react-native/dist/index.js`.',
    '  3. crash_latency: configure `Sentry.init({ dsn, transport: noop })`,',
    '     install ErrorUtils via Sentry.captureException, time the loop.',
    '  4. install_time: re-uses `measureNpmInstall({ packageName, version })`',
    '     — already works, just flip `status: native` and remove the early',
    '     return.',
    '  5. symbolication_accuracy: feed `fixtureFrames` to',
    '     `Sentry.getCurrentHub().getClient()?.getOptions().beforeSend`',
    '     (their resolver runs inline). Score against `expectedFile` /',
    '     `expectedLine`.',
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
