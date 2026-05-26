import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  RealtimeClient,
  handleFrame,
  type RealtimeFrame,
  type RealtimeStatus,
} from '@/shared/realtime';
import { useUiStore } from '@/shared/store/uiStore';
import { RealtimeContext, type FrameHandler, type RealtimeContextValue } from './RealtimeContext';

export interface RealtimeProviderProps {
  /** `ws(s)://host/ws/subscribe` URL, or a factory returning it. */
  url: string | (() => string);
  /** Disable wiring (SSR / offline). */
  enabled?: boolean;
  /** Custom WebSocket ctor — tests inject a mock; browser uses the global. */
  webSocketImpl?: typeof WebSocket;
  children: ReactNode;
}

/**
 * Owns exactly ONE WebSocket for the whole app lifetime and multiplexes it
 * to any number of page-level subscribers.
 *
 * Why one socket: the server gates `/ws/subscribe`, and opening/closing a
 * socket on every navigation causes reconnect thrash. Instead the socket
 * stays warm and pages attach/detach lightweight handlers via
 * `useRealtimeChannel`. A page unmount (route change) removes its handler,
 * so there is **no listener leak** and **no socket churn** on navigation.
 *
 * On each frame the provider (1) runs the shared query-invalidation matrix
 * (`handleFrame`) so TanStack Query stays fresh, then (2) fans the frame
 * out to every registered subscriber.
 */
export function RealtimeProvider({
  url,
  enabled = true,
  webSocketImpl,
  children,
}: RealtimeProviderProps) {
  const queryClient = useQueryClient();
  const setRealtimeStatus = useUiStore((s) => s.setRealtimeStatus);
  const subscribersRef = useRef<Set<FrameHandler>>(new Set());

  // Stable identity — subscribe / getSubscriberCount never change, so
  // useRealtimeChannel's effect doesn't re-run (no churn) across renders.
  const value = useMemo<RealtimeContextValue>(
    () => ({
      subscribe: (handler) => {
        subscribersRef.current.add(handler);
        return () => {
          subscribersRef.current.delete(handler);
        };
      },
      getSubscriberCount: () => subscribersRef.current.size,
    }),
    [],
  );

  useEffect(() => {
    if (!enabled) return;

    const onFrame = (frame: RealtimeFrame) => {
      handleFrame(frame, queryClient);
      // Snapshot so a handler that unsubscribes mid-dispatch can't mutate
      // the set we're iterating.
      for (const subscriber of [...subscribersRef.current]) {
        try {
          subscriber(frame);
        } catch {
          // A single bad subscriber must not tear down the socket or the
          // other subscribers.
        }
      }
    };
    const onStatus = (status: RealtimeStatus, error?: string) =>
      setRealtimeStatus(status, error ?? null);

    const client = new RealtimeClient({
      url,
      onFrame,
      onStatus,
      ...(webSocketImpl ? { webSocketImpl } : {}),
    });
    client.start();

    return () => {
      client.stop();
    };
  }, [url, enabled, webSocketImpl, queryClient, setRealtimeStatus]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}
