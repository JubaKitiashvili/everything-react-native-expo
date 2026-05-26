import { createContext, useContext } from 'react';
import type { RealtimeFrame } from '@/shared/realtime';

export type FrameHandler = (frame: RealtimeFrame) => void;

export interface RealtimeContextValue {
  /** Register a page-level frame handler. Returns an unsubscribe fn. */
  subscribe: (handler: FrameHandler) => () => void;
  /** Current number of live subscribers (introspection for tests/devtools). */
  getSubscriberCount: () => number;
}

export const RealtimeContext = createContext<RealtimeContextValue | null>(null);

/** Internal accessor — throws if used outside <RealtimeProvider>. */
export function useRealtimeContext(): RealtimeContextValue {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error(
      '[@erne/monitor] useRealtimeChannel must be used within a <RealtimeProvider>.',
    );
  }
  return ctx;
}
