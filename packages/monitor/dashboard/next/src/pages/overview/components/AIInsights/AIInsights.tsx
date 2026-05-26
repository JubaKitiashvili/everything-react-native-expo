import { useMemo } from 'react';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useCrashGroups } from '@/shared/hooks/useCrashGroups';
import { useEvents } from '@/shared/hooks/useEvents';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import {
  computeFixSuccessRate,
  computeMttr,
  extractConfidenceSeries,
  formatMttr,
  formatPercent,
  topPatternHits,
} from './aggregate';
import { ConfidenceTrend } from './ConfidenceTrend';
import { PatternList } from './PatternList';
import styles from './AIInsights.module.css';

export interface AIInsightsProps {
  groups?: CrashGroupRecord[];
  events?: EventRecord[];
}

export function AIInsights({ groups, events }: AIInsightsProps = {}) {
  if (groups !== undefined && events !== undefined) {
    return <AIInsightsView groups={groups} events={events} />;
  }
  return <AIInsightsContainer />;
}

function AIInsightsContainer() {
  const crashes = useCrashGroups();
  const patterns = useEvents({
    filter: { type: ['pattern_match', 'ai_suggestion'], limit: 500 },
    staleTime: 30_000,
  });

  if (crashes.isPending || patterns.isPending) {
    return (
      <Panel title="AI Insights" description="Agent fix success, MTTR, pattern hits, confidence.">
        <div className={styles.placeholder}>Loading AI stats…</div>
      </Panel>
    );
  }
  if (crashes.isError || patterns.isError) {
    return (
      <Panel title="AI Insights" description="Agent fix success, MTTR, pattern hits, confidence.">
        <div className={styles.error}>Couldn&apos;t load AI stats.</div>
      </Panel>
    );
  }
  return <AIInsightsView groups={crashes.data ?? []} events={patterns.data ?? []} />;
}

function AIInsightsView({ groups, events }: { groups: CrashGroupRecord[]; events: EventRecord[] }) {
  const success = useMemo(() => computeFixSuccessRate(groups), [groups]);
  const mttr = useMemo(() => computeMttr(groups), [groups]);
  const patterns = useMemo(() => topPatternHits(events, groups), [events, groups]);
  const confidence = useMemo(() => extractConfidenceSeries(events), [events]);

  return (
    <Panel
      title="AI Insights"
      description="Agent fix success, MTTR (agent vs human), pattern hits, and confidence trend."
    >
      <div className={styles.grid}>
        <section className={styles.metricCell} aria-label="Agent fix success">
          <h3 className={styles.subhead}>Agent fix success</h3>
          <div className={styles.bigNumber}>{formatPercent(success.successRate)}</div>
          <p className={styles.smallPrint}>
            {success.resolvedWithAi} resolved · {success.suggestedButUnresolved} still open ·{' '}
            {success.withoutSuggestion} without suggestion
          </p>
        </section>

        <section className={styles.metricCell} aria-label="Mean time to resolution">
          <h3 className={styles.subhead}>MTTR · agent vs human</h3>
          <div className={styles.mttrRow}>
            <div className={styles.mttrItem}>
              <span className={styles.mttrLabel}>agent</span>
              <span className={styles.mttrValue}>{formatMttr(mttr.agentMeanMs)}</span>
              <span className={styles.mttrFooter}>{mttr.agentSamples} samples</span>
            </div>
            <div className={styles.mttrItem}>
              <span className={styles.mttrLabel}>human</span>
              <span className={styles.mttrValue}>{formatMttr(mttr.humanMeanMs)}</span>
              <span className={styles.mttrFooter}>{mttr.humanSamples} samples</span>
            </div>
          </div>
        </section>

        <section className={styles.cell} aria-label="Top pattern hits">
          <h3 className={styles.subhead}>Top patterns</h3>
          <PatternList hits={patterns} />
        </section>

        <section className={styles.cell} aria-label="Confidence trend">
          <h3 className={styles.subhead}>Confidence trend</h3>
          <ConfidenceTrend samples={confidence} />
        </section>
      </div>
    </Panel>
  );
}
