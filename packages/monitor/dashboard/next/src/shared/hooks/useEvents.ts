import { useQuery } from '@tanstack/react-query';
import { useApi } from '../api/useApi';
import type { EventListFilter, EventRecord } from '../api/types';
import { queryKeys } from './queryKeys';

export interface UseEventsOptions {
  /** Override the default filter. Shallowly keyed into the cache. */
  filter?: EventListFilter;
  /** Override default staleness. Default 5s. */
  staleTime?: number;
  /** Disable the query (useful while filters are not ready). */
  enabled?: boolean;
}

export function useEvents(options: UseEventsOptions = {}) {
  const api = useApi();
  const filter = options.filter ?? {};
  return useQuery<EventRecord[]>({
    queryKey: queryKeys.events.list(filter),
    queryFn: () => api.fetchEvents(filter),
    staleTime: options.staleTime ?? 5_000,
    enabled: options.enabled ?? true,
  });
}
