import { useMemo, type ReactNode } from 'react';
import { createApiClient, type DashboardApiClient } from './client';
import { ApiContext } from './ApiContext';

export interface ApiProviderProps {
  client?: DashboardApiClient;
  baseUrl?: string;
  children: ReactNode;
}

/**
 * Makes the API client available to every hook under `useApi()`. Tests
 * can inject a mock via the `client` prop; production wraps the app with
 * a default client created from `baseUrl` (typically "").
 */
export function ApiProvider({ client, baseUrl, children }: ApiProviderProps) {
  const value = useMemo(
    () => client ?? createApiClient(baseUrl !== undefined ? { baseUrl } : {}),
    [client, baseUrl],
  );
  return <ApiContext.Provider value={value}>{children}</ApiContext.Provider>;
}
