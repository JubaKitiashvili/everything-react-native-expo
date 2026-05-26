import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import type { CrashGroupRecord } from '../api/types';
import { queryKeys } from './queryKeys';

export function useCrashGroups(options: { staleTime?: number; enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<CrashGroupRecord[]>({
    queryKey: queryKeys.crashGroups.list(),
    queryFn: () => api.fetchCrashGroups(),
    staleTime: options.staleTime ?? 10_000,
    enabled: options.enabled ?? true,
  });
}
