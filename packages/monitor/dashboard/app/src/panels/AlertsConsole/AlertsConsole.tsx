import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Pill } from '../../shared/ui/Pill/Pill';
import { useAlerts } from '../../shared/hooks/useAlerts';
import { useAlertHistory } from '../../shared/hooks/useAlertHistory';
import { useApi } from '../../shared/api/useApi';
import { queryKeys } from '../../shared/hooks/queryKeys';
import type { AlertRuleRecord } from '../../shared/api/types';
import type { AlertFiringRecord, SaveAlertRuleInput } from '../../shared/api/client';
import { RuleEditor } from './RuleEditor';
import { RuleList } from './RuleList';
import { HistoryList } from './HistoryList';
import styles from './AlertsConsole.module.css';

export interface AlertsConsoleProps {
  /** Override — supply both to render without providers (tests). */
  rules?: AlertRuleRecord[];
  history?: AlertFiringRecord[];
  now?: number;
}

export function AlertsConsole({ rules, history, now }: AlertsConsoleProps = {}) {
  if (rules !== undefined && history !== undefined) {
    return (
      <AlertsConsoleView rules={rules} history={history} {...(now !== undefined ? { now } : {})} />
    );
  }
  return <AlertsConsoleContainer {...(now !== undefined ? { now } : {})} />;
}

function AlertsConsoleContainer({ now }: { now?: number }) {
  const queryClient = useQueryClient();
  const api = useApi();
  const rulesQuery = useAlerts();
  const historyQuery = useAlertHistory({ limit: 50 });

  const saveMutation = useMutation({
    mutationFn: (input: SaveAlertRuleInput) => api.saveAlertRule(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alertRules.root() }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteAlertRule(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.alertRules.root() }),
  });

  if (rulesQuery.isPending || historyQuery.isPending) {
    return (
      <Panel title="Alerts Console" description="Rules, cooldowns, and fired-alert history.">
        <div className={styles.placeholder}>Loading alerts…</div>
      </Panel>
    );
  }
  if (rulesQuery.isError || historyQuery.isError) {
    return (
      <Panel title="Alerts Console" description="Rules, cooldowns, and fired-alert history.">
        <div className={styles.error}>Couldn&apos;t load alerts.</div>
      </Panel>
    );
  }

  return (
    <AlertsConsoleView
      rules={rulesQuery.data ?? []}
      history={historyQuery.data ?? []}
      {...(now !== undefined ? { now } : {})}
      onSave={(rule) => saveMutation.mutate(rule)}
      onDelete={(id) => deleteMutation.mutate(id)}
      saving={saveMutation.isPending}
      deletingId={deleteMutation.isPending ? (deleteMutation.variables ?? null) : null}
    />
  );
}

interface ViewProps {
  rules: AlertRuleRecord[];
  history: AlertFiringRecord[];
  now?: number;
  onSave?: (rule: SaveAlertRuleInput) => void;
  onDelete?: (id: string) => void;
  saving?: boolean;
  deletingId?: string | null;
}

function AlertsConsoleView({
  rules,
  history,
  now,
  onSave,
  onDelete,
  saving,
  deletingId,
}: ViewProps) {
  const [draft, setDraft] = useState<AlertRuleRecord | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const rule: SaveAlertRuleInput = {
      ...(draft?.id ? { id: draft.id } : {}),
      name: String(formData.get('name') ?? '').trim(),
      metric: String(formData.get('metric') ?? 'crash_count'),
      threshold: Number(formData.get('threshold') ?? 0),
      windowSeconds: Number(formData.get('windowSeconds') ?? 60),
      channels: String(formData.get('channels') ?? '')
        .split(',')
        .map((c) => c.trim())
        .filter((c) => c.length > 0),
      cooldownSeconds: Number(formData.get('cooldownSeconds') ?? 300),
      enabled: formData.get('enabled') === 'on',
    };
    if (rule.name.length === 0) return;
    onSave?.(rule);
    setDraft(null);
  };

  return (
    <Panel
      title="Alerts Console"
      description="Create alert rules on monitor metrics, inspect fired alerts, tune cooldowns."
    >
      <div className={styles.layout}>
        <section className={styles.editorCell} aria-label="Alert rule editor">
          <h3 className={styles.subhead}>
            {draft?.id ? `Edit ${draft.name || 'rule'}` : 'New rule'}
          </h3>
          <RuleEditor
            key={draft?.id ?? 'new'}
            initial={draft}
            onSubmit={handleSubmit}
            onCancel={() => setDraft(null)}
            {...(saving !== undefined ? { busy: saving } : {})}
          />
        </section>

        <section className={styles.rulesCell} aria-label="Alert rule list">
          <div className={styles.cellHeader}>
            <h3 className={styles.subhead}>Rules</h3>
            {rules.length > 0 ? <Pill size="sm">{rules.length}</Pill> : null}
          </div>
          <RuleList
            rules={rules}
            {...(deletingId !== undefined ? { deletingId } : {})}
            onEdit={setDraft}
            {...(onDelete !== undefined ? { onDelete } : {})}
            {...(now !== undefined ? { now } : {})}
          />
        </section>

        <section className={styles.historyCell} aria-label="Fired alert history">
          <h3 className={styles.subhead}>Fired alerts</h3>
          <HistoryList history={history} rules={rules} {...(now !== undefined ? { now } : {})} />
        </section>
      </div>
    </Panel>
  );
}
