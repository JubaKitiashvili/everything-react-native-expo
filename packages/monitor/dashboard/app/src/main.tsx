import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ApiProvider } from './shared/api/context';
import './tokens.css';
import './index.css';

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

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ApiProvider baseUrl="">
        <App />
      </ApiProvider>
    </QueryClientProvider>
  </StrictMode>,
);
