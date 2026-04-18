import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Panel } from '../../shared/ui/Panel/Panel';
import { Pill } from '../../shared/ui/Pill/Pill';
import { useApi } from '../../shared/api/useApi';
import { useUiStore, type ThemePreference } from '../../shared/store/uiStore';
import type { DashboardSettings } from '../../shared/api/types';
import styles from './Settings.module.css';

const SETTINGS_KEY = ['settings'] as const;

export interface SettingsProps {
  /** Bypass providers in tests. */
  settings?: DashboardSettings;
  onPatchSettings?: (patch: { retentionDays: number }) => Promise<DashboardSettings>;
  onRotateToken?: () => Promise<{ wsTokenMasked: string | null; wsTokenSet: boolean }>;
  onReset?: () => Promise<{ ok: true; deleted: Record<string, number> }>;
}

export function Settings(props: SettingsProps = {}) {
  if (props.settings !== undefined) return <SettingsView {...props} settings={props.settings} />;
  return <SettingsContainer />;
}

function SettingsContainer() {
  const api = useApi();
  const queryClient = useQueryClient();

  const query = useQuery({ queryKey: SETTINGS_KEY, queryFn: () => api.fetchSettings() });

  const patchMutation = useMutation({
    mutationFn: (patch: { retentionDays: number }) => api.patchSettings(patch),
    onSuccess: (settings) => queryClient.setQueryData(SETTINGS_KEY, settings),
  });
  const rotateMutation = useMutation({
    mutationFn: () => api.rotateWsToken(),
    onSuccess: (out) => {
      queryClient.setQueryData<DashboardSettings | undefined>(SETTINGS_KEY, (prev) =>
        prev ? { ...prev, wsTokenMasked: out.wsTokenMasked, wsTokenSet: out.wsTokenSet } : prev,
      );
    },
  });
  const resetMutation = useMutation({
    mutationFn: () => api.resetDatabase(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  if (query.isPending) {
    return (
      <Panel title="Settings" description="Retention, theme, ingest token, destructive reset.">
        <div className={styles.placeholder}>Loading settings…</div>
      </Panel>
    );
  }
  if (query.isError || !query.data) {
    return (
      <Panel title="Settings" description="Retention, theme, ingest token, destructive reset.">
        <div className={styles.error}>Couldn&apos;t load server settings.</div>
      </Panel>
    );
  }

  return (
    <SettingsView
      settings={query.data}
      onPatchSettings={async (patch) => patchMutation.mutateAsync(patch)}
      onRotateToken={async () => rotateMutation.mutateAsync()}
      onReset={async () => resetMutation.mutateAsync()}
    />
  );
}

function SettingsView({ settings, onPatchSettings, onRotateToken, onReset }: SettingsProps) {
  const theme = useUiStore((s) => s.theme);
  const setTheme = useUiStore((s) => s.setTheme);

  const [retention, setRetention] = useState<string>(
    settings ? String(settings.retentionDays) : '14',
  );
  const [status, setStatus] = useState<'idle' | 'saving' | 'rotating' | 'resetting'>('idle');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  // Keep local input in sync when upstream settings change (e.g. after rotation).
  useEffect(() => {
    if (settings) setRetention(String(settings.retentionDays));
  }, [settings]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!onPatchSettings) return;
    const days = Number(retention);
    if (!Number.isFinite(days) || days < 1 || days > 3650) {
      setError('Retention must be 1–3650 days.');
      return;
    }
    setStatus('saving');
    setFeedback(null);
    setError(null);
    try {
      const next = await onPatchSettings({ retentionDays: Math.round(days) });
      setRetention(String(next.retentionDays));
      setFeedback(`Saved. Retention is now ${next.retentionDays} days.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  };

  const handleRotate = async () => {
    if (!onRotateToken) return;
    setStatus('rotating');
    setFeedback(null);
    setError(null);
    try {
      const out = await onRotateToken();
      setFeedback(`Rotated WS ingest token (${out.wsTokenMasked ?? '—'}).`);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  };

  const handleReset = async () => {
    if (!onReset) return;
    setStatus('resetting');
    setFeedback(null);
    setError(null);
    try {
      const out = await onReset();
      const total = Object.values(out.deleted).reduce((a, b) => a + b, 0);
      setFeedback(
        `Reset complete. Wiped ${total} rows across ${Object.keys(out.deleted).length} tables.`,
      );
      setConfirmingReset(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setStatus('idle');
    }
  };

  const uptimeLabel = formatUptime(settings?.uptimeSeconds ?? 0);

  return (
    <Panel
      title="Settings"
      description="Tune retention, switch themes, rotate the ingest token, or purge the dashboard."
    >
      <div className={styles.grid}>
        <section aria-label="Retention" className={styles.cell}>
          <h3 className={styles.subhead}>Storage retention</h3>
          <form className={styles.row} onSubmit={handleSubmit}>
            <label className={styles.field}>
              <span>Days</span>
              <input
                type="number"
                value={retention}
                min={1}
                max={3650}
                onChange={(e) => setRetention(e.target.value)}
                aria-label="Retention days"
              />
            </label>
            <button type="submit" className={styles.primary} disabled={status === 'saving'}>
              {status === 'saving' ? 'Saving…' : 'Save'}
            </button>
          </form>
          <p className={styles.hint}>
            Events older than this get purged by the nightly sweeper. Default is 14.
          </p>
        </section>

        <section aria-label="Theme" className={styles.cell}>
          <h3 className={styles.subhead}>Theme</h3>
          <div className={styles.row}>
            {(['dark', 'light', 'system'] as ThemePreference[]).map((option) => (
              <label key={option} className={styles.themeOption}>
                <input
                  type="radio"
                  name="theme"
                  value={option}
                  checked={theme === option}
                  onChange={() => setTheme(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
          <p className={styles.hint}>
            Stored locally in the UI store — no server round-trip, no cross-device sync.
          </p>
        </section>

        <section aria-label="Ingest" className={styles.cell}>
          <h3 className={styles.subhead}>WS ingest</h3>
          <div className={styles.kv}>
            <div>
              <dt>Port</dt>
              <dd className={styles.mono}>{settings?.port ?? '—'}</dd>
            </div>
            <div>
              <dt>Host</dt>
              <dd className={styles.mono}>{settings?.host ?? '—'}</dd>
            </div>
            <div>
              <dt>Auth token</dt>
              <dd className={styles.mono}>
                {settings?.wsTokenMasked ?? <em>not set</em>}
                {settings?.wsTokenSet ? (
                  <Pill size="sm" severity="success">
                    active
                  </Pill>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>Uptime</dt>
              <dd className={styles.mono}>{uptimeLabel}</dd>
            </div>
          </div>
          <div className={styles.row}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                void handleRotate();
              }}
              disabled={status === 'rotating'}
            >
              {status === 'rotating' ? 'Rotating…' : 'Rotate WS token'}
            </button>
          </div>
          <p className={styles.hint}>
            Rotating invalidates every connected SDK client. They&apos;ll reconnect on restart with
            the new token if configured.
          </p>
        </section>

        <section aria-label="Danger zone" className={styles.dangerCell}>
          <h3 className={styles.subhead}>Danger zone</h3>
          <p className={styles.hint}>
            Reset wipes every event, session, crash group, bug report, alert rule, alert firing, and
            symbol artefact. Migrations + settings are preserved. This cannot be undone.
          </p>
          {confirmingReset ? (
            <div role="alertdialog" aria-label="Confirm reset" className={styles.confirmRow}>
              <span>Really wipe every row?</span>
              <button
                type="button"
                className={styles.danger}
                onClick={() => {
                  void handleReset();
                }}
                disabled={status === 'resetting'}
              >
                {status === 'resetting' ? 'Wiping…' : 'Yes, wipe it all'}
              </button>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => setConfirmingReset(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className={styles.danger}
              onClick={() => setConfirmingReset(true)}
            >
              Reset database
            </button>
          )}
        </section>
      </div>

      {feedback ? <p className={styles.success}>{feedback}</p> : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </Panel>
  );
}

function formatUptime(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
  if (seconds < 86_400) return `${Math.round(seconds / 3600)}h`;
  return `${Math.round(seconds / 86_400)}d`;
}
