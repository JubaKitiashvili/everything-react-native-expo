import { useMemo } from 'react';
import { Panel } from '../../shared/ui/Panel/Panel';
import { useCrashGroups } from '../../shared/hooks/useCrashGroups';
import { useSessions } from '../../shared/hooks/useSessions';
import type { CrashGroupRecord, SessionRecord } from '../../shared/api/types';
import {
  computeChangeFailureRate,
  computeDeployFrequency,
  computeLeadTime,
  computeMttr,
  extractDeploys,
  formatMsHuman,
  formatPercent,
  formatPerDay,
  trendDirection,
} from './aggregate';
import { MetricCard } from './MetricCard';
import styles from './DORA.module.css';

export interface DORAProps {
  groups?: CrashGroupRecord[];
  sessions?: SessionRecord[];
  now?: number;
}

export function DORA({ groups, sessions, now }: DORAProps = {}) {
  if (groups !== undefined && sessions !== undefined) {
    return <DORAView groups={groups} sessions={sessions} {...(now !== undefined ? { now } : {})} />;
  }
  return <DORAContainer {...(now !== undefined ? { now } : {})} />;
}

function DORAContainer({ now }: { now?: number }) {
  const groups = useCrashGroups();
  const sessions = useSessions();
  if (groups.isPending || sessions.isPending) {
    return (
      <Panel title="DORA Metrics" description="MTTR · CFR · Deploy frequency · Lead time.">
        <div className={styles.placeholder}>Loading DORA metrics…</div>
      </Panel>
    );
  }
  if (groups.isError || sessions.isError) {
    return (
      <Panel title="DORA Metrics" description="MTTR · CFR · Deploy frequency · Lead time.">
        <div className={styles.error}>Couldn&apos;t load DORA metrics.</div>
      </Panel>
    );
  }
  return (
    <DORAView
      groups={groups.data ?? []}
      sessions={sessions.data ?? []}
      {...(now !== undefined ? { now } : {})}
    />
  );
}

interface ViewProps {
  groups: CrashGroupRecord[];
  sessions: SessionRecord[];
  now?: number;
}

function DORAView({ groups, sessions, now }: ViewProps) {
  const deploys = useMemo(() => extractDeploys(sessions), [sessions]);

  const mttr = useMemo(() => computeMttr(groups, now !== undefined ? { now } : {}), [groups, now]);
  const cfr = useMemo(
    () => computeChangeFailureRate(groups, deploys, now !== undefined ? { now } : {}),
    [groups, deploys, now],
  );
  const freq = useMemo(
    () => computeDeployFrequency(deploys, now !== undefined ? { now } : {}),
    [deploys, now],
  );
  const leadTime = useMemo(
    () => computeLeadTime(deploys, now !== undefined ? { now } : {}),
    [deploys, now],
  );

  return (
    <Panel
      title="DORA Metrics"
      description="Mean-time-to-recovery, change-failure rate, deploy frequency, lead time — agent-vs-human."
    >
      <div className={styles.grid}>
        <MetricCard
          label="MTTR"
          value={formatMsHuman(mttr.value)}
          previous={formatMsHuman(mttr.previous)}
          metric={mttr}
          trend={trendDirection(mttr, 'lower')}
          unit="resolved"
        />
        <MetricCard
          label="Change failure rate"
          value={formatPercent(cfr.value)}
          previous={formatPercent(cfr.previous)}
          metric={cfr}
          trend={trendDirection(cfr, 'lower')}
          unit="deploys"
        />
        <MetricCard
          label="Deploy frequency"
          value={formatPerDay(freq.value)}
          previous={formatPerDay(freq.previous)}
          metric={freq}
          trend={trendDirection(freq, 'higher')}
          unit="deploys"
        />
        <MetricCard
          label="Lead time (deploy gap)"
          value={formatMsHuman(leadTime.value)}
          previous={formatMsHuman(leadTime.previous)}
          metric={leadTime}
          trend={trendDirection(leadTime, 'lower')}
          unit="deploys"
        />
      </div>
    </Panel>
  );
}
