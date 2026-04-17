import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import type { SessionRecord } from '../api/types';
import { queryKeys } from './queryKeys';

export function useSessions(options: { staleTime?: number; enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<SessionRecord[]>({
    queryKey: queryKeys.sessions.list(),
    queryFn: () => api.fetchSessions(),
    staleTime: options.staleTime ?? 10_000,
    enabled: options.enabled ?? true,
  });
}
