import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import type { BugReportRecord } from '../api/types';
import { queryKeys } from './queryKeys';

export function useBugReports(options: { staleTime?: number; enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<BugReportRecord[]>({
    queryKey: queryKeys.bugReports.list(),
    queryFn: () => api.fetchBugReports(),
    staleTime: options.staleTime ?? 15_000,
    enabled: options.enabled ?? true,
  });
}
