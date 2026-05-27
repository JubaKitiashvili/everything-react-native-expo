import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useApi } from '@/shared/api/useApi';
import { queryKeys } from '@/shared/hooks/queryKeys';
import { RequireRole } from '@/shared/auth/RequireRole';
import { Timestamp } from '@/shared/ui/Timestamp/Timestamp';
import type { BugReportReply } from '@/shared/api/types';
import styles from './ReplyThread.module.css';

export interface ReplyThreadProps {
  reportId: string;
  now?: number;
}

/**
 * Task 117.20 — the bug report's two-way conversation. The thread is readable
 * by anyone with dashboard access; only Member+ sees the reply composer
 * (the server enforces the same on POST). Reporter messages arrive from the
 * SDK; operator messages are posted here.
 */
export function ReplyThread({ reportId, now }: ReplyThreadProps) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState('');

  const query = useQuery<BugReportReply[]>({
    queryKey: queryKeys.bugReports.replies(reportId),
    queryFn: () => api.fetchBugReportReplies(reportId),
    staleTime: 10_000,
  });

  const mutation = useMutation({
    mutationFn: (body: string) => api.addBugReportReply(reportId, body),
    onSuccess: () => {
      setDraft('');
      void queryClient.invalidateQueries({ queryKey: queryKeys.bugReports.replies(reportId) });
    },
  });

  const replies = query.data ?? [];

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const body = draft.trim();
    if (body.length === 0) return;
    mutation.mutate(body);
  };

  return (
    <section className={styles.thread} aria-label="Reply thread">
      <h4 className={styles.subhead}>Conversation</h4>

      {query.isPending ? (
        <p className={styles.muted}>Loading replies…</p>
      ) : replies.length === 0 ? (
        <p className={styles.muted}>No replies yet.</p>
      ) : (
        <ul className={styles.list}>
          {replies.map((reply) => (
            <li
              key={reply.id}
              className={[
                styles.bubble,
                reply.authorRole === 'operator' ? styles.operator : styles.reporter,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div className={styles.bubbleMeta}>
                <span className={styles.author}>
                  {reply.authorRole === 'operator' ? reply.author : 'Reporter'}
                </span>
                <Timestamp ts={reply.createdAt} {...(now !== undefined ? { now } : {})} />
              </div>
              <p className={styles.body}>{reply.body}</p>
            </li>
          ))}
        </ul>
      )}

      <RequireRole
        role="member"
        fallback={<p className={styles.muted}>Member access is required to reply.</p>}
      >
        <form className={styles.composer} onSubmit={onSubmit} aria-label="Reply form">
          <textarea
            className={styles.input}
            placeholder="Write a reply to the reporter…"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            aria-label="Reply body"
          />
          <button
            type="submit"
            className={styles.send}
            disabled={mutation.isPending || draft.trim().length === 0}
          >
            {mutation.isPending ? 'Sending…' : 'Reply'}
          </button>
        </form>
      </RequireRole>

      {mutation.isError ? (
        <p className={styles.error} role="alert">
          Could not send the reply.
        </p>
      ) : null}
    </section>
  );
}
