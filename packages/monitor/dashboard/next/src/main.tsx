import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import { ApiProvider } from '@/shared/api/context';
import { RealtimeProvider } from '@/realtime/RealtimeProvider';
import { AppRoutes } from '@/app/routes';
import '@/tokens.css';
import '@/index.css';

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

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider baseUrl="">
        <RealtimeProvider url={realtimeUrl}>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </RealtimeProvider>
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
