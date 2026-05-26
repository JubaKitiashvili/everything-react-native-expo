import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Panel } from '@/shared/ui/Panel/Panel';
import { useBugReports } from '@/shared/hooks/useBugReports';
import { useApi } from '@/shared/api/useApi';
import { queryKeys } from '@/shared/hooks/queryKeys';
import type { BugReportRecord } from '@/shared/api/types';
import type { UpdateBugReportInput } from '@/shared/api/client';
import { ReportList } from './ReportList';
import { ReportDetail } from './ReportDetail';
import styles from './BugReportsInbox.module.css';

export interface BugReportsInboxProps {
  /** Override — render without providers when both are supplied. */
  reports?: BugReportRecord[];
  now?: number;
}

export function BugReportsInbox({ reports, now }: BugReportsInboxProps = {}) {
  if (reports !== undefined) {
    return <BugReportsInboxView reports={reports} {...(now !== undefined ? { now } : {})} />;
  }
  return <BugReportsInboxContainer {...(now !== undefined ? { now } : {})} />;
}

function BugReportsInboxContainer({ now }: { now?: number }) {
  const query = useBugReports();
  const queryClient = useQueryClient();
  const api = useApi();
  const mutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateBugReportInput }) =>
      api.updateBugReport(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.root() }),
  });

  if (query.isPending) {
    return (
      <Panel title="Bug Reports" description="Shake-submitted reports, attachments, assignment.">
        <div className={styles.placeholder}>Loading bug reports…</div>
      </Panel>
    );
  }
  if (query.isError) {
    return (
      <Panel title="Bug Reports" description="Shake-submitted reports, attachments, assignment.">
        <div className={styles.error}>Couldn&apos;t load bug reports.</div>
      </Panel>
    );
  }
  return (
    <BugReportsInboxView
      reports={query.data ?? []}
      {...(now !== undefined ? { now } : {})}
      onUpdate={(id, patch) => mutation.mutate({ id, patch })}
      updatingId={mutation.isPending ? (mutation.variables?.id ?? null) : null}
    />
  );
}

interface ViewProps {
  reports: BugReportRecord[];
  now?: number;
  onUpdate?: (id: string, patch: UpdateBugReportInput) => void;
  updatingId?: string | null;
}

function BugReportsInboxView({ reports, now, onUpdate, updatingId }: ViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const sorted = useMemo(
    () => [...reports].sort((a, b) => b.submittedAt - a.submittedAt),
    [reports],
  );

  useEffect(() => {
    if (!selectedId && sorted.length > 0) {
      setSelectedId(sorted[0]!.id);
    }
  }, [selectedId, sorted]);

  const selected = useMemo(
    () => (selectedId ? (sorted.find((r) => r.id === selectedId) ?? null) : null),
    [selectedId, sorted],
  );

  return (
    <Panel
      title="Bug Reports"
      description="Shake-submitted reports with screenshot + breadcrumbs + device info; assign or resolve."
      bleed
    >
      <div className={styles.layout}>
        <aside className={styles.sidebar} aria-label="Bug report list">
          <ReportList
            reports={sorted}
            selectedId={selectedId}
            onSelect={setSelectedId}
            {...(now !== undefined ? { now } : {})}
          />
        </aside>
        <section className={styles.detail} aria-label="Bug report detail">
          {selected ? (
            <ReportDetail
              report={selected}
              {...(now !== undefined ? { now } : {})}
              {...(onUpdate !== undefined ? { onUpdate } : {})}
              busy={updatingId === selected.id}
            />
          ) : (
            <div className={styles.placeholder}>Select a report to see attachments.</div>
          )}
        </section>
      </div>
    </Panel>
  );
}
