import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import type { AlertFiringRecord, AlertHistoryFilter } from '../api/client';

export function alertHistoryQueryKey(filter: AlertHistoryFilter = {}) {
  return ['alert-history', filter] as const;
}

export function useAlertHistory(
  filter: AlertHistoryFilter = {},
  options: { staleTime?: number; enabled?: boolean } = {},
) {
  const api = useApi();
  return useQuery<AlertFiringRecord[]>({
    queryKey: alertHistoryQueryKey(filter),
    queryFn: () => api.fetchAlertHistory(filter),
    staleTime: options.staleTime ?? 10_000,
    enabled: options.enabled ?? true,
  });
}
