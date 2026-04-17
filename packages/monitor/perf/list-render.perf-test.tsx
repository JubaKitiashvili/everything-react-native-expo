/**
 * List-render overhead test. Measures what the SDK costs when a busy
 * `FlatList` scrolls with the default Phase 5 prod sampler defaults
 * (render byType=0.01, burst-throttle windowed). Target: <5% delta
 * vs. SDK-off baseline.
 */

// @ts-expect-error — reassure is a devDep of the example app, not this package
// eslint-disable-next-line import/no-unresolved
import { measureRenders } from 'reassure';
import React from 'react';
import { FlatList, Text, View } from 'react-native';
import { MonitorProvider } from '@erne/monitor';

const DATA = Array.from({ length: 100 }, (_, i) => ({ id: String(i), label: `Item ${i}` }));

function Row({ item }: { item: (typeof DATA)[number] }) {
  return (
    <View>
      <Text>{item.label}</Text>
    </View>
  );
}

function List() {
  return <FlatList data={DATA} renderItem={Row} keyExtractor={(i) => i.id} />;
}

test('baseline — FlatList 100 items, no SDK', async () => {
  await measureRenders(<List />, { runs: 10, warmupRuns: 2 });
});

test('with SDK enabled — FlatList 100 items', async () => {
  await measureRenders(
    <MonitorProvider>
      <List />
    </MonitorProvider>,
    { runs: 10, warmupRuns: 2 },
  );
});
