import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from '@/shared/api/context';
import { createApiClient } from '@/shared/api/client';
import { AuthProvider } from '@/shared/auth/AuthProvider';
import * as tokenStore from '@/shared/auth/tokenStore';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { AppRoutes } from '@/app/routes';
import { AnalyticsTracker, initAnalytics } from '@/shared/analytics';
import '@/tokens.css';
import '@/index.css';

// Privacy-first self-analytics — a no-op unless VITE_ANALYTICS_DOMAIN is set
// and Do Not Track is off. Reads the build-time env once here.
initAnalytics();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('[@erne/monitor] Dashboard root element #root missing from index.html');
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

/** `ws(s)://<host>/ws/subscribe` derived from the page origin. */
function realtimeUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws/subscribe`;
}

// Single API client wired to the token store: it attaches the Bearer JWT to
// every request and, on any 401, clears the token so AuthProvider logs out.
const apiClient = createApiClient({
  baseUrl: '',
  getToken: tokenStore.getToken,
  onUnauthorized: tokenStore.handleUnauthorized,
});

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider client={apiClient}>
        <AuthProvider>
          <RealtimeProvider url={realtimeUrl}>
            <BrowserRouter>
              <AnalyticsTracker />
              <AppRoutes />
            </BrowserRouter>
          </RealtimeProvider>
        </AuthProvider>
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
