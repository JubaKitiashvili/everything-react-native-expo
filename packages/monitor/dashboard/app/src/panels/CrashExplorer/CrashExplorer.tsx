import { useEffect, useMemo } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { useCrashGroups } from '../../shared/hooks/useCrashGroups';
import { useEvents } from '../../shared/hooks/useEvents';
import { useUiStore } from '../../shared/store/uiStore';
import { CrashGroupList } from './CrashGroupList';
import { CrashGroupDetail } from './CrashGroupDetail';
import styles from './CrashExplorer.module.css';

export interface CrashExplorerProps {
  now?: number;
}

export function CrashExplorer({ now }: CrashExplorerProps) {
  const crashes = useCrashGroups();
  const events = useEvents({ filter: { type: 'crash', limit: 500 } });
  const selectedFingerprint = useUiStore((s) => s.selectedCrashFingerprint);
  const setSelected = useUiStore((s) => s.setSelectedCrashFingerprint);

  // Auto-select the most recent group the first time data arrives so the
  // detail pane never stays blank when there's at least one crash.
  useEffect(() => {
    if (!crashes.data || crashes.data.length === 0) return;
    if (selectedFingerprint) return;
    setSelected(crashes.data[0]!.fingerprint);
  }, [crashes.data, selectedFingerprint, setSelected]);

  const selectedGroup = useMemo(() => {
    if (!selectedFingerprint || !crashes.data) return null;
    return crashes.data.find((g) => g.fingerprint === selectedFingerprint) ?? null;
  }, [selectedFingerprint, crashes.data]);

  const latestEvent = useMemo(() => {
    if (!selectedGroup || !events.data) return null;
    return events.data.find((e) => e.fingerprint === selectedGroup.fingerprint) ?? null;
  }, [selectedGroup, events.data]);

  return (
    <Panel
      title="Crash Explorer"
      description="Fingerprint clusters, first/last seen, stacks, and breadcrumbs."
      bleed
    >
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Crash group list">
          {crashes.isPending ? (
            <Placeholder>Loading crash groups…</Placeholder>
          ) : crashes.isError ? (
            <Placeholder tone="error">Couldn&apos;t load crash groups.</Placeholder>
          ) : (
            <CrashGroupList
              groups={crashes.data ?? []}
              selectedFingerprint={selectedFingerprint}
              onSelect={setSelected}
              {...(now !== undefined ? { now } : {})}
            />
          )}
        </aside>
        <section className={styles.detail} aria-label="Crash group detail">
          {selectedGroup ? (
            <CrashGroupDetail
              group={selectedGroup}
              latestEvent={latestEvent}
              {...(now !== undefined ? { now } : {})}
            />
          ) : (
            <Placeholder>Select a crash group to see its stack and breadcrumbs.</Placeholder>
          )}
        </section>
      </div>
    </Panel>
  );
}

function Placeholder({ children, tone }: { children: React.ReactNode; tone?: 'error' }) {
  return <div className={tone === 'error' ? styles.error : styles.placeholder}>{children}</div>;
}
