import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  CrashInjector,
  NetworkDegrader,
} from '@erne/monitor/testing';

/**
 * Consent toggles, user-id tagging (DSAR), chaos triggers, and the
 * replay mask controls. Each row in this screen touches a different
 * SDK surface so the demo video can walk through it linearly.
 */

interface MonitorGlobal {
  runtime?: {
    native?: Parameters<typeof CrashInjector.prototype.constructor>[0] extends
      infer T
      ? T extends { native?: infer N }
        ? N
        : null
      : null;
    setConsent?: (c: {
      crashes?: boolean;
      analytics?: boolean;
      replay?: boolean;
    }) => Promise<void>;
    setUserId?: (id: string | null) => void;
    getUserId?: () => string | null;
    exportUserData?: (id: string) => Promise<unknown>;
    deleteUserData?: (id: string) => Promise<unknown>;
  };
}

export default function SettingsScreen() {
  const g = globalThis as { __ERNE_MONITOR__?: MonitorGlobal };
  const runtime = g.__ERNE_MONITOR__?.runtime;

  const [crashes, setCrashes] = useState(true);
  const [analytics, setAnalytics] = useState(true);
  const [replay, setReplay] = useState(true);
  const [userId, setUserIdState] = useState(runtime?.getUserId?.() ?? '');

  const injector = useMemo(
    () =>
      new CrashInjector({
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        native: (runtime?.native as any) ?? null,
      }),
    [runtime],
  );
  const degrader = useMemo(() => new NetworkDegrader(), []);

  const toggleConsent = useCallback(
    (key: 'crashes' | 'analytics' | 'replay', value: boolean) => {
      switch (key) {
        case 'crashes':
          setCrashes(value);
          break;
        case 'analytics':
          setAnalytics(value);
          break;
        case 'replay':
          setReplay(value);
          break;
      }
      void runtime?.setConsent?.({ [key]: value });
    },
    [runtime],
  );

  const applyUserId = useCallback(() => {
    runtime?.setUserId?.(userId || null);
    Alert.alert('User id applied', userId || '(cleared)');
  }, [runtime, userId]);

  const exportData = useCallback(async () => {
    const dump = await runtime?.exportUserData?.(userId);
    Alert.alert('Export', JSON.stringify(dump).slice(0, 300));
  }, [runtime, userId]);

  const deleteData = useCallback(async () => {
    const result = await runtime?.deleteUserData?.(userId);
    Alert.alert('Deleted', JSON.stringify(result));
  }, [runtime, userId]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Section title="Consent">
        <Row label="Crashes">
          <Switch
            value={crashes}
            onValueChange={(v) => toggleConsent('crashes', v)}
          />
        </Row>
        <Row label="Analytics">
          <Switch
            value={analytics}
            onValueChange={(v) => toggleConsent('analytics', v)}
          />
        </Row>
        <Row label="Replay">
          <Switch
            value={replay}
            onValueChange={(v) => toggleConsent('replay', v)}
          />
        </Row>
      </Section>

      <Section title="User (DSAR)">
        <TextInput
          value={userId}
          onChangeText={setUserIdState}
          placeholder="user id (e.g. 42)"
          style={styles.input}
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="User id input"
        />
        <Button label="Apply user id" onPress={applyUserId} />
        <Button label="Export user data" onPress={exportData} />
        <Button
          label="Delete user data"
          onPress={deleteData}
          variant="danger"
        />
      </Section>

      <Section title="Chaos">
        <Button label="Trigger JS Crash" onPress={() => {
          try { injector.triggerJSCrash('demo'); } catch {}
        }} />
        <Button label="Trigger Native Crash" onPress={() => injector.triggerNativeCrash()} />
        <Button label="Trigger ANR (6s)" onPress={() => injector.triggerANR(6000)} />
        <Button label="Trigger Crash Loop (5)" onPress={() => injector.triggerCrashLoop({ count: 5 })} />
      </Section>

      <Section title="Network">
        <Button
          label={degrader.isActive() ? 'Restore Network' : 'Simulate Offline'}
          onPress={() =>
            degrader.isActive() ? degrader.restore() : degrader.simulateOffline()
          }
        />
        <Button
          label="Simulate Slow Network"
          onPress={() => degrader.simulateSlowNetwork(2000)}
        />
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

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'danger';
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'danger' && styles.buttonDanger,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={styles.buttonLabel}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 20 },
  section: { gap: 8 },
  sectionTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#666',
    fontWeight: '600',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
  },
  rowLabel: { fontSize: 15 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    padding: 10,
    fontSize: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    paddingVertical: 12,
    borderRadius: 10,
  },
  buttonDanger: { backgroundColor: '#c0392b' },
  buttonPressed: { opacity: 0.7 },
  buttonLabel: {
    color: 'white',
    fontWeight: '600',
    textAlign: 'center',
    fontSize: 15,
  },
});
