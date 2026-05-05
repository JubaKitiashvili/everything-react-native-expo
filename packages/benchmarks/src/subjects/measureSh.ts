// Task 117.91 — measure.sh subject (documented placeholder).
//
// measure.sh is a build-time tool, not a runtime SDK — bundle_size +
// install_time are the only benchmarks that map cleanly. crash_latency
// and symbolication_accuracy are reported as `unsupported` for this
// subject specifically.

import type { Subject } from '../types.js';

export const measureShSubject: Subject = {
  id: 'measure-sh',
  label: 'measure.sh',
  packageName: 'measure-sh-react-native',
  version: '0.4.0',
  status: 'documented_placeholder',
  notes: [
    'Runbook to wire `measure.sh` natively:',
    '  1. `npm install measure-sh-react-native@0.4.0`.',
    '  2. bundle_size: walkAndGzip works.',
    '  3. install_time: works out of the box.',
    '  4. crash_latency / symbolication_accuracy: not applicable —',
    '     measure.sh runs at build time. Mark `status: unsupported` for',
    '     these two benchmarks once the others are wired.',
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
