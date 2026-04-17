import { useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Pressable,
  Alert,
} from 'react-native';
import {
  CrashInjector,
  NetworkDegrader,
} from '@erne/monitor/testing';

/**
 * Single-screen demo that exercises the full SDK surface from UI:
 *
 *   - Trigger JS / Native / ANR / Span crashes via `CrashInjector`
 *   - Toggle offline / slow network via `NetworkDegrader`
 *   - Dump live runtime stats from `globalThis.__ERNE_MONITOR__`
 *
 * Maestro chaos flows (`maestro/chaos/*.yaml`) drive this screen with
 * `tapOn` actions then assert the diagnostics dump output.
 */

type MonitorStats = {
  total: number;
  consentDropped: number;
  sampledDropped: number;
  burstThrottled: number;
  stored: number;
};

type MonitorGlobal = {
  runtime?: {
    native?: {
      getRecentErrors?: () => ReadonlyArray<{ method: string; message: string }>;
      getState?: () => string;
    };
  };
  stats?: MonitorStats;
};

export default function HomeScreen() {
  const [dump, setDump] = useState<string>('Tap Diagnostics Dump for live stats');
  const injector = useMemo(() => {
    const g = globalThis as { __ERNE_MONITOR__?: MonitorGlobal };
    return new CrashInjector({
      native: g.__ERNE_MONITOR__?.runtime?.native ?? null,
    });
  }, []);
  const degrader = useMemo(() => new NetworkDegrader(), []);

  const handleJsCrash = () => {
    try {
      injector.triggerJSCrash('demo-button');
    } catch (e) {
      Alert.alert('JS Crash captured', (e as Error).message);
    }
  };

  const handleNativeCrash = () => injector.triggerNativeCrash();
  const handleANR = () => injector.triggerANR(6000);
  const handleSpanCrash = () => injector.triggerSpanCrash('checkout-flow');
  const handleCrashLoop = () =>
    injector.triggerCrashLoop({ count: 5, intervalMs: 200 });

  const handleOffline = () => {
    if (degrader.isActive()) {
      degrader.restore();
      Alert.alert('Network restored');
    } else {
      degrader.simulateOffline();
      Alert.alert('Network offline', 'Every fetch now rejects.');
    }
  };

  const handleSlow = () => degrader.simulateSlowNetwork(2000);

  const handleDump = () => {
    const g = globalThis as { __ERNE_MONITOR__?: MonitorGlobal };
    const stats = g.__ERNE_MONITOR__?.stats;
    const nativeState = g.__ERNE_MONITOR__?.runtime?.native?.getState?.();
    const nativeErrors =
      g.__ERNE_MONITOR__?.runtime?.native?.getRecentErrors?.() ?? [];
    const lines = [
      stats
        ? `total: ${stats.total}  stored: ${stats.stored}`
        : 'runtime not attached',
      stats
        ? `consentDropped: ${stats.consentDropped}  sampledDropped: ${stats.sampledDropped}  burstThrottled: ${stats.burstThrottled}`
        : '',
      `native state: ${nativeState ?? 'unknown'}`,
      `native errors: ${nativeErrors.length}`,
      `degrader: ${degrader.getMode().kind}`,
    ];
    setDump(lines.filter(Boolean).join('\n'));
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.heading}>Diagnostics</Text>
      <Section title="Crashes">
        <DemoButton label="Trigger JS Crash" onPress={handleJsCrash} />
        <DemoButton label="Trigger Native Crash" onPress={handleNativeCrash} />
        <DemoButton label="Trigger ANR (6s)" onPress={handleANR} />
        <DemoButton label="Trigger Span Crash" onPress={handleSpanCrash} />
        <DemoButton label="Trigger Crash Loop (5)" onPress={handleCrashLoop} />
      </Section>
      <Section title="Network">
        <DemoButton
          label={degrader.isActive() ? 'Restore Network' : 'Simulate Offline'}
          onPress={handleOffline}
        />
        <DemoButton label="Simulate Slow Network" onPress={handleSlow} />
      </Section>
      <Section title="Runtime">
        <DemoButton label="Diagnostics Dump" onPress={handleDump} />
        <Text selectable style={styles.dump}>
          {dump}
        </Text>
      </Section>
    </ScrollView>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function DemoButton({
  label,
  onPress,
}: {
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      onPress={onPress}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 16,
  },
  heading: {
    fontSize: 20,
    fontWeight: '600',
  },
  section: {
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#666',
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  buttonPressed: {
    opacity: 0.7,
  },
  buttonLabel: {
    color: 'white',
    fontSize: 15,
    fontWeight: '600',
    textAlign: 'center',
  },
  dump: {
    padding: 12,
    backgroundColor: '#f4f4f5',
    borderRadius: 8,
    fontFamily: 'Courier',
    fontSize: 12,
    color: '#222',
  },
});
