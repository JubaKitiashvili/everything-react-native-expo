import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useEvents } from '@/shared/hooks/useEvents';
import type { EventRecord } from '@/shared/api/types';
import {
  buildFabricHistogram,
  extractFpsSeries,
  extractResourceSeries,
  extractStartupPhases,
} from './aggregate';
import { FabricHistogram } from './FabricHistogram';
import { FpsChart } from './FpsChart';
import { MemoryCpuChart } from './MemoryCpuChart';
import { StartupWaterfall } from './StartupWaterfall';
import styles from './Performance.module.css';

export interface PerformanceProps {
  /** Events override — purely for test/storybook injection. When present, the
   *  panel skips its network fetch so it can render without QueryClient. */
  events?: EventRecord[];
}

const FETCH_LIMIT = 1000;

export function Performance({ events }: PerformanceProps = {}) {
  if (events !== undefined) {
    return <PerformanceView events={events} />;
  }
  return <PerformancePanel />;
}

function PerformancePanel() {
  const query = useEvents({ filter: { limit: FETCH_LIMIT }, staleTime: 10_000 });
  if (query.isPending) {
    return (
      <Panel title="Performance" description="FPS, CPU, memory, Fabric, startup.">
        <div className={styles.placeholder}>Loading samples…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Performance" description="FPS, CPU, memory, Fabric, startup.">
        <div className={styles.error}>
          Couldn&apos;t load performance samples: {String((query.error as Error)?.message ?? '')}
        </div>
      </Panel>
    );
  }
  return <PerformanceView events={query.data ?? []} />;
}

interface PerformanceViewProps {
  events: EventRecord[];
}

function PerformanceView({ events }: PerformanceViewProps) {
  const fpsSeries = useMemo(() => extractFpsSeries(events), [events]);
  const resourceSeries = useMemo(() => extractResourceSeries(events), [events]);
  const fabricBuckets = useMemo(() => buildFabricHistogram(events), [events]);
  const startupRecords = useMemo(() => extractStartupPhases(events), [events]);

  return (
    <Panel title="Performance" description="FPS, CPU, memory, Fabric commits, startup waterfall.">
      <div className={styles.grid}>
        <section className={styles.cell} aria-label="Dual-thread FPS">
          <h3 className={styles.subhead}>Dual-thread FPS</h3>
          <FpsChart series={fpsSeries} />
        </section>
        <section className={styles.cell} aria-label="CPU and memory">
          <h3 className={styles.subhead}>CPU + Memory</h3>
          <MemoryCpuChart series={resourceSeries} />
        </section>
        <section className={styles.cell} aria-label="Fabric commit latency">
          <h3 className={styles.subhead}>Fabric commit latency</h3>
          <FabricHistogram buckets={fabricBuckets} />
        </section>
        <section className={styles.cell} aria-label="Startup waterfall">
          <h3 className={styles.subhead}>Startup waterfall</h3>
          <StartupWaterfall records={startupRecords} />
        </section>
      </div>
    </Panel>
  );
}
