import { useEffect, useRef } from 'react';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queryKeys';
import { useUiStore } from '../store/uiStore';
import { RealtimeClient, type RealtimeFrame, type RealtimeStatus } from './RealtimeClient';

export interface UseRealtimeOptions {
  /** `ws://host/ws/subscribe` URL. Accepts a factory for test injection. */
  url: string | (() => string);
  /** Disable wiring (e.g. SSR or when offline). */
  enabled?: boolean;
  /** Custom WebSocket ctor — tests inject a mock here. */
  webSocketImpl?: typeof WebSocket;
  /** Test hook: override the RealtimeClient (bypasses WS entirely). */
  clientImpl?: RealtimeClient;
}

/**
 * React hook: keeps a singleton `RealtimeClient` open for the lifetime
 * of the mounted component, invalidates the right query keys whenever
 * the server broadcasts, and mirrors socket status into the zustand
 * store so the header pill can render it without extra props.
 */
export function useRealtime(options: UseRealtimeOptions): void {
  const queryClient = useQueryClient();
  const setRealtimeStatus = useUiStore((s) => s.setRealtimeStatus);
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    if (options.enabled === false) return;

    const onFrame = (frame: RealtimeFrame) => handleFrame(frame, queryClient);
    const onStatus = (status: RealtimeStatus, error?: string) =>
      setRealtimeStatus(status, error ?? null);

    const client =
      options.clientImpl ??
      new RealtimeClient({
        url: options.url,
        onFrame,
        onStatus,
        ...(options.webSocketImpl ? { webSocketImpl: options.webSocketImpl } : {}),
      });
    clientRef.current = client;
    client.start();

    return () => {
      client.stop();
      clientRef.current = null;
    };
  }, [
    options.url,
    options.enabled,
    options.webSocketImpl,
    options.clientImpl,
    queryClient,
    setRealtimeStatus,
  ]);
}

/**
 * Pure frame → query invalidation mapper. Exported for unit tests so we
 * can prove the invalidation matrix without spinning up a React tree.
 */
export function handleFrame(frame: RealtimeFrame, queryClient: QueryClient): void {
  switch (frame.kind) {
    case 'event':
      queryClient.invalidateQueries({ queryKey: queryKeys.events.root() });
      queryClient.invalidateQueries({ queryKey: queryKeys.sessions.root() });
      if (frame.event.type === 'crash') {
        queryClient.invalidateQueries({ queryKey: queryKeys.crashGroups.root() });
      }
      return;
    case 'crash-group-update':
      queryClient.invalidateQueries({ queryKey: queryKeys.crashGroups.root() });
      return;
    case 'hello':
    case 'error':
      return;
  }
}
