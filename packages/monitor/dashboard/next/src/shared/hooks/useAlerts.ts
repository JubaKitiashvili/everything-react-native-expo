import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import type { AlertRuleRecord } from '../api/types';
import { queryKeys } from './queryKeys';

export function useAlerts(options: { staleTime?: number; enabled?: boolean } = {}) {
  const api = useApi();
  return useQuery<AlertRuleRecord[]>({
    queryKey: queryKeys.alertRules.list(),
    queryFn: () => api.fetchAlertRules(),
    staleTime: options.staleTime ?? 30_000,
    enabled: options.enabled ?? true,
  });
}
