import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/shared/ui/Panel/Panel';
import { Pill } from '@/shared/ui/Pill/Pill';
import { useSessions } from '@/shared/hooks/useSessions';
import { useApi } from '@/shared/api/useApi';
import type { DemoSeedResult } from '@/shared/api/types';
import styles from './Onboarding.module.css';

export interface OnboardingProps {
  /** Test override: when set, skips the provider container entirely. */
  sessionCount?: number;
  onGenerateSampleData?: () => Promise<DemoSeedResult>;
}

export function Onboarding(props: OnboardingProps = {}) {
  if (props.sessionCount !== undefined) {
    return (
      <OnboardingView
        sessionCount={props.sessionCount}
        {...(props.onGenerateSampleData
          ? { onGenerateSampleData: props.onGenerateSampleData }
          : {})}
      />
    );
  }
  return <OnboardingContainer />;
}

function OnboardingContainer() {
  const api = useApi();
  const queryClient = useQueryClient();
  const sessionsQuery = useSessions();

  const handleGenerate = async (): Promise<DemoSeedResult> => {
    const result = await api.generateSampleData();
    // Invalidate every cached server query so the 17 panels pick up the
    // fresh rows without waiting for their individual staleTime.
    await queryClient.invalidateQueries();
    return result;
  };

  return (
    <OnboardingView
      sessionCount={sessionsQuery.data?.length ?? 0}
      onGenerateSampleData={handleGenerate}
    />
  );
}

interface ViewProps {
  sessionCount: number;
  onGenerateSampleData?: () => Promise<DemoSeedResult>;
}

function OnboardingView({ sessionCount, onGenerateSampleData }: ViewProps) {
  const [status, setStatus] = useState<'idle' | 'seeding' | 'done' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [seededSummary, setSeededSummary] = useState<string | null>(null);

  // Once the dashboard has any session at all, the onboarding banner is out
  // of the way. The entire panel collapses — no wasted real estate.
  if (sessionCount > 0) return null;

  const handleGenerate = async () => {
    if (!onGenerateSampleData) return;
    setStatus('seeding');
    setErrorMessage(null);
    setSeededSummary(null);
    try {
      const { seeded } = await onGenerateSampleData();
      setStatus('done');
      setSeededSummary(
        `Seeded ${seeded.sessions} session${seeded.sessions === 1 ? '' : 's'}, ` +
          `${seeded.events} event${seeded.events === 1 ? '' : 's'}, ` +
          `${seeded.crashGroups} crash group${seeded.crashGroups === 1 ? '' : 's'}, ` +
          `${seeded.bugReports} bug report${seeded.bugReports === 1 ? '' : 's'}.`,
      );
    } catch (err) {
      setStatus('error');
      setErrorMessage(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <Panel
      title="Welcome to ERNE Monitor"
      description="No events have been ingested yet. Install the SDK in your app — or seed a demo dataset to explore the panels."
      action={<Pill severity="info">onboarding</Pill>}
    >
      <div className={styles.grid}>
        <section className={styles.cell} aria-label="Install SDK quickstart">
          <h3 className={styles.subhead}>Install the SDK</h3>
          <ol className={styles.steps}>
            <li>
              <code className={styles.codeInline}>npm install @erne/monitor</code>
            </li>
            <li>
              Run <code className={styles.codeInline}>npx @erne/monitor init</code>
              {' — '}scaffolds the provider + config.
            </li>
            <li>
              Wrap your app root:
              <pre className={styles.codeBlock}>{`import { MonitorProvider } from '@erne/monitor';

export default function App() {
  return (
    <MonitorProvider>
      <YourApp />
    </MonitorProvider>
  );
}`}</pre>
            </li>
            <li>Events start flowing here within a few seconds of the next app launch.</li>
          </ol>
          <p className={styles.docsLink}>
            Full setup guide: <span className={styles.mono}>docs/quickstart.md</span>
          </p>
        </section>

        <section className={styles.cell} aria-label="Demo data">
          <h3 className={styles.subhead}>Try it without an SDK build</h3>
          <p className={styles.hint}>
            Populates sample sessions, a crash, a breadcrumb, a bug report, and an alert rule so
            every panel renders with real shape data. Safe to reset later from Settings.
          </p>
          <button
            type="button"
            className={styles.primary}
            onClick={() => {
              void handleGenerate();
            }}
            disabled={status === 'seeding'}
          >
            {status === 'seeding' ? 'Generating…' : 'Generate sample events'}
          </button>
          {status === 'done' && seededSummary ? (
            <p className={styles.success}>{seededSummary}</p>
          ) : null}
          {status === 'error' && errorMessage ? (
            <p className={styles.error}>{errorMessage}</p>
          ) : null}
        </section>
      </div>
    </Panel>
  );
}
