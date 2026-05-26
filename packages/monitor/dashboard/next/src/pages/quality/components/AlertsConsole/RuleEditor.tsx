import { type FormEvent } from 'react';
import type { AlertRuleRecord } from '@/shared/api/types';
import styles from './RuleEditor.module.css';

export interface RuleEditorProps {
  initial?: AlertRuleRecord | null;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  busy?: boolean;
}

const METRICS = [
  { value: 'crash_count', label: 'Crash count' },
  { value: 'anr_count', label: 'ANR count' },
  { value: 'p95_tti_ms', label: 'P95 TTI (ms)' },
  { value: 'event_rate', label: 'Events / minute' },
  { value: 'error_rate', label: 'Error %' },
];

const DEFAULT_CHANNELS = ['slack', 'email'];

export function RuleEditor({ initial, onSubmit, onCancel, busy = false }: RuleEditorProps) {
  const draft = initial;
  return (
    <form className={styles.form} onSubmit={onSubmit}>
      <Field label="Name" htmlFor="rule-name">
        <input
          id="rule-name"
          name="name"
          className={styles.input}
          defaultValue={draft?.name ?? ''}
          placeholder="e.g. Crash spike"
          required
          maxLength={120}
        />
      </Field>
      <div className={styles.row}>
        <Field label="Metric" htmlFor="rule-metric">
          <select
            id="rule-metric"
            name="metric"
            className={styles.input}
            defaultValue={draft?.metric ?? METRICS[0]!.value}
          >
            {METRICS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Threshold" htmlFor="rule-threshold">
          <input
            id="rule-threshold"
            name="threshold"
            type="number"
            step="0.01"
            className={styles.input}
            defaultValue={draft?.threshold ?? 1}
            required
          />
        </Field>
      </div>
      <div className={styles.row}>
        <Field label="Window (s)" htmlFor="rule-window">
          <input
            id="rule-window"
            name="windowSeconds"
            type="number"
            min={10}
            max={86_400}
            className={styles.input}
            defaultValue={draft?.windowSeconds ?? 300}
            required
          />
        </Field>
        <Field label="Cooldown (s)" htmlFor="rule-cooldown">
          <input
            id="rule-cooldown"
            name="cooldownSeconds"
            type="number"
            min={10}
            max={86_400}
            className={styles.input}
            defaultValue={draft?.cooldownSeconds ?? 300}
            required
          />
        </Field>
      </div>
      <Field label="Channels" htmlFor="rule-channels">
        <input
          id="rule-channels"
          name="channels"
          className={styles.input}
          defaultValue={(draft?.channels ?? DEFAULT_CHANNELS).join(', ')}
          placeholder="slack, email, webhook"
        />
      </Field>
      <label className={styles.toggle}>
        <input type="checkbox" name="enabled" defaultChecked={draft?.enabled ?? true} />
        Enabled
      </label>

      <div className={styles.actions}>
        {draft?.id ? (
          <button type="button" className={styles.ghostButton} onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className={styles.primaryButton} disabled={busy} aria-busy={busy}>
          {busy ? 'Saving…' : draft?.id ? 'Update rule' : 'Create rule'}
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={htmlFor}>
        {label}
      </label>
      {children}
    </div>
  );
}
