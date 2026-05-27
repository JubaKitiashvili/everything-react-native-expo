import { useState } from 'react';
import { useApi } from '@/shared/api/useApi';
import type { CrashGroupRecord, EventRecord } from '@/shared/api/types';
import { buildAiContext } from './buildAiContext';
import styles from './AiSummary.module.css';

export interface AiSummaryProps {
  group: CrashGroupRecord;
  latestEvent?: EventRecord | null;
}

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'done'; text: string }
  | { status: 'error'; message: string };

const SYSTEM =
  'You are a senior React Native engineer. In 2-4 sentences, explain the likely root cause of this crash and the single highest-leverage fix. Be concrete; no preamble.';

/**
 * Task 117.9 — on-demand AI crash summary. Sends the same Claude-ready context
 * the "Copy" button produces through the server AI fallback
 * (`POST /api/ai/complete`). When the server has no provider configured it
 * surfaces a clear "not configured" hint rather than an error.
 *
 * 🟡 In-browser WebLLM (WASM/WebGPU) acceleration — running the model locally
 * with no server round-trip — is a follow-on: it needs WebGPU and can't be
 * verified headlessly, so this component uses the server fallback today.
 */
export function AiSummary({ group, latestEvent }: AiSummaryProps) {
  const api = useApi();
  const [state, setState] = useState<State>({ status: 'idle' });

  const summarize = async () => {
    setState({ status: 'loading' });
    try {
      const text = await api.aiComplete(buildAiContext({ group, latestEvent }), {
        system: SYSTEM,
        maxTokens: 400,
      });
      setState({ status: 'done', text });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setState({
        status: 'error',
        message:
          message === 'not_configured'
            ? 'AI summaries aren’t configured on this server. Use “Copy AI context” instead.'
            : 'Couldn’t generate a summary. Try again, or use “Copy AI context”.',
      });
    }
  };

  return (
    <section className={styles.box} aria-label="AI summary">
      <div className={styles.row}>
        <h4 className={styles.heading}>AI summary</h4>
        <button
          type="button"
          className={styles.button}
          onClick={() => void summarize()}
          disabled={state.status === 'loading'}
        >
          {state.status === 'loading' ? 'Summarizing…' : 'Summarize with AI'}
        </button>
      </div>
      {state.status === 'done' ? <p className={styles.text}>{state.text}</p> : null}
      {state.status === 'error' ? (
        <p className={styles.error} role="alert">
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
