import { type QueryClient } from '@tanstack/react-query';
import { queryKeys } from '../hooks/queryKeys';
import { type RealtimeFrame } from './RealtimeClient';

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
