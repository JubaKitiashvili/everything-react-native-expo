import { useContext } from 'react';
import { ApiContext } from './ApiContext';
import type { DashboardApiClient } from './client';

/**
 * Resolve the API client from the nearest `<ApiProvider>`. Throws a
 * clear error if called outside the provider — better than a null-
 * reference later inside `useQuery`.
 */
export function useApi(): DashboardApiClient {
  const client = useContext(ApiContext);
  if (!client) {
    throw new Error(
      '[@erne/monitor] useApi() must be used inside <ApiProvider>. Wrap the app tree in main.tsx.',
    );
  }
  return client;
}
