/**
 * Crash-collection cost: measures the extra work CrashCollector does
 * when an ErrorBoundary catches a thrown render error. The native
 * side of crash handling (signal handler, on-disk persistence) is
 * verified via Maestro chaos tests (Task 83) — this test focuses on
 * the JS pipeline only.
 */

// @ts-expect-error — reassure is a devDep of the example app, not this package
// eslint-disable-next-line import/no-unresolved
import { measureRenders } from 'reassure';
import React from 'react';
import { Text, View } from 'react-native';
import { MonitorProvider } from '@erne/monitor';

class Boundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    return this.state.hasError ? (
      <View>
        <Text>caught</Text>
      </View>
    ) : (
      <>{this.props.children}</>
    );
  }
}

function Exploder({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('baseline-crash');
  return (
    <View>
      <Text>ok</Text>
    </View>
  );
}

test('baseline — error boundary without SDK', async () => {
  await measureRenders(
    <Boundary>
      <Exploder shouldThrow={true} />
    </Boundary>,
    { runs: 10, warmupRuns: 2 },
  );
});

test('with CrashCollector attached', async () => {
  await measureRenders(
    <MonitorProvider>
      <Boundary>
        <Exploder shouldThrow={true} />
      </Boundary>
    </MonitorProvider>,
    { runs: 10, warmupRuns: 2 },
  );
});
