import { useMemo, useState } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useSessions } from '@/shared/hooks/useSessions';
import { useUiStore } from '@/shared/store/uiStore';
import type { SessionRecord } from '@/shared/api/types';
import { extractDevices } from './aggregate';
import { DeviceCard } from './DeviceCard';
import styles from './DeviceSwitcher.module.css';

export interface DeviceSwitcherProps {
  sessions?: SessionRecord[];
  now?: number;
}

export function DeviceSwitcher({ sessions, now }: DeviceSwitcherProps = {}) {
  if (sessions !== undefined) {
    return <DeviceSwitcherView sessions={sessions} {...(now !== undefined ? { now } : {})} />;
  }
  return <DeviceSwitcherContainer {...(now !== undefined ? { now } : {})} />;
}

function DeviceSwitcherContainer({ now }: { now?: number }) {
  const query = useSessions();
  if (query.isPending) {
    return (
      <Panel title="Device Switcher" description="Multi-device session picker.">
        <div className={styles.placeholder}>Loading devices…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Device Switcher" description="Multi-device session picker.">
        <div className={styles.error}>Couldn&apos;t load sessions.</div>
      </Panel>
    );
  }
  return <DeviceSwitcherView sessions={query.data ?? []} {...(now !== undefined ? { now } : {})} />;
}

function DeviceSwitcherView({ sessions, now }: { sessions: SessionRecord[]; now?: number }) {
  const selectedSessionId = useUiStore((s) => s.selectedSessionId);
  const setSelectedSession = useUiStore((s) => s.setSelectedSession);
  const [selectedDeviceFp, setSelectedDeviceFp] = useState<string | null>(null);

  const devices = useMemo(() => extractDevices(sessions), [sessions]);

  const effectiveDeviceFp = useMemo(() => {
    if (selectedDeviceFp) return selectedDeviceFp;
    if (selectedSessionId) {
      const device = devices.find((d) => d.sessions.some((s) => s.id === selectedSessionId));
      if (device) return device.fingerprint;
    }
    return devices[0]?.fingerprint ?? null;
  }, [selectedDeviceFp, selectedSessionId, devices]);

  if (devices.length === 0) {
    return (
      <Panel title="Device Switcher" description="Multi-device session picker.">
        <div className={styles.empty}>No devices have reported sessions yet.</div>
      </Panel>
    );
  }

  return (
    <Panel
      title="Device Switcher"
      description="Pick a device to see its fingerprint, platform, OS, app version, and recent sessions."
    >
      <div className={styles.grid}>
        {devices.map((device) => (
          <DeviceCard
            key={device.fingerprint}
            device={device}
            selected={device.fingerprint === effectiveDeviceFp}
            activeSessionId={selectedSessionId}
            onSelectDevice={(fp) => setSelectedDeviceFp(fp)}
            onSelectSession={(sessionId) => {
              setSelectedSession(sessionId);
              setSelectedDeviceFp(device.fingerprint);
            }}
            {...(now !== undefined ? { now } : {})}
          />
        ))}
      </div>
    </Panel>
  );
}
