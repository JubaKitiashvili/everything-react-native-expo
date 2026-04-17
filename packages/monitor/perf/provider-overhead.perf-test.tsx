/**
 * Baseline render-cost test for `<MonitorProvider>`.
 *
 * Measures how much mount + update time the SDK adds over an empty
 * provider tree. Target: <5% regression vs. SDK-off baseline.
 *
 * This file is a spec for the real test that runs in
 * `examples/full-showcase` where a React Native renderer is available.
 * Reassure is not wired into `@erne/monitor` itself because the SDK
 * package boots under plain ts-jest with no RN runtime.
 */

// @ts-expect-error — reassure is a devDep of the example app, not this package
// eslint-disable-next-line import/no-unresolved
import { measureRenders } from 'reassure';
import React from 'react';
import { View, Text } from 'react-native';
// When this file runs in the demo app, this import resolves to the
// published package. In this repo it's a workspace link.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { MonitorProvider } from '@erne/monitor';

function Leaf() {
  return (
    <View>
      <Text>hello</Text>
    </View>
  );
}

test('baseline — no provider', async () => {
  await measureRenders(<Leaf />, { runs: 20, warmupRuns: 3 });
});

test('with MonitorProvider — default config', async () => {
  await measureRenders(
    <MonitorProvider>
      <Leaf />
    </MonitorProvider>,
    { runs: 20, warmupRuns: 3 },
  );
});
