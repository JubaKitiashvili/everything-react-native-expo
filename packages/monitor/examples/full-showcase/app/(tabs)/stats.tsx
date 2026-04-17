import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

/**
 * Live stats — reads `globalThis.__ERNE_MONITOR__` every second so the
 * demo video shows counters ticking in response to feed scrolling and
 * button taps. Also surfaces native state + recent errors + session
 * info so the whole SDK surface is visible in one frame.
 */

interface RuntimeStats {
  total: number;
  consentDropped: number;
  sampledDropped: number;
  burstThrottled: number;
  stored: number;
  lastEvent: { type?: string } | null;
}

interface MonitorGlobal {
  runtime?: {
    native?: {
      getState?: () => string;
      getDisabledReason?: () => string | null;
      getRecentErrors?: () => ReadonlyArray<{
        method: string;
        message: string;
      }>;
    };
    session?: { getCurrentSessionId?: () => string };
    store?: { count?: () => Promise<number> };
  };
  stats?: RuntimeStats;
}

export default function StatsScreen() {
  const [snapshot, setSnapshot] = useState<{
    stats: RuntimeStats | null;
    nativeState: string;
    nativeErrors: number;
    sessionId: string;
    storeCount: number;
  }>({
    stats: null,
    nativeState: 'unknown',
    nativeErrors: 0,
    sessionId: '—',
    storeCount: 0,
  });

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      const g = globalThis as { __ERNE_MONITOR__?: MonitorGlobal };
      const stats = g.__ERNE_MONITOR__?.stats ?? null;
      const native = g.__ERNE_MONITOR__?.runtime?.native;
      const session = g.__ERNE_MONITOR__?.runtime?.session;
      const store = g.__ERNE_MONITOR__?.runtime?.store;
      let storeCount = 0;
      try {
        storeCount = (await store?.count?.()) ?? 0;
      } catch {
        /* swallow */
      }
      if (cancelled) return;
      setSnapshot({
        stats,
        nativeState: native?.getState?.() ?? 'unknown',
        nativeErrors: native?.getRecentErrors?.()?.length ?? 0,
        sessionId: session?.getCurrentSessionId?.() ?? '—',
        storeCount,
      });
    };
    const handle = setInterval(poll, 1000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(handle);
    };
  }, []);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card title="Pipeline">
        <Stat label="total" value={snapshot.stats?.total ?? 0} />
        <Stat label="stored" value={snapshot.stats?.stored ?? 0} />
        <Stat label="consentDropped" value={snapshot.stats?.consentDropped ?? 0} />
        <Stat label="sampledDropped" value={snapshot.stats?.sampledDropped ?? 0} />
        <Stat label="burstThrottled" value={snapshot.stats?.burstThrottled ?? 0} />
      </Card>
      <Card title="Native">
        <Stat label="state" value={snapshot.nativeState} />
        <Stat label="recent errors" value={snapshot.nativeErrors} />
      </Card>
      <Card title="Storage">
        <Stat label="event rows" value={snapshot.storeCount} />
        <Stat label="last event type" value={snapshot.stats?.lastEvent?.type ?? '—'} />
      </Card>
      <Card title="Session">
        <Stat label="id" value={snapshot.sessionId} />
      </Card>
    </ScrollView>
  );
}

function Card({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text selectable style={styles.statValue}>
        {String(value)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 16 },
  card: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#f4f4f5',
    gap: 4,
  },
  cardTitle: {
    fontSize: 12,
    textTransform: 'uppercase',
    color: '#666',
    fontWeight: '600',
    marginBottom: 4,
  },
  statRow: { flexDirection: 'row', justifyContent: 'space-between' },
  statLabel: { color: '#333' },
  statValue: { fontFamily: 'Courier', color: '#000' },
});
